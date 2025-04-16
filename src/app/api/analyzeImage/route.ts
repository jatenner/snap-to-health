import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import crypto from 'crypto';
import { adminStorage } from '@/lib/firebaseAdmin';
import { trySaveMealServer } from '@/lib/serverMealUtils';
import { createAnalysisResponse, createEmptyFallbackAnalysis, createErrorResponse } from './analyzer';
import { isValidAnalysis, createFallbackAnalysis } from '@/lib/utils/analysisValidator';
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

For unclear or low-quality images, make your best educated guess based on visible elements.
Always return a complete analysis with all required fields.`;

      const fallbackSystemPrompt = attempt === 1 ? primarySystemPrompt 
        : `You are a nutrition expert analyzing a food image. This may be a low-quality or difficult image.
Make your best attempt to identify the foods and provide nutritional estimates.

Even with limited visual information, please:
1. Identify ANY possible food items based on shapes, colors, and context
2. Provide reasonable nutritional estimates even if uncertain
3. Never refuse to analyze - always provide your best guess with appropriate confidence levels

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
  "healthImpact": "How this meal impacts the user's stated health goals"
}`;
      
      const promptText = `${fallbackSystemPrompt}

Return ONLY valid JSON that can be parsed with JSON.parse(). Use this exact format:
${jsonFormat}

IMPORTANT GUIDELINES:
1. ALL fields in the JSON structure are required except healthImpact
2. The "description" must be a clear and concise description of all visible food items
3. The "nutrients" object MUST include calories, protein, carbs, and fat with numeric values when possible
4. Values can include ranges (e.g., "300-350") if exact estimation is difficult
5. For healthImpact, provide specific insights related to the user's goals: ${healthGoalString}
6. DO NOT include any explanatory text outside the JSON structure
7. Your entire response must be valid JSON only
8. If the image is unclear, provide your best estimates and note uncertainty in the description`;

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
        max_tokens: 800,
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
        
        // Attempt to parse JSON content
        let parsedResult;
        try {
          const content = responseData.choices[0].message.content;
          
          // Log raw GPT response for debugging
          console.log(`[${requestId}] RAW GPT RESPONSE:`, content);
          rawGptResponse = content;
          
          parsedResult = JSON.parse(content);
        } catch (parseError: unknown) {
          console.error(`[${requestId}] JSON parse error:`, parseError);
          
          // On first attempt, retry
          if (attempt === 1) {
            console.log(`[${requestId}] JSON parsing failed on first attempt, retrying...`);
            lastError = new Error(`Failed to parse JSON response (attempt ${attempt}): ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`);
            attempt++;
            continue;
          }
          
          // On second attempt, attempt manual parsing/extraction
          console.log(`[${requestId}] Attempting manual JSON extraction on final attempt...`);
          const content = responseData.choices[0].message.content;
          parsedResult = attemptManualJsonExtraction(content, requestId);
          if (!parsedResult) {
            throw new Error(`Failed to parse GPT-4V response as JSON after ${MAX_ATTEMPTS} attempts`);
          }
        }
        
        // Validate required fields exist
        if (!parsedResult.description || !parsedResult.nutrients) {
          console.error(`[${requestId}] Missing required fields in parsed result:`, parsedResult);
          
          if (attempt === 1) {
            lastError = new Error(`Missing required fields in response (attempt ${attempt})`);
            attempt++;
            continue;
          }
          
          // Add missing fields with fallback values on second attempt
          parsedResult = ensureRequiredFields(parsedResult);
        }
        
        // Convert nutrient values to consistent format if needed
        parsedResult = standardizeNutrientValues(parsedResult);
        
        // Return the validated and parsed result
        return {
          result: parsedResult,
          rawResponse: rawGptResponse
        };
        
      } catch (fetchError: unknown) {
        // Clear timeout to prevent memory leaks
        clearTimeout(timeoutId);
        
        console.error(`[${requestId}] Error during OpenAI API request (attempt ${attempt}):`, fetchError);
        
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          lastError = new Error(`Request timed out after 30 seconds (attempt ${attempt})`);
        } else {
          lastError = fetchError instanceof Error ? fetchError : new Error('Unknown fetch error');
        }
        
        attempt++;
      }
    } catch (overallError: unknown) {
      console.error(`[${requestId}] General error in GPT-4V analysis:`, overallError);
      lastError = overallError instanceof Error ? overallError : new Error('Unknown error in GPT-4V analysis');
      attempt++;
    }
  }
  
  // If we've exhausted all attempts, create a fallback response
  console.error(`[${requestId}] All GPT-4V attempts failed, returning fallback response. Last error:`, lastError);
  
  // Create a minimal valid response with the required fields
  return {
    result: {
      description: "Unable to analyze the image properly",
      nutrients: {
        calories: "Unknown",
        protein: "Unknown",
        carbs: "Unknown",
        fat: "Unknown"
      },
      healthImpact: "Could not determine health impact due to analysis failure",
      fallback: true,
      error: lastError?.message || "Unknown error during analysis"
    },
    rawResponse: rawGptResponse
  };
}

// Helper function to attempt manual JSON extraction when parsing fails
function attemptManualJsonExtraction(content: string, requestId: string): any | null {
  try {
    // Look for content that appears to be JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const extractedJson = jsonMatch[0];
      console.log(`[${requestId}] Extracted JSON-like content:`, extractedJson);
      return JSON.parse(extractedJson);
    }
    
    return null;
  } catch (error: unknown) {
    console.error(`[${requestId}] Manual JSON extraction failed:`, error);
    return null;
  }
}

// Helper function to ensure all required fields exist
function ensureRequiredFields(result: any): any {
  if (!result) result = {};
  
  if (!result.description) {
    result.description = "Food items could not be clearly identified";
  }
  
  if (!result.nutrients) {
    result.nutrients = {};
  }
  
  const nutrients = result.nutrients;
  if (!nutrients.calories) nutrients.calories = "Unknown";
  if (!nutrients.protein) nutrients.protein = "Unknown";
  if (!nutrients.carbs) nutrients.carbs = "Unknown";
  if (!nutrients.fat) nutrients.fat = "Unknown";
  
  return result;
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
function validateGptAnalysisResult(analysis: any): { valid: boolean; reason?: string } {
  return { valid: true };
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
    
    // Analyze the image
    try {
      responseData.debug.processingSteps.push('Starting image analysis');
      
      // Default health goals if none provided
      const effectiveHealthGoals = healthGoals.length > 0 
        ? healthGoals 
        : ['Improve Sleep', 'Weight Management', 'Build Muscle', 'Boost Energy'];
      
      // Perform the analysis
      const analysisResult = await analyzeImageWithGPT4V(
        base64Image, 
        effectiveHealthGoals,
        dietaryPreferences,
        requestId
      );
      
      responseData.debug.processingSteps.push('Analysis completed');
      
      const analysis = analysisResult.result;

      // CRITICAL GUARD: Log raw GPT analysis and block invalid results
      console.log("🔍 RAW GPT RESULT:", JSON.stringify(analysis, null, 2));
      
      // Add raw GPT response to debug information if available
      if (analysisResult.rawResponse) {
        responseData.debug.rawGptResponse = analysisResult.rawResponse;
      }
      
      const isInvalidAnalysis =
        !analysis?.description || 
        !analysis?.nutrients || 
        typeof analysis.nutrients !== 'object' ||
        !(
          'calories' in analysis.nutrients && 
          'protein' in analysis.nutrients && 
          'carbs' in analysis.nutrients && 
          'fat' in analysis.nutrients
        );

      if (isInvalidAnalysis) {
        console.warn("🔥 Skipping save — invalid GPT result", analysis);
        
        // Log what's missing for debugging
        const missingFields = [];
        if (!analysis?.description) missingFields.push('description');
        if (!analysis?.nutrients || typeof analysis.nutrients !== 'object') {
          missingFields.push('nutrients object');
        } else {
          if (!('calories' in analysis.nutrients)) missingFields.push('nutrients.calories');
          if (!('protein' in analysis.nutrients)) missingFields.push('nutrients.protein');
          if (!('carbs' in analysis.nutrients)) missingFields.push('nutrients.carbs');
          if (!('fat' in analysis.nutrients)) missingFields.push('nutrients.fat');
        }
        
        console.error(`❌ [${requestId}] FATAL: HARD EXIT - BLOCKING ALL FIRESTORE OPERATIONS - Missing fields:`, missingFields);
        console.error(`❌ [${requestId}] DEBUG - GPT Analysis Dump:`, JSON.stringify(analysis, null, 2).substring(0, 500) + '...');
        console.error(`📛 [${requestId}] DEBUG - Response Data Dump:`, JSON.stringify(responseData, null, 2).substring(0, 500) + '...');
        
        // Try to reveal if there's any trace of null/undefined issues
        console.error(`🔍 [${requestId}] DEBUG - Type Checks: isInvalidAnalysis=${isInvalidAnalysis}, 
          analysis type=${typeof analysis}, 
          description exists=${Boolean(analysis?.description)}, 
          nutrients is object=${typeof analysis?.nutrients === 'object'},
          has calories=${Boolean(analysis?.nutrients?.calories)},
          has protein=${Boolean(analysis?.nutrients?.protein)},
          has carbs=${Boolean(analysis?.nutrients?.carbs)},
          has fat=${Boolean(analysis?.nutrients?.fat)}`);

        // CRITICAL: Return from the main POST handler immediately
        // This prevents ANY further execution in this route
        // All code after this point will NOT run for invalid analysis
        
        // Add indication that we're about to return
        console.error("✅ EXITING EARLY - Next line will be return statement in fallback guard");
        
        const fallbackResponse = NextResponse.json({
          success: false,
          fallback: true,
          message: "GPT fallback — missing description or nutrients",
          analysis: createEmptyFallbackAnalysis(),
          payload: {
            originalAnalysis: analysis,
            missingFields,
            requestId
          },
          mealSaved: false
        });
        
        // Ensure all pending operations are complete before returning
        // This prevents any race conditions or lingering promises
        console.timeEnd(`⏱️ [${requestId}] Total API execution time`);
        
        // Log one more time right before return
        console.error("🚪 LAST LOG BEFORE RETURN - If you see anything after this log with the same requestId, the guard failed!");
        
        return fallbackResponse;
      }

      console.log("✅ Firestore logic executing after valid analysis");
      console.log("🧠 STEP: Passed GPT validation check - Preparing for Firestore save");
      console.log("🧠 GPT Analysis Snapshot:", JSON.stringify(analysis, null, 2).substring(0, 300) + '...');
      
      // If we get here, we have a valid analysis
      console.log(`✅ [${requestId}] Valid analysis detected – proceeding to save`);
      
      // Only set responseData.analysis AFTER validation passed
      responseData.success = true; 
      responseData.message = 'Analysis completed'; 
      responseData.analysis = analysis; 
      responseData.imageUrl = imageUrl;
      responseData.requestId = requestId;
      
      if (analysisResult.reasoning) { // Keep reasoning if available
        responseData.debug.reasoning = analysisResult.reasoning;
      }

      // --- Save Meal Logic (Only AFTER valid analysis confirmed) --- 
      const shouldSave = userId && typeof imageUrl === 'string';
      
      if (shouldSave) { 
        try {
          console.log(`✅ [${requestId}] Starting Firestore save attempt - valid analysis confirmed`);
          // Explicit type check inside the block to satisfy TypeScript
          if (typeof imageUrl === 'string') { 
            const { saveMealToFirestore, updateResponseWithSaveResult } = await import('./server-meal-saver');
            
            const saveResult = await saveMealToFirestore({
              userId,
              imageUrl, // Now guaranteed to be a string here
              analysis: responseData.analysis,
              requestId,
              requestData,
              jsonData
            });
            
            // Update the response with save results
            updateResponseWithSaveResult(responseData, saveResult);
            console.log(`✅ [${requestId}] Meal saving process completed with success: ${saveResult.success}`);
          } else {
            // This should technically not be reachable due to the `shouldSave` check, but satisfies TS
            console.warn(`[${requestId}] Skipping save due to invalid imageUrl type within shouldSave block.`);
            responseData.debug.processingSteps.push('Meal save skipped: invalid imageUrl type');
          }

        } catch (saveError) {
          console.error(`❌ [${requestId}] Error during meal save:`, saveError);
          responseData.debug.processingSteps.push('Meal save failed due to error');
          responseData.debug.errorDetails.push({ 
            step: 'meal_save', 
            error: saveError instanceof Error ? saveError.message : 'Unknown error',
            details: saveError 
          });
          responseData.mealSaved = false;
        }
      } else {
        // Log why we're skipping meal save if it wasn't due to fallback
        if (!userId) {
          console.log(`ℹ️ [${requestId}] No userId provided, skipping meal save`);
          responseData.debug.processingSteps.push('No userId provided, skipping meal save');
        } else if (!imageUrl || typeof imageUrl !== 'string') {
          console.log(`ℹ️ [${requestId}] No valid imageUrl available, skipping meal save`);
        } else if (!responseData.analysis) {
          console.log(`ℹ️ [${requestId}] No valid analysis object, skipping meal save`);
        } else {
           console.log(`ℹ️ [${requestId}] Unknown reason, skipping meal save`);
        }
      }
      // --- End Save Meal Logic ---

    } catch (error) {
      // Catch errors during analysis (before fallback check)
      const errorMessage = `Analysis error: ${error instanceof Error ? error.message : 'Unknown error'}`;
      responseData.errors.push(errorMessage);
      responseData.message = 'Analysis failed';
      responseData.debug.errorDetails.push({ 
        step: 'analysis', 
        error: errorMessage,
        details: error 
      });
      console.error(`❌ [${requestId}] ${errorMessage}`, error);
      
      // Return a properly structured response with fallback analysis
      return createAnalysisResponse({
        ...responseData,
        success: false,
        fallback: true,
        analysis: createEmptyFallbackAnalysis()
      });
    }
    
    // Record end timestamp and return successful response
    responseData.debug.timestamps.end = new Date().toISOString();
    console.timeEnd(`⏱️ [${requestId}] Total API execution time`);
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