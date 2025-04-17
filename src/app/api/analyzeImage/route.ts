import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import crypto from 'crypto';
import { adminStorage } from '@/lib/firebaseAdmin';
import { trySaveMealServer } from '@/lib/serverMealUtils';
import { createAnalysisResponse, createEmptyFallbackAnalysis, createErrorResponse } from './analyzer';
import { isValidAnalysis, createFallbackAnalysis, normalizeAnalysisResult } from '@/lib/utils/analysisValidator';
import { safeExtractImage } from '@/lib/imageProcessing/safeExtractImage';

// Placeholder image for development fallback
const PLACEHOLDER_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// Trigger new Vercel deployment - 15 Apr 2025
// Request concurrency tracking
let activeRequests = 0;
const requestStartTimes = new Map<string, number>();
const MAX_CONCURRENT_REQUESTS = 10; // Limit concurrent requests for stability

// Image quality assessment utilities
interface ImageQualityResult {
  isValid: boolean;
  warning?: string;
  reason?: string;
}

// Function to check if an image is likely to be too low quality for good analysis
function assessImageQuality(base64Image: string, requestId: string): ImageQualityResult {
  console.log(`[${requestId}] Assessing image quality...`);
  
  // Check for extremely small images (likely to be problematic)
  if (base64Image.length < 1000) {
    return {
      isValid: false,
      warning: "Image appears to be extremely small or corrupt",
      reason: "too_small"
    };
  }
  
  // More sophisticated image quality checks could be added here using libraries
  // like sharp or canvas, but these would require additional dependencies
  
  // For now, we'll do a basic size check and return valid for most images
  console.log(`[${requestId}] Image quality check passed`);
  return { isValid: true };
}

// Function to determine if an analysis result has low confidence
function isLowConfidenceAnalysis(analysis: any): boolean {
  if (!analysis) return false;
  
  // Check if explicitly marked as low confidence by previous processing
  if (analysis.lowConfidence === true) return true;
  
  // Check overall confidence score
  if (typeof analysis.confidence === 'number' && analysis.confidence < 5) {
    return true;
  }
  
  // Check if the detailedIngredients have low average confidence
  if (analysis.detailedIngredients && analysis.detailedIngredients.length > 0) {
    const totalConfidence = analysis.detailedIngredients.reduce(
      (sum: number, ingredient: any) => sum + (ingredient.confidence || 0), 
      0
    );
    const avgConfidence = totalConfidence / analysis.detailedIngredients.length;
    
    if (avgConfidence < 5) {
      return true;
    }
    
    // Check if majority of ingredients have low confidence
    const lowConfidenceCount = analysis.detailedIngredients.filter(
      (i: any) => i.confidence < 5
    ).length;
    
    if (lowConfidenceCount > analysis.detailedIngredients.length / 2) {
      return true;
    }
  }
  
  // Check if there are reported image challenges
  if (analysis.imageChallenges && analysis.imageChallenges.length > 0) {
    return true;
  }
  
  return false;
}

// Function to extract base64 from FormData image
async function extractBase64Image(formData: any, requestId: string = 'unknown'): Promise<string> {
  console.time(`⏱️ [${requestId}] extractBase64Image`);
  
  try {
    // Safety check - ensure formData is valid
    if (!formData) {
      console.warn(`⚠️ [${requestId}] Input is null or undefined`);
      console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
      throw new Error('No input provided for image extraction');
    }
    
    // Get the file from FormData or use the input directly based on type
    let rawFile = null;
    
    if (typeof formData === 'object' && 'get' in formData && typeof formData.get === 'function') {
      // It's FormData, try to get both 'file' and 'image' fields
      rawFile = formData.get('file') || formData.get('image') || null;
    } else {
      // It's not FormData, use it directly
      rawFile = formData;
    }
    
    // Enhanced debug logging for the file
    const fileInfo = {
      type: typeof rawFile,
      constructor: rawFile?.constructor?.name || 'undefined',
      isNull: rawFile === null,
      isUndefined: rawFile === undefined,
      hasProperties: rawFile ? Object.keys(Object(rawFile)).slice(0, 20) : [],
      isFormDataEntryValue: rawFile !== null && 
                          rawFile !== undefined && 
                          typeof rawFile === 'object' && 
                          'size' in Object(rawFile)
    };
    
    console.log(`📝 [${requestId}] Image file info:`, JSON.stringify(fileInfo, null, 2));
    
    // Early exit if no file is provided
    if (!rawFile) {
      console.warn(`⚠️ [${requestId}] No image file provided in input`);
      console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
      throw new Error('No image file provided in input');
    }
    
    // Try to determine the file type and size
    let fileType: string = 'unknown';
    let fileSize: number = 0;
    
    // Try to access common properties based on file type
    try {
      const fileAny = rawFile as any;
      
      if (fileAny && typeof fileAny === 'object') {
        // Extract type if available
        if (fileAny.type) {
          fileType = String(fileAny.type);
        }
        
        // Extract size if available
        if (fileAny.size !== undefined) {
          fileSize = Number(fileAny.size);
          
          // Additional validation for empty files
          if (fileSize === 0) {
            console.warn(`⚠️ [${requestId}] File has zero size`);
            console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
            throw new Error('Empty file (zero bytes)');
          }
        }
        
        // For File objects, log name and last modified if available
        if (fileAny.name) {
          console.log(`📄 [${requestId}] File name:`, String(fileAny.name));
        }
        
        if (fileAny.lastModified) {
          try {
            const lastModified = new Date(Number(fileAny.lastModified)).toISOString();
            console.log(`🕒 [${requestId}] Last modified:`, lastModified);
          } catch (dateError) {
            // Ignore date parsing errors
          }
        }
      }
    } catch (propError) {
      console.warn(`⚠️ [${requestId}] Error getting file properties:`, propError);
      // Continue - don't throw since we can still try conversion methods
    }
    
    console.log(`📝 [${requestId}] File details - Type: ${fileType}, Size: ${fileSize} bytes`);
    
    // Validate image type if available (but don't throw on non-image, just warn)
    if (fileType !== 'unknown' && !fileType.startsWith('image/')) {
      console.warn(`⚠️ [${requestId}] Unexpected file type: ${fileType}. Expected an image.`);
    }
    
    // Convert the file to base64 using different methods depending on the file type
    let buffer: Buffer | null = null;
    const conversionSteps: string[] = [];
    const conversionErrors: string[] = [];
    
    // Handle File or Blob with arrayBuffer method
    if (!buffer && rawFile && typeof rawFile === 'object' && 'arrayBuffer' in rawFile && typeof rawFile.arrayBuffer === 'function') {
      conversionSteps.push('Converting File/Blob using arrayBuffer');
      try {
        const bytes = await rawFile.arrayBuffer();
        if (bytes && bytes.byteLength > 0) {
          // Safely create buffer - wrap in try/catch to prevent crashes
          try {
            buffer = Buffer.from(new Uint8Array(bytes));
            console.log(`✓ [${requestId}] Successfully converted using arrayBuffer (${bytes.byteLength} bytes)`);
          } catch (bufferError: any) {
            conversionErrors.push(`Buffer.from error: ${bufferError.message || 'unknown error'}`);
            console.warn(`⚠️ [${requestId}] Failed to create Buffer from Uint8Array:`, bufferError);
          }
        } else {
          conversionErrors.push('arrayBuffer method returned empty bytes');
          console.warn(`⚠️ [${requestId}] arrayBuffer method returned empty bytes`);
        }
      } catch (arrayBufferError: any) {
        conversionErrors.push(`arrayBuffer error: ${arrayBufferError.message || 'unknown error'}`);
        console.warn(`⚠️ [${requestId}] arrayBuffer method failed:`, arrayBufferError);
        // Continue to next method
      }
    }
    
    // If still no buffer, try other methods or fallback
    if (!buffer) {
      console.warn(`⚠️ [${requestId}] Failed to convert image using standard methods`);
      console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
      throw new Error('Failed to convert image to base64');
    }
    
    // Convert buffer to base64
    const base64 = buffer.toString('base64');
    const mimeType = fileType !== 'unknown' ? fileType : 'image/jpeg'; // Default to jpeg if unknown
    const base64Image = `data:${mimeType};base64,${base64}`;
    
    console.log(`✅ [${requestId}] Successfully extracted base64 image (${base64Image.length} chars)`);
    console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
    return base64Image;
  } catch (error) {
    console.error(`❌ [${requestId}] Failed to extract base64 image:`, error);
    console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
    throw error;
  }
}

// Function to upload the image to Firebase Storage using Admin SDK
async function uploadImageToFirebase(base64Image: string, userId: string, requestId: string): Promise<string | null> {
  // Ensure there's a valid image and userId
  if (!base64Image || !userId) {
    console.error(`❌ [${requestId}] Missing image data or userId for Firebase upload`);
    return null;
  }
  
  console.time(`⏱️ [${requestId}] uploadImageToFirebase`);
  console.log(`🔄 [${requestId}] Uploading image to Firebase for user ${userId}`);
  
  try {
    // Generate a unique filename
    const filename = `${userId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.jpg`;
    const imagePath = `uploads/${userId}/${filename}`;
    
    // Remove the data:image/xyz;base64, prefix if present
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
    
    // Safely create buffer - wrap in try/catch to prevent crashes
    let buffer: Buffer;
    try {
      buffer = Buffer.from(base64Data, 'base64');
      
      // Validate the buffer has actual content
      if (!buffer || buffer.length === 0) {
        console.error(`❌ [${requestId}] Created buffer is empty or invalid`);
        return null;
      }
    } catch (bufferError) {
      console.error(`❌ [${requestId}] Failed to create buffer from base64 data:`, bufferError);
      return null;
    }
    
    // Upload to Firebase Storage using Admin SDK
    const bucket = adminStorage.bucket();
    
    // Validate bucket exists
    if (!bucket) {
      console.error(`❌ [${requestId}] Firebase Storage bucket is not available`);
      return null;
    }
    
    const file_ref = bucket.file(imagePath);
    
    // Upload options
    const options = {
      metadata: {
        contentType: 'image/jpeg',
        metadata: {
          createdBy: 'api',
          userId: userId,
          uploadedAt: new Date().toISOString()
        }
      }
    };
    
    await file_ref.save(buffer, options);
    
    // Get signed URL for download
    const [url] = await file_ref.getSignedUrl({
      action: 'read',
      expires: '03-01-2500', // Far future expiration
    });
    
    console.log(`✅ [${requestId}] Image uploaded successfully: ${url.substring(0, 50)}...`);
    console.timeEnd(`⏱️ [${requestId}] uploadImageToFirebase`);
    return url;
  } catch (error) {
    console.error(`❌ [${requestId}] Failed to upload image to Firebase:`, error);
    console.timeEnd(`⏱️ [${requestId}] uploadImageToFirebase`);
    return null;
  }
}

// Mock implementation for backward compatibility during migration
async function analyzeImageWithGPT4V(
  base64Image: string,
  healthGoals: string[] = [],
  dietaryPreferences: string[] = [],
  requestId: string
): Promise<any> {
  console.log(`[${requestId}] Analyzing image with GPT-4V...`);
  
  // Get OpenAI API key from environment
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  
  if (!OPENAI_API_KEY) {
    console.error(`[${requestId}] OpenAI API key is not configured`);
    throw new Error('OpenAI API key is not configured');
  }

  // Set up for retry logic
  let attempt = 1;
  const MAX_ATTEMPTS = 2;
  let lastError: Error | null = null;
  let rawGptResponse: any = null;
  
  // Parse the health goals into a string
  const healthGoalString = healthGoals && healthGoals.length > 0 
    ? healthGoals.join(', ') 
    : 'general nutrition';

  while (attempt <= MAX_ATTEMPTS) {
    try {
      console.log(`[${requestId}] GPT-4V attempt ${attempt} starting...`);
      
      // Create an AbortController for timeout management
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        console.error(`[${requestId}] OpenAI request aborted due to timeout (30s)`);
      }, 30000); // 30 second timeout to stay within Vercel's limits

      // Configure system prompt based on attempt
      const primarySystemPrompt = `You are a nutrition-focused food analysis expert. Analyze this food image and provide detailed information.
Focus specifically on:
1. What foods are visible in the image
2. The main nutritional components (protein, carbs, fat, calories)
3. Health impact relative to the user's goals: ${healthGoalString}

CRITICAL REQUIREMENT: Return ONLY properly formatted JSON data. No explanations, no markdown, no text outside of the JSON object.
For unclear or low-quality images, make your best educated guess based on visible elements.`;

      const fallbackSystemPrompt = attempt === 1 ? primarySystemPrompt 
        : `You are a nutrition expert analyzing a food image. This may be a low-quality or difficult image.
Make your best attempt to identify the foods and provide nutritional estimates.

Even with limited visual information, please:
1. Identify ANY possible food items based on shapes, colors, and context
2. Provide reasonable nutritional estimates even if uncertain
3. Never refuse to analyze - always provide your best guess with appropriate confidence levels
4. STRICT REQUIREMENT: Return ONLY valid JSON with ALL required fields - description and nutrients must be present
5. DO NOT include any explanations or text outside the JSON structure

The user's health goals are: ${healthGoalString}`;

      console.log(`[${requestId}] Using ${attempt === 1 ? 'primary' : 'fallback'} prompt for health goals: ${healthGoalString}`);
      
      // Configure request
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      };
      
      const jsonFormat = `{
  "description": "A clear description of the meal and visible food items",
  "nutrients": {
    "calories": "estimated calories (numeric value or range)",
    "protein": "estimated protein in grams (numeric value or range)",
    "carbs": "estimated carbs in grams (numeric value or range)",
    "fat": "estimated fat in grams (numeric value or range)"
  },
  "feedback": ["suggestion about this meal", "another suggestion"],
  "suggestions": ["improvement idea", "another improvement idea"],
  "goalScore": 7,
  "healthImpact": "How this meal impacts the user's stated health goals"
}`;
      
      const promptText = `${fallbackSystemPrompt}

Return ONLY valid JSON that can be parsed with JSON.parse(). Use this exact format:
${jsonFormat}

STRICT REQUIREMENTS:
1. ALL fields in the JSON structure are required - missing ANY field will cause critical system failure
2. The "description" must be a clear text description of all visible food items
3. The "nutrients" object MUST include calories, protein, carbs, and fat - all are required
4. Values can include ranges (e.g., "300-350") if exact estimation is difficult
5. Feedback and suggestions arrays must be present (at least one item in each)
6. goalScore must be a number between 1-10
7. DO NOT include any explanatory text outside the JSON structure
8. DO NOT use markdown formatting or code blocks - return the raw JSON only
9. Your entire response must be valid JSON only, no prefixes or suffixes

If the image is unclear, provide your best estimates for ALL fields - do not omit any required fields.
This is CRITICAL: The system CANNOT handle missing fields.`;

      const requestPayload = {
        model: "gpt-4-vision-preview",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: promptText },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                  detail: "high"
                }
              }
            ]
          }
        ],
        max_tokens: 1000,
        temperature: attempt === 1 ? 0.3 : 0.5,  // Higher temperature on retry for more creativity
        response_format: { type: "json_object" }  // Force JSON response
      };
      
      const startTime = Date.now();
      
      try {
        // Make the API request
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers,
          body: JSON.stringify(requestPayload),
          signal: controller.signal
        });
        
        // Clear the timeout since the request completed
        clearTimeout(timeoutId);
        
        // Check for API errors
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[${requestId}] OpenAI API Error Status:`, response.status);
          console.error(`[${requestId}] OpenAI API Error Response:`, errorText);
          
          lastError = new Error(`OpenAI API Error (attempt ${attempt}): ${response.status} ${response.statusText}`);
          attempt++;
          continue;
        }
        
        // Parse the response
        const responseData = await response.json();
        console.log(`[${requestId}] GPT-4V Analysis Complete in ${(Date.now() - startTime) / 1000}s`);
        
        // Validate response structure
        if (!responseData.choices?.[0]?.message?.content) {
          console.error(`[${requestId}] Invalid OpenAI response structure:`, JSON.stringify(responseData));
          lastError = new Error(`Invalid response structure from OpenAI API (attempt ${attempt})`);
          attempt++;
          continue;
        }
        
        // Get the raw content
        const content = responseData.choices[0].message.content;
        
        // Log raw GPT response for debugging
        console.log(`[${requestId}] RAW GPT RESPONSE:`, content);
        rawGptResponse = content;
        
        // Enhanced JSON extraction - Try multiple approaches to parse the JSON
        let parsedResult = extractJSONFromText(content, requestId);
          
        // If parsing failed and this is the first attempt, retry
        if (!parsedResult && attempt === 1) {
          console.log(`[${requestId}] JSON parsing failed on first attempt, retrying with more explicit instructions...`);
          lastError = new Error(`Failed to parse JSON response on attempt ${attempt}`);
          attempt++;
          continue;
        }
        
        // If we still couldn't parse JSON after all attempts, create a fallback response
        if (!parsedResult) {
          console.error(`[${requestId}] Failed to parse GPT-4V response as JSON after ${MAX_ATTEMPTS} attempts`);
          return {
            success: false,
            fallback: true,
            result: createEmptyFallbackAnalysis(),
            error: `Failed to parse JSON response after ${MAX_ATTEMPTS} attempts`,
            rawResponse: content
          };
        }

        // Validate and normalize parsed result
        parsedResult = normalizeAnalysisResult(parsedResult);
        
        // Validate required fields exist - enhanced validation
        if (!validateRequiredFields(parsedResult)) {
          if (attempt === 1) {
            console.log(`[${requestId}] Required fields missing in first attempt, retrying...`);
            lastError = new Error(`Missing required fields in GPT-4V response (attempt ${attempt})`);
            attempt++;
            continue;
          } else {
            console.error(`[${requestId}] Required fields missing after ${MAX_ATTEMPTS} attempts`);
            return {
              success: false,
              fallback: true,
              result: createEmptyFallbackAnalysis(),
              error: `Missing required fields in GPT-4V response after ${MAX_ATTEMPTS} attempts`,
              rawResponse: content
            };
          }
        }
        
        // Standardize numeric values that might be returned as numbers
        parsedResult = standardizeNutrientValues(parsedResult);
        
        // Return the validated and parsed result
        return {
          success: true,
          result: parsedResult,
          rawResponse: content
        };
        
      } catch (fetchError) {
        // Clear the timeout if it hasn't fired yet
        clearTimeout(timeoutId);
        
        console.error(`[${requestId}] Network error during GPT-4V request:`, fetchError);
        lastError = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
        
        // Retry on network errors
        attempt++;
        continue;
      }
    } catch (error) {
      console.error(`[${requestId}] Error during GPT-4V analysis:`, error);
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Retry on any errors
      attempt++;
      continue;
    }
  }

  // If we get here, all attempts failed
  console.error(`[${requestId}] All ${MAX_ATTEMPTS} attempts to analyze with GPT-4V failed`);
  
  // Include raw response for debugging if available
  return {
    success: false,
    fallback: true,
    result: createEmptyFallbackAnalysis(),
    error: lastError?.message || "Unknown error during image analysis",
    rawResponse: rawGptResponse
  };
}

/**
 * Extracts JSON from possibly malformed text that might contain markdown or other formatting
 */
function extractJSONFromText(text: string, requestId: string): any | null {
  if (!text || typeof text !== 'string') {
    console.error(`[${requestId}] Text to extract JSON from is empty or not a string`);
    return null;
  }

  // First try: simple JSON.parse if it's already valid JSON
  try {
    return JSON.parse(text);
  } catch (e) {
    console.log(`[${requestId}] Initial JSON.parse failed, trying alternative extraction methods`);
  }
  
  // Second try: Look for JSON between code blocks or backticks
  try {
    // Try to extract JSON from markdown code blocks
    const codeBlockMatch = text.match(/```(?:json)?([\s\S]*?)```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      const jsonContent = codeBlockMatch[1].trim();
      console.log(`[${requestId}] Found JSON in code block, attempting to parse`);
      return JSON.parse(jsonContent);
    }
  } catch (e) {
    console.log(`[${requestId}] Code block extraction failed:`, e);
  }
  
  // Third try: Look for anything that looks like a JSON object
  try {
    const possibleJson = text.match(/(\{[\s\S]*\})/);
    if (possibleJson && possibleJson[1]) {
      const jsonContent = possibleJson[1].trim();
      console.log(`[${requestId}] Found possible JSON object, attempting to parse`);
      return JSON.parse(jsonContent);
    }
  } catch (e) {
    console.log(`[${requestId}] Object extraction failed:`, e);
  }
  
  // Final attempt: Aggressive cleaning - remove all non-JSON characters
  try {
    // Remove any non-JSON characters at the beginning of the string
    let cleanedText = text.replace(/^[^{]*/, '');
    
    // Remove any non-JSON characters at the end of the string
    cleanedText = cleanedText.replace(/[^}]*$/, '');
    
    // Try to parse the cleaned text
    if (cleanedText.startsWith('{') && cleanedText.endsWith('}')) {
      console.log(`[${requestId}] Attempting to parse aggressively cleaned text`);
      return JSON.parse(cleanedText);
    }
  } catch (e) {
    console.log(`[${requestId}] Aggressive cleaning failed:`, e);
  }
  
  console.error(`[${requestId}] All JSON extraction methods failed`);
  return null;
}

/**
 * Validates that all required fields exist in the analysis
 */
function validateRequiredFields(result: any): boolean {
  if (!result || typeof result !== 'object') {
    return false;
  }
  
  // Check for required string fields
  if (typeof result.description !== 'string' || !result.description.trim()) {
    return false;
  }
  
  // Check for required nutrients object
  if (!result.nutrients || typeof result.nutrients !== 'object') {
    return false;
  }
  
  // Check for required nutrient fields
  const nutrients = result.nutrients;
  if (!('calories' in nutrients) || 
      !('protein' in nutrients) || 
      !('carbs' in nutrients) || 
      !('fat' in nutrients)) {
    return false;
  }
  
  // Check for required array fields
  if (!Array.isArray(result.feedback) || result.feedback.length === 0) {
    return false;
  }
  
  if (!Array.isArray(result.suggestions) || result.suggestions.length === 0) {
    return false;
  }
  
  // Check for goalScore
  if (typeof result.goalScore !== 'number') {
    return false;
  }
  
  return true;
}

// Helper function to standardize nutrient values
function standardizeNutrientValues(result: any): any {
  if (!result || !result.nutrients) return result;
  
  const nutrients = result.nutrients;
  
  // Convert any numeric-only values to strings
  Object.keys(nutrients).forEach(key => {
    if (typeof nutrients[key] === 'number') {
      nutrients[key] = nutrients[key].toString();
    }
  });
  
  return result;
}

// Mock implementation for backward compatibility during migration
function needsConfidenceEnrichment(analysis: any): boolean {
  return false;
}

// Mock implementation for backward compatibility during migration
async function enrichAnalysisResult(
  originalResult: any,
  healthGoals: string[],
  dietaryPreferences: string[],
  requestId: string
): Promise<any> {
  return originalResult;
}

// Mock implementation for backward compatibility during migration
function validateGptAnalysisResult(analysis: any): boolean {
  if (!analysis) return false;
  
  // Check for required top-level fields
  const requiredFields = [
    'description', 
    'nutrients', 
    'feedback', 
    'suggestions', 
    'detailedIngredients'
  ];
  
  for (const field of requiredFields) {
    if (!analysis[field]) {
      console.warn(`Analysis validation failed: missing '${field}'`);
      return false;
    }
  }
  
  // Check nutrients structure if present
  const requiredNutrients = [
    'calories', 'protein', 'carbs', 'fat'
  ];
  
  if (analysis.nutrients) {
    for (const nutrient of requiredNutrients) {
      if (typeof analysis.nutrients[nutrient] !== 'number') {
        console.warn(`Analysis validation failed: missing or invalid nutrient '${nutrient}'`);
        return false;
      }
    }
  }
  
  // Ensure arrays are present
  const requiredArrays = ['feedback', 'suggestions', 'detailedIngredients'];
  for (const arrayField of requiredArrays) {
    if (!Array.isArray(analysis[arrayField])) {
      console.warn(`Analysis validation failed: '${arrayField}' is not an array`);
      return false;
    }
  }
  
  return true;
}

// Mock implementation for backward compatibility during migration
function createFallbackResponse(reason: string, partialResult: any): any {
  return createEmptyFallbackAnalysis();
}

// The main POST handler for image analysis
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Generate a unique request ID for tracing this request through logs
  const requestId = Math.random().toString(36).substring(2, 10);
  console.time(`⏱️ [${requestId}] Total API execution time`);
  console.log(`✨ [${requestId}] Starting /api/analyzeImage POST request`);
  
  // Initialize response object we'll build throughout the process
  const responseData: any = {
    status: 200,
    success: false,
    requestId,
    message: 'Analysis starting',
    errors: [],
    debug: {
      requestId,
      timestamps: {
        start: new Date().toISOString(),
        imageProcessed: null,
        analysisCompleted: null,
        enrichmentCompleted: null,
        end: null
      },
      processingSteps: [],
      conversionMethod: null,
      errorDetails: [],
      rawGptResponse: null
    },
    _meta: {
      imageError: null  // Add this to track image-related errors
    }
  };
  
  try {
    // Validate request content type
    const contentType = request.headers.get('content-type');
    if (!contentType) {
      const error = 'Missing Content-Type header';
      responseData.errors.push(error);
      responseData.message = error;
      return createAnalysisResponse(responseData);
    }
    
    // Parse request data
    let requestData: FormData | null = null;
    let jsonData: any = null;
    let rawFile: any = null;
    let userId: string = '';
    let healthGoals: string[] = [];
    let dietaryPreferences: string[] = [];
    let mealName: string = '';
    
    if (contentType.includes('multipart/form-data')) {
      try {
        requestData = await request.formData();
        
        // Check if the 'image' field exists and is not null/empty
        if (!requestData.has('image') || !requestData.get('image')) {
          console.warn(`⚠️ [${requestId}] No image field in form data`);
          return NextResponse.json({ 
            _meta: { 
              success: false, 
              imageError: 'No image uploaded',
              requestId
            },
            analysis: createEmptyFallbackAnalysis()
          }, { status: 200 });
        }
        
        rawFile = requestData?.get('file') || requestData?.get('image') || null;
        userId = (requestData?.get('userId') || '').toString();
        mealName = (requestData?.get('mealName') || '').toString();
        
        // Parse health goals and dietary preferences
        const goalsParam = requestData?.get('healthGoals');
        if (goalsParam && typeof goalsParam === 'string') {
          try {
            healthGoals = JSON.parse(goalsParam);
          } catch {
            healthGoals = goalsParam.split(',').map(g => g.trim()).filter(Boolean);
          }
        }
        
        const dietParam = requestData?.get('dietaryPreferences');
        if (dietParam && typeof dietParam === 'string') {
          try {
            dietaryPreferences = JSON.parse(dietParam);
          } catch {
            dietaryPreferences = dietParam.split(',').map(d => d.trim()).filter(Boolean);
          }
        }
      } catch (error) {
        const errorMessage = `Failed to parse form data: ${error instanceof Error ? error.message : 'Unknown error'}`;
        responseData.errors.push(errorMessage);
        responseData.message = errorMessage;
        responseData._meta.imageError = errorMessage;
        return createAnalysisResponse({
          ...responseData,
          success: false,
          fallback: true,
          analysis: createEmptyFallbackAnalysis()
        });
      }
    } else if (contentType.includes('application/json')) {
      try {
        jsonData = await request.json();
        if (jsonData && typeof jsonData === 'object') {
          // Check if the image field exists and is not null/empty
          if (!jsonData.file && !jsonData.image && !jsonData.base64Image) {
            console.warn(`⚠️ [${requestId}] No image data in JSON payload`);
            return NextResponse.json({ 
              _meta: { 
                success: false, 
                imageError: 'No image uploaded',
                requestId
              },
              analysis: createEmptyFallbackAnalysis()
            }, { status: 200 });
          }
          
          rawFile = jsonData.file || jsonData.image || jsonData.base64Image || null;
          userId = jsonData.userId || '';
          mealName = jsonData.mealName || '';
          healthGoals = Array.isArray(jsonData.healthGoals) ? jsonData.healthGoals : [];
          dietaryPreferences = Array.isArray(jsonData.dietaryPreferences) ? jsonData.dietaryPreferences : [];
        } else {
          const error = 'Invalid JSON structure';
          responseData.errors.push(error);
          responseData.message = error;
          responseData._meta.imageError = error;
          return createAnalysisResponse({
            ...responseData,
            success: false,
            fallback: true,
            analysis: createEmptyFallbackAnalysis()
          });
        }
      } catch (error) {
        const errorMessage = `Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`;
        responseData.errors.push(errorMessage);
        responseData.message = errorMessage;
        responseData._meta.imageError = errorMessage;
        return createAnalysisResponse({
          ...responseData,
          success: false,
          fallback: true,
          analysis: createEmptyFallbackAnalysis()
        });
      }
    } else {
      const error = `Unsupported content type: ${contentType}`;
      responseData.errors.push(error);
      responseData.message = error;
      responseData._meta.imageError = error;
      return createAnalysisResponse({
        ...responseData,
        success: false,
        fallback: true,
        analysis: createEmptyFallbackAnalysis()
      });
    }
    
    // Validate required parameters
    if (!rawFile) {
      const error = 'No image file provided';
      responseData.errors.push(error);
      responseData.message = error;
      responseData._meta.imageError = error;
      
      console.error(`❌ [${requestId}] ${error}`);
      return createAnalysisResponse({
        ...responseData,
        success: false,
        fallback: true,
        analysis: createEmptyFallbackAnalysis()
      });
    }
    
    // Additional validation for empty/invalid file objects
    if ((typeof rawFile === 'object' && 'size' in rawFile && rawFile.size === 0) ||
        (typeof rawFile === 'string' && rawFile.length < 10)) {
      const error = 'Empty or invalid image file provided';
      responseData.errors.push(error);
      responseData.message = error;
      responseData._meta.imageError = error;
      
      console.error(`❌ [${requestId}] ${error}`);
      return createAnalysisResponse({
        ...responseData,
        success: false,
        fallback: true,
        analysis: createEmptyFallbackAnalysis()
      });
    }
    
    // Extract base64 image
    let base64Image: string;
    try {
      base64Image = await extractBase64Image(rawFile, requestId);
      responseData.debug.processingSteps.push('Image data extracted successfully');
      
      // Add validation for empty base64 result
      if (!base64Image) {
        const error = 'Image extraction returned empty result';
        responseData.errors.push(error);
        responseData.message = error;
        responseData._meta.imageError = error;
        
        console.error(`❌ [${requestId}] ${error}`);
        return createAnalysisResponse({
          ...responseData,
          success: false,
          fallback: true,
          analysis: createEmptyFallbackAnalysis()
        });
      }
    } catch (error) {
      const errorMessage = `Image extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      responseData.errors.push(errorMessage);
      responseData.message = 'Failed to process image';
      responseData._meta.imageError = errorMessage;
      
      console.error(`❌ [${requestId}] ${errorMessage}`);
      return createAnalysisResponse({
        ...responseData,
        success: false,
        fallback: true,
        analysis: createEmptyFallbackAnalysis()
      });
    }
    
    // Upload image to Firebase if we have a user ID
    let imageUrl: string | null = null;
    if (userId && base64Image) {
      try {
        imageUrl = await uploadImageToFirebase(base64Image, userId, requestId);
        if (imageUrl) {
          responseData.debug.processingSteps.push('Image uploaded successfully');
        } else {
          responseData.debug.processingSteps.push('Image upload failed, continuing with analysis only');
        }
      } catch (error) {
        console.error(`❌ [${requestId}] Firebase upload error:`, error);
        responseData.debug.processingSteps.push('Image upload failed, continuing with analysis only');
        // Continue with analysis even if upload fails
      }
    }
    
    // Call the GPT-4-Vision model to analyze the image
    console.log(`🚀 [${requestId}] Calling analyzeImageWithGPT4V...`);
    const gptResult = await analyzeImageWithGPT4V(
      base64Image,
      healthGoals,
      dietaryPreferences,
      requestId
    );

    // Log the raw GPT response status (success/failure and model info)
    console.log(`📊 [${requestId}] GPT Analysis complete - Success: ${gptResult.success}, Model: ${gptResult.modelUsed}${gptResult.usedFallbackModel ? ' (fallback)' : ''}${gptResult.forceGPT4V ? ' (forced)' : ''}`);
    
    // Add model information to the debug info
    responseData.debug.modelUsed = gptResult.modelUsed;
    responseData.debug.usedFallbackModel = gptResult.usedFallbackModel;
    responseData.debug.forceGPT4V = gptResult.forceGPT4V;
    
    // If there was an error with the analysis, log it in detail
    if (!gptResult.success) {
      console.error(`❌ [${requestId}] GPT Analysis failed: ${gptResult.error}`);
      
      // Add error details to debug info
      responseData.debug.gptError = gptResult.error;
    }
    
    // Extract the GPT analysis result
    const analysisResult = gptResult.analysis;
    
    // Always log truncated analysis structure for debugging
    const truncatedAnalysis = JSON.stringify(analysisResult).substring(0, 500) + '...';
    console.log(`🔍 [${requestId}] Analysis structure: ${truncatedAnalysis}`);

    // Check if we have a valid analysis result with required fields
    const isValidAnalysis = validateGptAnalysisResult(analysisResult);
    
    if (!isValidAnalysis) {
      console.warn(`⚠️ [${requestId}] Invalid analysis structure received from GPT. Using fallback response.`);
      
      // Create a fallback response with model information
      const fallbackResponse = createFallbackResponse(
        "Invalid analysis structure",
        analysisResult
      );
      
      // Add model information to the fallback response
      fallbackResponse.modelInfo = {
        model: gptResult.modelUsed,
        usedFallback: gptResult.usedFallbackModel,
        forceGPT4V: gptResult.forceGPT4V
      };
      
      // Return the fallback response
      return createAnalysisResponse({
        ...responseData,
        success: false,
        fallback: true,
        message: "Analysis couldn't be completed. Please try again with a clearer image.",
        analysis: fallbackResponse,
        modelInfo: {
          model: gptResult.modelUsed,
          usedFallback: gptResult.usedFallbackModel,
          forceGPT4V: gptResult.forceGPT4V
        }
      });
    }

    console.log(`✅ [${requestId}] GPT analysis result passed all validation checks`);
    
    // Add model information to the final analysis
    analysisResult.modelInfo = {
      model: gptResult.modelUsed,
      usedFallback: gptResult.usedFallbackModel,
      forceGPT4V: gptResult.forceGPT4V
    };
    
    // --- END ENHANCED LOGGING & VALIDATION ---
    
    responseData.debug.processingSteps.push('GPT Analysis Validated');
    responseData.debug.timestamps.analysisCompleted = new Date().toISOString();

    // Standardize nutrient values (ensure this happens *after* validation)
    const standardizedAnalysis = standardizeNutrientValues(analysisResult);

    // Check if enrichment is needed (using mock for now)
    const requiresEnrichment = needsConfidenceEnrichment(standardizedAnalysis);
    if (requiresEnrichment) {
      console.log(`⏳ [${requestId}] Analysis requires enrichment, calling enrichAnalysisResult...`);
      responseData.debug.processingSteps.push('Enrichment Started');
      // ... enrichment logic ...
      responseData.debug.timestamps.enrichmentCompleted = new Date().toISOString();
      responseData.debug.processingSteps.push('Enrichment Completed');
    } else {
      console.log(`⚪ [${requestId}] Skipping enrichment step.`);
    }

    // Final analysis payload
    const finalAnalysis = standardizedAnalysis; // Use standardized or enriched result
    responseData.analysis = finalAnalysis;
    responseData.success = true;
    responseData.message = 'Analysis successful';

    // ... rest of the code to potentially save the meal ...

  } catch (error) {
    // Catch-all for any unexpected errors
    const errorMessage = `Fatal error in analysis API: ${error instanceof Error ? error.message : 'Unknown error'}`;
    responseData.errors.push(errorMessage);
    responseData.message = 'An unexpected error occurred';
    responseData._meta.imageError = errorMessage;
    
    console.error(`❌ [${requestId}] FATAL ERROR:`, error);
    
    // Return a properly structured fallback response
    return createAnalysisResponse({
      ...responseData,
      success: false,
      fallback: true,
      analysis: createEmptyFallbackAnalysis()
    });
  }
  
  return createAnalysisResponse(responseData);
}