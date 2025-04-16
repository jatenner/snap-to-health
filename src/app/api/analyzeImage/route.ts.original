import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import crypto from 'crypto';
import { adminStorage } from '@/lib/firebaseAdmin';
import { trySaveMealServer } from '@/lib/serverMealUtils';

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
    
    // Handle FormDataEntryValue with stream (if buffer is still null)
    if (!buffer && rawFile && typeof rawFile === 'object' && 'stream' in rawFile && typeof rawFile.stream === 'function') {
      conversionSteps.push('Converting using stream method');
      try {
        const chunks: Uint8Array[] = [];
        const stream = (rawFile as any).stream();
        const reader = stream.getReader();
        
        let bytesRead = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            bytesRead += value.length;
          }
        }
        
        if (chunks.length === 0 || bytesRead === 0) {
          conversionErrors.push('Stream produced no data');
          console.warn(`⚠️ [${requestId}] Stream produced no data`);
        } else {
          // Safely create buffer - wrap in try/catch
          try {
            buffer = Buffer.concat(chunks);
            console.log(`✓ [${requestId}] Successfully read ${bytesRead} bytes using stream (${chunks.length} chunks)`);
          } catch (bufferError: any) {
            conversionErrors.push(`Buffer.concat error: ${bufferError.message || 'unknown error'}`);
            console.warn(`⚠️ [${requestId}] Failed to create Buffer from chunks:`, bufferError);
          }
        }
      } catch (streamError: any) {
        conversionErrors.push(`Stream error: ${streamError.message || 'unknown error'}`);
        console.warn(`⚠️ [${requestId}] Stream method failed:`, streamError);
        // Continue to next method
      }
    }
    
    // Handle Buffer
    if (!buffer && Buffer.isBuffer(rawFile)) {
      conversionSteps.push('Using existing Buffer');
      if (rawFile.length > 0) {
        buffer = rawFile;
        console.log(`✓ [${requestId}] Using existing Buffer (${buffer.length} bytes)`);
      } else {
        conversionErrors.push('Provided Buffer is empty');
        console.warn(`⚠️ [${requestId}] Provided Buffer is empty`);
      }
    }
    
    // Handle ArrayBuffer
    if (!buffer && rawFile instanceof ArrayBuffer) {
      conversionSteps.push('Converting ArrayBuffer');
      if (rawFile.byteLength > 0) {
        try {
          buffer = Buffer.from(new Uint8Array(rawFile));
          console.log(`✓ [${requestId}] Converted ArrayBuffer (${rawFile.byteLength} bytes)`);
        } catch (bufferError: any) {
          conversionErrors.push(`Buffer.from ArrayBuffer error: ${bufferError.message || 'unknown error'}`);
          console.warn(`⚠️ [${requestId}] Failed to create Buffer from ArrayBuffer:`, bufferError);
        }
      } else {
        conversionErrors.push('Provided ArrayBuffer is empty');
        console.warn(`⚠️ [${requestId}] Provided ArrayBuffer is empty`);
      }
    }
    
    // Handle base64 or data URL string
    if (!buffer && typeof rawFile === 'string') {
      conversionSteps.push('Converting from string');
      
      if (rawFile.length === 0) {
        conversionErrors.push('Provided string is empty');
        console.warn(`⚠️ [${requestId}] Provided string is empty`);
      } else if (rawFile.startsWith('data:')) {
        // Handle data URL
        const parts = rawFile.split(',');
        const base64Data = parts.length > 1 ? parts[1] : '';
        
        if (!base64Data || base64Data.length === 0) {
          conversionErrors.push('Data URL contains no base64 data');
          console.warn(`⚠️ [${requestId}] Data URL contains no base64 data`);
        } else {
          try {
            buffer = Buffer.from(base64Data, 'base64');
            if (buffer.length === 0) {
              conversionErrors.push('Base64 data from URL decoded to empty buffer');
              console.warn(`⚠️ [${requestId}] Base64 data from URL decoded to empty buffer`);
              buffer = null;
            } else {
              console.log(`✓ [${requestId}] Converted data URL (~${base64Data.length} chars)`);
            }
          } catch (base64Error: any) {
            conversionErrors.push(`Data URL parsing error: ${base64Error.message || 'unknown error'}`);
            console.warn(`⚠️ [${requestId}] Data URL parsing failed:`, base64Error);
            buffer = null;
          }
        }
      } else {
        // Try as base64
        try {
          buffer = Buffer.from(rawFile, 'base64');
          if (buffer.length === 0) {
            conversionErrors.push('Base64 string decoded to empty buffer');
            console.warn(`⚠️ [${requestId}] Base64 string decoded to empty buffer`);
            buffer = null;
          } else {
            console.log(`✓ [${requestId}] Converted base64 string (~${rawFile.length} chars)`);
          }
        } catch (base64Error: any) {
          conversionErrors.push(`Base64 parsing error: ${base64Error.message || 'unknown error'}`);
          console.warn(`⚠️ [${requestId}] Base64 parsing failed:`, base64Error);
          
          // Last resort - try as UTF-8 text
          try {
            buffer = Buffer.from(rawFile, 'utf-8');
            if (buffer.length === 0) {
              conversionErrors.push('UTF-8 string decoded to empty buffer');
              console.warn(`⚠️ [${requestId}] UTF-8 string decoded to empty buffer`);
              buffer = null;
            } else {
              console.log(`✓ [${requestId}] Converted as UTF-8 text (${rawFile.length} chars)`);
            }
          } catch (textError: any) {
            conversionErrors.push(`UTF-8 parsing error: ${textError.message || 'unknown error'}`);
            console.warn(`⚠️ [${requestId}] UTF-8 parsing failed:`, textError);
          }
        }
      }
    }
    
    // Final fallback - try toString() if possible
    if (!buffer && rawFile && typeof rawFile.toString === 'function' && rawFile.toString !== Object.prototype.toString) {
      conversionSteps.push('FALLBACK: Converting to string');
      console.warn(`⚠️ [${requestId}] All standard conversion methods failed, attempting toString() fallback`);
      
      try {
        const stringValue = rawFile.toString();
        if (!stringValue || stringValue.length === 0 || stringValue === '[object Object]') {
          conversionErrors.push('toString() produced empty or useless string');
          console.warn(`⚠️ [${requestId}] toString() produced empty or useless string: "${stringValue}"`);
        } else {
          try {
            buffer = Buffer.from(stringValue, 'utf-8');
            if (buffer.length === 0) {
              conversionErrors.push('toString() result decoded to empty buffer');
              console.warn(`⚠️ [${requestId}] toString() result decoded to empty buffer`);
              buffer = null;
            } else {
              console.log(`✓ [${requestId}] Converted using toString() (${stringValue.length} chars)`);
            }
          } catch (bufferError: any) {
            conversionErrors.push(`Buffer.from toString error: ${bufferError.message || 'unknown error'}`);
            console.warn(`⚠️ [${requestId}] Failed to create Buffer from toString result:`, bufferError);
          }
        }
      } catch (stringError: any) {
        conversionErrors.push(`toString() error: ${stringError.message || 'unknown error'}`);
        console.error(`❌ [${requestId}] Fallback toString() conversion failed:`, stringError);
      }
    }
    
    // Final check - if we still don't have a buffer, all methods failed
    if (!buffer) {
      console.error(`❌ [${requestId}] All conversion methods failed. Errors: ${conversionErrors.join('; ')}`);
      console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
      throw new Error(`Unable to convert image: ${conversionErrors.join('; ')}`);
    }
    
    // Final validation - check buffer size
    if (buffer.length === 0) {
      console.error(`❌ [${requestId}] Conversion resulted in empty buffer`);
      console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
      throw new Error('Conversion resulted in empty buffer');
    }
    
    // Convert buffer to base64
    let base64 = '';
    try {
      base64 = buffer.toString('base64');
      
      // Validate base64 result
      if (!base64 || base64.length === 0) {
        console.error(`❌ [${requestId}] Buffer.toString('base64') produced empty result`);
        console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
        throw new Error('Base64 encoding produced empty result');
      }
    } catch (base64Error: any) {
      console.error(`❌ [${requestId}] Error converting buffer to base64:`, base64Error);
      console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
      throw new Error(`Base64 encoding failed: ${base64Error.message || 'unknown error'}`);
    }
    
    console.log(`✅ [${requestId}] Successfully converted image to base64 (methods tried: ${conversionSteps.join(', ')})`);
    console.log(`📊 [${requestId}] Base64 length: ${base64.length} chars, Buffer size: ${buffer.length} bytes`);
    
    console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
    return base64;
  } catch (error: any) {
    // Make sure we end the timer if there's an error
    console.error(`❌ [${requestId}] Error in extractBase64Image:`, error.message || 'Unknown error');
    console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
    throw error; // Re-throw to be handled by the caller with a user-friendly response
  }
}

// Request function with retry and timeout capabilities
async function fetchWithRetryAndTimeout(url: string, options: any, retries = 2, timeout = 30000) {
  console.time('fetchWithRetryAndTimeout');
  return new Promise(async (resolve, reject) => {
    // Set up timeout
    const timeoutId = setTimeout(() => {
      console.log(`Request to ${url} timed out after ${timeout}ms`);
      console.timeEnd('fetchWithRetryAndTimeout');
      reject(new Error(`Request timed out after ${timeout}ms`));
    }, timeout);
    
    // Attempt fetch with retries
    let lastError;
    for (let i = 0; i <= retries; i++) {
      try {
        const response = await fetch(url, options);
        clearTimeout(timeoutId);
        console.timeEnd('fetchWithRetryAndTimeout');
        resolve(response);
        return;
      } catch (error) {
        console.log(`Attempt ${i + 1} failed:`, error);
        lastError = error;
        // Wait before retrying (exponential backoff)
        if (i < retries) {
          const delay = Math.min(1000 * (2 ** i), 10000);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    
    clearTimeout(timeoutId);
    console.timeEnd('fetchWithRetryAndTimeout');
    reject(lastError || new Error('All fetch attempts failed'));
  });
}

// Function to analyze the image with GPT-4 Vision
async function analyzeWithGPT4Vision(base64Image: string, healthGoal: string, requestId: string) {
  console.time(`⏱️ [${requestId}] analyzeWithGPT4Vision`);
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  
  if (!OPENAI_API_KEY) {
    console.timeEnd(`⏱️ [${requestId}] analyzeWithGPT4Vision`);
    throw new Error('OpenAI API key is not configured');
  }

  // Try with primary prompt first, then fallback to simpler prompt if needed
  let attempt = 1;
  let lastError = null;
  const reasoningLogs: any[] = [];
  const fallbackMessage = "We couldn't analyze this image properly. Please try again with a clearer photo.";

  while (attempt <= 2) {
    try {
      console.log(`[${requestId}] GPT-4 Vision attempt ${attempt} starting...`);
      
      // Create an AbortController for timeout management
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        console.error(`[${requestId}] OpenAI request aborted due to timeout (45s)`);
      }, 45000); // 45 second timeout (to stay within Vercel's limits)

      console.log(`[${requestId}] Sending request to OpenAI API...`);
      
      // Get goal-specific prompt
      const goalPrompt = getGoalSpecificPrompt(healthGoal);
      
      // Updated primary system prompt focused on ingredient detection
      const primarySystemPrompt = `You are a nutrition-focused food vision expert. This image may be blurry, dark, or imperfect.
Try your best to:
- List all identifiable food items, even if uncertain
- Guess their category (protein, carb, veg, etc.)
- Give a confidence score (0–10) for each
- NEVER return "unclear image" — always offer your best guess

${goalPrompt}`;

      // Improved fallback prompt for retry attempts
      const fallbackSystemPrompt = attempt === 1 ? primarySystemPrompt 
        : `You are a nutrition expert analyzing a potentially low-quality food image. 

I need you to identify ANY possible food items, even if very unclear:
- Make educated guesses based on shapes, colors, textures and shadows
- Identify partial items and suggest what they likely are
- Propose contextually likely combinations (e.g., if you see rice, consider common pairings)
- Use even subtle visual cues to infer possible ingredients
- NEVER say "I cannot identify" or "unclear image" - always make reasonable guesses
- Assign appropriate low confidence scores (1-4) for uncertain items

Improve this ingredient list using best guess. Assume the image may be dim or partially blocked.

The user's health goal is: "${healthGoal}" - relate your analysis to this goal when possible.

IMPORTANT: Just because an image is blurry doesn't mean we can't extract useful information. 
Even with 20% confidence, provide your best assessment of what food items are likely present.`;
      
      // Log the prompt being used
      console.log(`[${requestId}] Analyzing image with health goal: ${healthGoal}`);
      console.log(`[${requestId}] Using ${attempt === 1 ? 'primary' : 'fallback'} prompt (${fallbackSystemPrompt.length} chars)`);
      
      // Configure request headers for better performance
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'OpenAI-Beta': 'assistants=v1'  // Use latest API features
      };
      
      // Improved JSON response format with detailed ingredients and confidence scores
      const requestPayload = {
        model: "gpt-4o",  // Using GPT-4o for faster response
        messages: [
          {
            role: "user",
            content: [
              { 
                type: "text", 
                text: `${fallbackSystemPrompt}

Return ONLY valid JSON that can be parsed with JSON.parse(). Use this exact format:
{
  "description": "A concise description of the meal focusing on key components",
  "ingredientList": ["ingredient1", "ingredient2", ...],
  "detailedIngredients": [
    { "name": "ingredient1", "category": "protein/vegetable/grain/etc", "confidence": 8.5 },
    { "name": "ingredient2", "category": "protein/vegetable/grain/etc", "confidence": 6.0 }
  ],
  "confidence": 7.5,
  "basicNutrition": {
    "calories": "estimated calories",
    "protein": "estimated protein in grams",
    "carbs": "estimated carbs in grams",
    "fat": "estimated fat in grams"
  },
  "goalImpactScore": 7,
  "goalName": "${formatGoalName(healthGoal)}",
  "scoreExplanation": "Clear explanation of how this meal supports or hinders the specific goal, based on scientific evidence",
  "positiveFoodFactors": [
    "Specific way ingredient X helps with the goal due to nutrient Y",
    "Specific way ingredient Z supports the goal"
  ],
  "negativeFoodFactors": [
    "Specific limitation of ingredient A for this goal",
    "How ingredient B might be suboptimal for the goal"
  ],
  "feedback": [
    "Actionable, goal-specific feedback point 1",
    "Actionable, goal-specific feedback point 2"
  ],
  "suggestions": [
    "Specific, evidence-based recommendation 1",
    "Specific, evidence-based recommendation 2"
  ],
  "imageChallenges": ["list any challenges with analyzing this image, like lighting, blur, etc."]
}

IMPORTANT GUIDELINES:
1. Score must be between 1-10 (10 being the most beneficial for the goal)
2. Confidence score must be between 0-10 (10 being extremely confident in your analysis, 0 being no confidence)
3. For low-quality images, confidence should reflect your certainty about the ingredients (e.g., 2-4 for very blurry, 5-7 for partially visible food, 8-10 for clear images)
4. Be specific and quantitative in your analysis - mention actual nutrients and compounds when relevant
5. Do not repeat the same information across different sections
6. Every single insight must directly relate to the user's goal of "${healthGoal}"
7. Use plain language to explain complex nutrition concepts
8. Explain WHY each factor helps or hinders the goal (e.g., "High magnesium content aids recovery by relaxing muscles and reducing inflammation")
9. Suggestions should be specific and actionable, not general tips
10. Avoid redundancy between positiveFoodFactors, negativeFoodFactors, feedback, and suggestions
11. Focus on the user's specific goal, not general healthy eating advice
12. If image quality is poor, DO NOT refuse to analyze - provide your best guess and set confidence level appropriately
13. The detailedIngredients array should include EVERY ingredient you identify, along with its food category and your confidence for that specific item
14. ALWAYS return at least 3 ingredients with your best guess, even if confidence is low
15. For very unclear images, look for shapes, colors, textures, and contextual clues to infer possible food items

Do not return any explanation or text outside the JSON block. Your entire response must be valid JSON only.`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                  detail: attempt === 1 ? "low" : "high" // Use higher detail on second attempt
                }
              }
            ]
          }
        ],
        max_tokens: 1500,
        temperature: attempt === 1 ? 0.5 : 0.7,  // Higher temperature on second attempt for more creativity
        response_format: { type: "json_object" }  // Force JSON response
      };
      
      console.log(`[${requestId}] Request URL: https://api.openai.com/v1/chat/completions`);
      console.log(`[${requestId}] Request model:`, requestPayload.model);
      
      const startTime = Date.now();
      
      try {
        // Use native fetch with the AbortController signal for timeout management
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers,
          body: JSON.stringify(requestPayload),
          signal: controller.signal
        });
        
        // Clear the timeout since the request completed
        clearTimeout(timeoutId);
        
        const endTime = Date.now();
        console.log(`[${requestId}] OpenAI API request completed in ${(endTime - startTime) / 1000}s`);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[${requestId}] OpenAI API Error Status:`, response.status);
          console.error(`[${requestId}] OpenAI API Error Response:`, errorText);
          
          // Store this error but try again if it's our first attempt
          lastError = new Error(`OpenAI API Error (attempt ${attempt}): ${response.status} ${response.statusText}`);
          attempt++;
          continue;
        }
        
        const responseData = await response.json();
        console.log(`[${requestId}] GPT-4 Vision Analysis Complete`);
        
        if (
          !responseData.choices || 
          !responseData.choices[0] || 
          !responseData.choices[0].message || 
          !responseData.choices[0].message.content
        ) {
          console.error(`[${requestId}] Invalid OpenAI response structure:`, JSON.stringify(responseData));
          
          // Store this error but try again if it's our first attempt
          lastError = new Error(`Invalid response structure from OpenAI API (attempt ${attempt})`);
          attempt++;
          continue;
        }
        
        const analysisText = responseData.choices[0].message.content;
        
        try {
          // Parse the JSON response
          const analysisJson = JSON.parse(analysisText.trim());
          console.log(`[${requestId}] Analysis JSON parsed successfully`);
          
          // Store the raw result in reasoningLogs for debugging
          reasoningLogs.push({
            stage: `initial_analysis_attempt_${attempt}`,
            result: analysisJson,
            timestamp: new Date().toISOString()
          });
          
          // Check if we need to enrich the result with a second pass
          const needsEnrichment = shouldEnrichAnalysis(analysisJson);
          
          if (needsEnrichment && attempt === 1) {
            console.log(`[${requestId}] Low confidence analysis detected (${needsEnrichment}), performing enrichment pass`);
            const enrichedAnalysis = await refineLowConfidenceAnalysis(
              base64Image, 
              analysisJson, 
              healthGoal, 
              requestId
            );
            
            // Store the enriched result in reasoningLogs
            reasoningLogs.push({
              stage: "enrichment_pass",
              originalConfidence: analysisJson.confidence,
              detectedIssue: needsEnrichment,
              result: enrichedAnalysis,
              timestamp: new Date().toISOString()
            });
            
            // Combine the enriched analysis with the original, prioritizing the enriched data
            const combinedAnalysis = {
              ...analysisJson,
              ...enrichedAnalysis,
              confidence: Math.max(analysisJson.confidence || 0, enrichedAnalysis.confidence || 0),
              reasoningLogs: reasoningLogs
            };
            
            console.log(`[${requestId}] GPT-4 Vision analysis completed in ${(endTime - startTime) / 1000}s (with enrichment)`);
            console.timeEnd(`⏱️ [${requestId}] analyzeWithGPT4Vision`);
            return combinedAnalysis;
          }
          
          // Add reasoningLogs to the response
          analysisJson.reasoningLogs = reasoningLogs;
          
          console.log(`[${requestId}] GPT-4 Vision analysis completed in ${(endTime - startTime) / 1000}s`);
          console.timeEnd(`⏱️ [${requestId}] analyzeWithGPT4Vision`);
          return analysisJson;
        } catch (parseError) {
          console.error(`[${requestId}] Error parsing JSON from GPT response (attempt ${attempt}):`, parseError);
          console.error(`[${requestId}] Raw response:`, analysisText);
          
          // Add parse error to reasoningLogs
          reasoningLogs.push({
            stage: `parse_error_attempt_${attempt}`,
            error: parseError instanceof Error ? parseError.message : 'Unknown parsing error',
            rawResponse: analysisText,
            timestamp: new Date().toISOString()
          });
          
          // Try to extract JSON using regex if parsing fails
          const jsonMatch = analysisText.match(/({[\s\S]*})/);
          if (jsonMatch && jsonMatch[0]) {
            try {
              const extractedJson = JSON.parse(jsonMatch[0]);
              console.log(`[${requestId}] Extracted JSON using regex on attempt ${attempt}`);
              
              // Add extraction success to reasoningLogs
              reasoningLogs.push({
                stage: `regex_extraction_attempt_${attempt}`,
                result: extractedJson,
                timestamp: new Date().toISOString()
              });
              
              // Add reasoningLogs to the response
              extractedJson.reasoningLogs = reasoningLogs;
              
              console.timeEnd(`⏱️ [${requestId}] analyzeWithGPT4Vision`);
              return extractedJson;
            } catch (extractError) {
              console.error(`[${requestId}] Failed to extract JSON with regex (attempt ${attempt}):`, extractError);
              
              // Add extraction failure to reasoningLogs
              reasoningLogs.push({
                stage: `regex_extraction_failure_attempt_${attempt}`,
                error: extractError instanceof Error ? extractError.message : 'Unknown extraction error',
                timestamp: new Date().toISOString()
              });
            }
          }
          
          // Store this error but try again if it's our first attempt
          lastError = new Error(`Failed to parse analysis result (attempt ${attempt}): ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`);
          attempt++;
          continue;
        }
      } catch (fetchError: unknown) {
        // Clear the timeout in case of errors
        clearTimeout(timeoutId);
        
        // Add fetch error to reasoningLogs
        reasoningLogs.push({
          stage: `fetch_error_attempt_${attempt}`,
          error: fetchError instanceof Error ? fetchError.message : 'Unknown fetch error',
          timestamp: new Date().toISOString()
        });
        
        // Check if this is an abort error
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          console.error(`[${requestId}] OpenAI request aborted due to timeout on attempt ${attempt}`);
          
          // Store this error but try again if it's our first attempt
          lastError = new Error(`OpenAI request timed out after 45 seconds (attempt ${attempt})`);
          attempt++;
          continue;
        }
        
        // Other fetch errors
        console.error(`[${requestId}] Error fetching from OpenAI API (attempt ${attempt}):`, fetchError);
        
        // Store this error but try again if it's our first attempt
        lastError = fetchError instanceof Error 
          ? new Error(`Fetch error on attempt ${attempt}: ${fetchError.message}`) 
          : new Error(`Unknown fetch error occurred on attempt ${attempt}`);
        attempt++;
        continue;
      }
    } catch (error) {
      console.error(`[${requestId}] Error analyzing image with GPT-4 Vision (attempt ${attempt}):`, error);
      
      // Add general error to reasoningLogs
      reasoningLogs.push({
        stage: `general_error_attempt_${attempt}`,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
      
      // Store this error but try again if it's our first attempt
      lastError = error instanceof Error 
        ? new Error(`Error on attempt ${attempt}: ${error.message}`) 
        : new Error(`Unknown error on attempt ${attempt}`);
      attempt++;
      continue;
    }
  }
  
  // If we've reached here, all attempts failed
  console.error(`[${requestId}] All GPT-4 Vision attempts failed. Last error:`, lastError);
  console.timeEnd(`⏱️ [${requestId}] analyzeWithGPT4Vision`);
  
  // Create a final reasoning log for the failure
  reasoningLogs.push({
    stage: "all_attempts_failed",
    lastError: lastError instanceof Error ? lastError.message : 'Unknown final error',
    timestamp: new Date().toISOString()
  });
  
  // Create a minimal response with the reasoning logs
  const fallbackResponse = {
    description: "Unable to analyze the image after multiple attempts",
    ingredientList: ["unidentified food item"],
    detailedIngredients: [
      { name: "unidentified food item", category: "unknown", confidence: 1.0 }
    ],
    confidence: 1,
    basicNutrition: {
      calories: "unknown",
      protein: "unknown",
      carbs: "unknown",
      fat: "unknown"
    },
    goalName: formatGoalName(healthGoal),
    goalImpactScore: 0,
    feedback: [
      fallbackMessage,
      "Try a photo with better lighting and ensure all food items are clearly visible.",
      "Make sure your meal is in focus and there isn't excessive glare or shadows."
    ],
    suggestions: [
      "Take photos in natural daylight when possible",
      "Ensure the camera lens is clean and the food is in focus",
      "Take the photo from directly above the plate for best results"
    ],
    reasoningLogs: reasoningLogs
  };
  
  // Throw the last error we encountered, but include our fallback response
  const enhancedError = new Error('Failed to analyze image after multiple attempts');
  // @ts-ignore
  enhancedError.fallbackResponse = fallbackResponse;
  throw enhancedError;
}

// Check if an analysis needs enrichment
function shouldEnrichAnalysis(analysis: any): string | false {
  // Always enrich if there are fewer than 3 ingredients
  if (!analysis.ingredientList || analysis.ingredientList.length < 3) {
    return 'too_few_ingredients';
  }
  
  // Check if the detailedIngredients have low average confidence
  if (analysis.detailedIngredients && analysis.detailedIngredients.length > 0) {
    const totalConfidence = analysis.detailedIngredients.reduce(
      (sum: number, ingredient: any) => sum + (ingredient.confidence || 0), 
      0
    );
    const avgConfidence = totalConfidence / analysis.detailedIngredients.length;
    
    // Lower the threshold to 4 to catch more low-confidence cases
    if (avgConfidence < 4) {
      return 'low_confidence_ingredients';
    }
    
    // Count very low confidence ingredients
    const veryLowConfidenceCount = analysis.detailedIngredients.filter(
      (i: any) => i.confidence < 3
    ).length;
    
    // If more than 1/3 of ingredients have very low confidence, trigger enrichment
    if (veryLowConfidenceCount > analysis.detailedIngredients.length / 3) {
      return 'many_very_low_confidence_ingredients';
    }
  }
  
  // Check overall confidence with a lower threshold
  if (typeof analysis.confidence === 'number' && analysis.confidence < 4.5) {
    return 'low_overall_confidence';
  }
  
  // Check if the image has reported challenges
  if (analysis.imageChallenges && analysis.imageChallenges.length > 0) {
    return 'reported_image_challenges';
  }
  
  return false;
}

// Function to perform a second pass on low confidence analysis
async function refineLowConfidenceAnalysis(
  base64Image: string, 
  initialAnalysis: any, 
  healthGoal: string, 
  requestId: string
): Promise<any> {
  console.time(`⏱️ [${requestId}] refineLowConfidenceAnalysis`);
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  
  if (!OPENAI_API_KEY) {
    console.timeEnd(`⏱️ [${requestId}] refineLowConfidenceAnalysis`);
    return initialAnalysis; // Return original if no API key
  }
  
  try {
    console.log(`[${requestId}] Starting enrichment pass for low confidence analysis`);
    
    // Create an AbortController for timeout management
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      console.error(`[${requestId}] Enrichment request aborted due to timeout (30s)`);
    }, 30000); // 30 second timeout for the enrichment pass

    // Prepare the initial analysis as a string
    const initialAnalysisString = JSON.stringify(initialAnalysis, null, 2);
    
    // Configure request headers
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'OpenAI-Beta': 'assistants=v1'
    };
    
    // Enhanced enrichment prompt with more emphasis on making guesses
    const enrichmentPrompt = `You are an expert in analyzing food images, especially when the image quality is poor.

I previously analyzed this food image but with low confidence. Here's my initial analysis:
${initialAnalysisString}

Please improve this analysis using these techniques:
1. Look for subtle visual cues - colors, shapes, textures, spatial arrangement
2. Consider common food combinations and contextual clues
3. Use different brightness/contrast mental adjustments to identify items
4. Note any edges, shadows, or partial forms that might indicate additional items
5. Consider cultural or regional food patterns visible in the image
6. Apply your knowledge of typical plating, garnishes, and accompaniments

IMPORTANT REQUIREMENTS:
1. Identify AT LEAST 3 ingredients, even with low confidence
2. Assign accurate confidence scores (1-10) matching your certainty
3. Use the category field to classify each ingredient
4. Keep the same JSON format as the original analysis
5. NEVER say "I cannot identify" or "unclear image" - always make your best educated guess
6. If you see ANYTHING that could possibly be food, guess what it most likely is with an appropriate low confidence score
7. Refine any existing nutrition estimates to be more specific and accurate

Refine this analysis with the same JSON structure, but with improved values, especially more comprehensive ingredients list.

Return a complete analysis with the same JSON structure, adding any missing fields from the original.`;
    
    // Configure request parameters for enhanced analysis
    const requestPayload = {
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { 
              type: "text", 
              text: enrichmentPrompt
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
                detail: "high" // Use high detail for the enrichment pass
              }
            }
          ]
        }
      ],
      max_tokens: 1500,
      temperature: 0.7,  // Higher temperature for creative interpretation
      response_format: { type: "json_object" }
    };
    
    const startTime = Date.now();
    
    // Make the API call
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify(requestPayload),
      signal: controller.signal
    });
    
    // Clear the timeout
    clearTimeout(timeoutId);
    
    const endTime = Date.now();
    console.log(`[${requestId}] Enrichment API request completed in ${(endTime - startTime) / 1000}s`);
    
    if (!response.ok) {
      console.error(`[${requestId}] Enrichment API Error:`, response.status);
      console.timeEnd(`⏱️ [${requestId}] refineLowConfidenceAnalysis`);
      return initialAnalysis; // Return original if enrichment fails
    }
    
    const responseData = await response.json();
    
    if (
      !responseData.choices || 
      !responseData.choices[0] || 
      !responseData.choices[0].message || 
      !responseData.choices[0].message.content
    ) {
      console.error(`[${requestId}] Invalid enrichment response structure`);
      console.timeEnd(`⏱️ [${requestId}] refineLowConfidenceAnalysis`);
      return initialAnalysis; // Return original if response is invalid
    }
    
    const enrichedText = responseData.choices[0].message.content;
    
    try {
      // Parse the JSON response
      const enrichedJson = JSON.parse(enrichedText.trim());
      console.log(`[${requestId}] Enriched analysis parsed successfully`);
      
      // Add meta information about the enrichment
      enrichedJson._enriched = true;
      enrichedJson._enrichmentTime = endTime - startTime;
      
      // Mark as low confidence to ensure UI shows appropriate indicators
      enrichedJson.lowConfidence = true;
      
      // Add additional tracking information
      enrichedJson._enrichmentDetails = {
        originalDetectedIngredients: initialAnalysis.detailedIngredients?.length || 0,
        enrichedDetectedIngredients: enrichedJson.detailedIngredients?.length || 0,
        originalConfidence: initialAnalysis.confidence || 0,
        enrichedConfidence: enrichedJson.confidence || 0,
        originalIngredientsList: initialAnalysis.ingredientList || [],
        isImprovement: (enrichedJson.detailedIngredients?.length || 0) > (initialAnalysis.detailedIngredients?.length || 0)
      };
      
      console.timeEnd(`⏱️ [${requestId}] refineLowConfidenceAnalysis`);
      return enrichedJson;
    } catch (parseError) {
      console.error(`[${requestId}] Error parsing enriched analysis:`, parseError);
      console.timeEnd(`⏱️ [${requestId}] refineLowConfidenceAnalysis`);
      return initialAnalysis; // Return original if parsing fails
    }
  } catch (error) {
    console.error(`[${requestId}] Error in enrichment pass:`, error);
    console.timeEnd(`⏱️ [${requestId}] refineLowConfidenceAnalysis`);
    return initialAnalysis; // Return original if any error occurs
  }
}

// Helper function to get goal-specific prompts
function getGoalSpecificPrompt(healthGoal: string): string {
  // Normalize the goal text for comparison
  const normalizedGoal = healthGoal.toLowerCase().trim();
  
  // Create a base template that works for any goal
  const basePrompt = `For the specific health goal of "${healthGoal}", analyze this meal for:

1. NUTRIENTS RELEVANT TO THIS GOAL:
   - Identify key nutrients, compounds, and bioactive components that specifically support this goal
   - Note any nutrient deficiencies or excesses that may impact this goal

2. TIMING AND PORTION FACTORS:
   - Consider meal timing in relation to the goal (pre/post-workout, morning energy, evening recovery, etc.)
   - Assess portion sizes and macronutrient ratios as they relate to the stated goal

3. SCIENTIFIC CONTEXT:
   - Reference relevant nutritional science and research findings when explaining benefits or concerns
   - Consider biological mechanisms that connect the meal composition to the specific goal

4. PRACTICAL IMPACT:
   - Evaluate how this exact meal composition supports or hinders the specific goal
   - Suggest research-backed modifications tailored to better support the goal

When scoring this meal (1-10 scale), consider:
- 8-10: Excellent support with multiple evidence-based components that directly aid this goal
- 5-7: Moderate support with some beneficial elements but evidence-based room for improvement
- 1-4: Limited support or contains elements that may work against this specific goal based on research`;

  // Goal-specific additional analysis prompts
  if (normalizedGoal.includes('sleep') || normalizedGoal.includes('insomnia') || normalizedGoal.includes('rest')) {
    return `${basePrompt}

SLEEP-SPECIFIC ANALYSIS:
- Evaluate tryptophan content (precursor to serotonin and melatonin)
- Check for magnesium, potassium, and calcium (muscle relaxation and nervous system regulation)
- Assess vitamin B6 levels (helps convert tryptophan to serotonin)
- Look for natural sources of melatonin (cherries, nuts)
- Identify sleep disruptors: caffeine, alcohol, tyramine, high-sugar, highly processed foods
- Note if meal is too heavy/large for evening consumption (digestive burden)
- Reference timing considerations (ideally 2-3 hours before sleep)

Particularly note the glycemic index/load as blood sugar spikes can disrupt sleep architecture and increase nocturnal awakenings.`;
  } 
  else if (normalizedGoal.includes('weight') || normalizedGoal.includes('fat loss') || normalizedGoal.includes('lean') || normalizedGoal.includes('slim')) {
    return `${basePrompt}

WEIGHT MANAGEMENT-SPECIFIC ANALYSIS:
- Assess protein adequacy (research suggests 25-30g per meal for satiety and thermogenesis)
- Evaluate fiber content (targeting 7-10g per meal for satiety and digestive health)
- Calculate approximate caloric density and portion appropriateness
- Examine added sugar content and refined carbohydrate presence (insulin response)
- Check for healthy fats that promote satiety without excessive calories
- Identify compounds that support metabolic rate (e.g., capsaicin, catechins)
- Note water content of foods (hydration and fullness)

Reference protein leverage hypothesis (prioritizing protein can reduce overall caloric intake) and the satiety index of included foods.`;
  }
  else if (normalizedGoal.includes('muscle') || normalizedGoal.includes('strength') || normalizedGoal.includes('bulk') || normalizedGoal.includes('gain mass')) {
    return `${basePrompt}

MUSCLE BUILDING-SPECIFIC ANALYSIS:
- Calculate complete protein content (aiming for 20-40g with essential amino acids)
- Assess leucine content specifically (2-3g threshold for maximal muscle protein synthesis)
- Evaluate carbohydrate adequacy for glycogen replenishment and anabolic signaling
- Check for anti-inflammatory compounds that support recovery
- Identify micronutrients crucial for muscle growth (zinc, magnesium, vitamin D)
- Note creatine sources if present (primarily in meat)
- Assess overall caloric adequacy for tissue building (slight surplus needed)

Reference protein timing (anabolic window), leucine threshold for MPS activation, and mTOR pathway support from various nutrients.`;
  }
  else if (normalizedGoal.includes('energy') || normalizedGoal.includes('fatigue') || normalizedGoal.includes('alertness') || normalizedGoal.includes('focus') || normalizedGoal.includes('productivity')) {
    return `${basePrompt}

ENERGY-SPECIFIC ANALYSIS:
- Evaluate complex carbohydrate content for sustained glucose release
- Assess B-vitamin content (B1, B2, B3, B5, B6, B12) for energy metabolism
- Check iron content and sources (heme vs. non-heme) for oxygen transport
- Note presence of natural stimulants (caffeine, theobromine, etc.)
- Identify potential blood sugar stabilizers (fiber, protein, healthy fats)
- Examine hydration factors (dehydration is a major energy depleter)
- Check for CoQ10, L-carnitine, and other mitochondrial support nutrients

Reference glycemic load impact on energy curves, steady vs. spiking blood glucose patterns, and the role of proper mitochondrial function in sustained energy production.`;
  }
  else if (normalizedGoal.includes('heart') || normalizedGoal.includes('cardiac') || normalizedGoal.includes('blood pressure') || normalizedGoal.includes('cholesterol')) {
    return `${basePrompt}

CARDIOVASCULAR HEALTH-SPECIFIC ANALYSIS:
- Assess omega-3 fatty acid content (EPA/DHA primarily) for anti-inflammatory effects
- Evaluate fiber profile, especially soluble fiber for cholesterol management
- Check sodium-to-potassium ratio (ideally lower sodium, higher potassium)
- Identify polyphenols, flavonoids, and antioxidants that support endothelial function
- Note plant sterols/stanols that can reduce cholesterol absorption
- Examine magnesium and calcium levels for vascular health and blood pressure
- Check for L-arginine sources that support nitric oxide production

Reference DASH and Mediterranean dietary patterns, research on nitric oxide production, and the impact of specific fatty acid profiles on cardiovascular markers.`;
  }
  else if (normalizedGoal.includes('recovery') || normalizedGoal.includes('inflammation') || normalizedGoal.includes('pain') || normalizedGoal.includes('injury') || normalizedGoal.includes('healing')) {
    return `${basePrompt}

RECOVERY-SPECIFIC ANALYSIS:
- Evaluate anti-inflammatory compounds (omega-3s, turmeric/curcumin, ginger)
- Assess antioxidant content (vitamin C, E, selenium, flavonoids, anthocyanins)
- Check for collagen-supporting nutrients (vitamin C, copper, glycine sources)
- Note protein adequacy and quality for tissue repair (complete amino acid profile)
- Identify compounds that modulate inflammatory pathways (resveratrol, quercetin)
- Check for prebiotics/probiotics that support gut health (systemic inflammation reducer)
- Examine electrolyte profile for hydration optimization

Reference the resolution phase of inflammation, research on cytokine modulation by nutrients, and antioxidant capacity measured by ORAC values.`;
  }
  else if (normalizedGoal.includes('immune') || normalizedGoal.includes('sick') || normalizedGoal.includes('cold') || normalizedGoal.includes('flu') || normalizedGoal.includes('infection')) {
    return `${basePrompt}

IMMUNE SUPPORT-SPECIFIC ANALYSIS:
- Assess vitamin C content (neutrophil function, antioxidant protection)
- Evaluate zinc levels (T-cell production, thymus function)
- Check for vitamin D content (critical immune modulator)
- Identify prebiotic and probiotic content (gut-immune axis support)
- Note selenium and vitamin E levels (antioxidant defense system)
- Check for immune-supporting herbs/spices (elderberry, garlic, oregano, etc.)
- Examine protein adequacy (crucial for antibody production)

Reference the impact on innate vs. adaptive immunity, immunomodulatory effects of various nutrients, and research on gut microbiome diversity for immune resilience.`;
  }
  else if (normalizedGoal.includes('digestion') || normalizedGoal.includes('gut') || normalizedGoal.includes('stomach') || normalizedGoal.includes('ibs') || normalizedGoal.includes('bloat')) {
    return `${basePrompt}

DIGESTIVE HEALTH-SPECIFIC ANALYSIS:
- Evaluate prebiotic fiber sources (diversity and quantity)
- Assess probiotic content (fermented foods, live cultures)
- Check for common digestive irritants (excessive FODMAPs, gluten if sensitive)
- Identify anti-inflammatory components for gut lining support
- Note presence of digestive enzymes or enzyme-supporting foods
- Examine hydration factors and fluid content
- Check for polyphenols that support microbiome diversity

Reference research on short-chain fatty acid production, microbiome diversity impacts, and the enteric nervous system response to various food compounds.`;
  }
  else if (normalizedGoal.includes('brain') || normalizedGoal.includes('cognitive') || normalizedGoal.includes('memory') || normalizedGoal.includes('mental')) {
    return `${basePrompt}

COGNITIVE FUNCTION-SPECIFIC ANALYSIS:
- Assess omega-3 fatty acid content, especially DHA for brain cell structure
- Evaluate antioxidant profile for neuronal protection
- Check for choline content (acetylcholine precursor) for memory and learning
- Identify flavonoids that promote neuroplasticity and cerebral blood flow
- Note presence of vitamin E, B vitamins (especially B12, folate) for cognitive support
- Check for compounds that cross the blood-brain barrier (curcumin, resveratrol)
- Examine glucose availability for brain energy

Reference research on BDNF (brain-derived neurotrophic factor) production, neuroinflammation pathways, and the gut-brain axis connections.`;
  }
  else if (normalizedGoal.includes('run') || normalizedGoal.includes('marathon') || normalizedGoal.includes('workout') || normalizedGoal.includes('training') || normalizedGoal.includes('endurance') || normalizedGoal.includes('exercise') || normalizedGoal.includes('gym')) {
    return `${basePrompt}

ATHLETIC PERFORMANCE-SPECIFIC ANALYSIS:
- Evaluate carbohydrate content and type for glycogen replenishment
- Assess protein quality and quantity for recovery and adaptation
- Check electrolyte balance (sodium, potassium, magnesium) for hydration
- Identify anti-inflammatory compounds that may aid recovery
- Note nitrate content (beets, leafy greens) for potential performance benefits
- Check antioxidant balance (moderate amounts support recovery)
- Examine timing in relation to training (pre, during, post-workout considerations)

Reference research on glycogen supercompensation, protein timing for recovery, nitric oxide production for blood flow, and exercise-induced inflammation management.`;
  }
  else {
    // Return the enhanced base prompt for any other goal type
    return basePrompt;
  }
}

// Function to get nutrition data from Nutritionix API
async function getNutritionData(ingredients: string[]): Promise<Array<{
  ingredient: string;
  data: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber: number;
    sugar: number;
    sodium: number;
    potassium: number;
    magnesium: number;
    calcium: number;
    iron: number;
  };
}>> {
  console.time('getNutritionData');
  // In a production app, you would keep these keys in environment variables
  const NUTRITIONIX_APP_ID = process.env.NUTRITIONIX_APP_ID;
  const NUTRITIONIX_API_KEY = process.env.NUTRITIONIX_API_KEY;
  
  console.log('Nutritionix API credentials available:', !!NUTRITIONIX_APP_ID && !!NUTRITIONIX_API_KEY);
  
  if (!NUTRITIONIX_APP_ID || !NUTRITIONIX_API_KEY) {
    console.timeEnd('getNutritionData');
    throw new Error('Nutritionix API credentials are not configured');
  }

  try {
    const nutritionData: Array<{
      ingredient: string;
      data: {
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        fiber: number;
        sugar: number;
        sodium: number;
        potassium: number;
        magnesium: number;
        calcium: number;
        iron: number;
      };
    }> = [];
    
    // Create a global timeout for all Nutritionix API calls
    const globalTimeoutPromise = new Promise<null>((_, reject) => {
      setTimeout(() => {
        console.warn('Nutritionix API global timeout reached after 10 seconds');
        reject(new Error('Nutritionix API global timeout after 10 seconds'));
      }, 10000); // 10 second global timeout
    });
    
    // Use Promise.allSettled with timeout to fetch all ingredients
    const nutritionPromises = ingredients.map(async (ingredient) => {
      console.log(`Fetching nutrition data for: ${ingredient}`);
      
      try {
        // Create an AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout per ingredient
        
        const response = await axios.post(
          'https://trackapi.nutritionix.com/v2/natural/nutrients',
          {
            query: ingredient,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'x-app-id': NUTRITIONIX_APP_ID,
              'x-app-key': NUTRITIONIX_API_KEY,
            },
            signal: controller.signal,
            timeout: 5000, // Also set axios timeout
          }
        );
        
        // Clear the timeout
        clearTimeout(timeoutId);
        
        console.log(`Received nutrition data for: ${ingredient}`);
        
        if (response.data.foods && response.data.foods.length > 0) {
          const food = response.data.foods[0];
          return {
            ingredient,
            data: {
              calories: food.nf_calories,
              protein: food.nf_protein,
              carbs: food.nf_total_carbohydrate,
              fat: food.nf_total_fat,
              fiber: food.nf_dietary_fiber,
              sugar: food.nf_sugars,
              sodium: food.nf_sodium,
              potassium: food.nf_potassium,
              magnesium: food.full_nutrients.find((n: any) => n.attr_id === 304)?.value || 0,
              calcium: food.full_nutrients.find((n: any) => n.attr_id === 301)?.value || 0,
              iron: food.full_nutrients.find((n: any) => n.attr_id === 303)?.value || 0,
            },
          };
        }
        return null;
      } catch (err: any) {
        // If this individual ingredient lookup fails, don't fail the whole process
        console.error(`Error fetching nutrition for "${ingredient}":`, err.message);
        return null;
      }
    });
    
    // Use Promise.race to handle the global timeout
    try {
      const results = await Promise.race([
        Promise.allSettled(nutritionPromises),
        globalTimeoutPromise.then(() => {
          throw new Error('Nutritionix API calls timed out after 10 seconds');
        })
      ]) as PromiseSettledResult<any>[];
      
      // Process the results, including any that were fulfilled
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          nutritionData.push(result.value);
        }
      });
      
      console.log(`Successfully processed ${nutritionData.length} out of ${ingredients.length} ingredients`);
    } catch (timeoutError) {
      console.warn('Nutrition data collection timed out, proceeding with partial data:', timeoutError);
      // We'll continue with whatever nutrition data we've collected so far
    }
    
    console.timeEnd('getNutritionData');
    return nutritionData;
  } catch (error) {
    console.error('Error fetching nutrition data from Nutritionix:', error);
    console.timeEnd('getNutritionData');
    // Return empty array instead of failing the whole process
    return [];
  }
}

// Function to format the response
function formatResponse(
  gptAnalysis: any,
  nutritionData: any[],
  healthGoal: string
): {
  description: string;
  nutrients: any[];
  feedback: string[];
  suggestions: string[];
  goalScore?: number;
  goalName: string;
  scoreExplanation?: string;
  positiveFoodFactors?: string[];
  negativeFoodFactors?: string[];
  rawGoal: string;
  confidence?: number;
  detailedIngredients?: any[];
  reasoningLogs?: any[];
  // Add new properties to match what we're setting in the POST handler
  status?: string;
  success?: boolean;
  fallback?: boolean;
  message?: string;
  partialResults?: boolean;
  _meta?: any;
  lowConfidence?: boolean;
  ingredients?: string[];
} {
  // Extend the supportive nutrients map with more detailed, goal-specific nutrients
  const nutrientSupportMap: Record<string, string[]> = {
    'Sleep': ['magnesium', 'calcium', 'potassium', 'tryptophan', 'vitamin b6', 'melatonin', 'fiber'],
    'Weight Management': ['protein', 'fiber', 'water', 'chromium', 'green tea', 'caffeine'],
    'Muscle Building': ['protein', 'leucine', 'calcium', 'creatine', 'vitamin d', 'zinc', 'magnesium'],
    'Energy': ['b vitamins', 'iron', 'magnesium', 'carbohydrate', 'copper', 'vitamin c'],
    'Heart Health': ['potassium', 'magnesium', 'omega-3', 'fiber', 'antioxidant', 'vitamin e', 'vitamin d'],
    'Recovery': ['protein', 'antioxidant', 'omega-3', 'turmeric', 'vitamin c', 'vitamin e', 'zinc', 'magnesium'],
    'Immune': ['vitamin c', 'vitamin d', 'zinc', 'selenium', 'probiotics', 'vitamin a'],
    'Performance': ['carbohydrate', 'protein', 'electrolytes', 'iron', 'creatine', 'beta-alanine', 'nitrates'],
    'Post Run Recovery': ['protein', 'carbohydrate', 'potassium', 'magnesium', 'antioxidants', 'electrolytes', 'fluids', 'tart cherry'],
    'Digestion': ['fiber', 'probiotics', 'water', 'ginger', 'papaya', 'mint', 'cinnamon'],
    'Cognitive Function': ['omega-3', 'antioxidant', 'vitamin e', 'flavonoids', 'vitamin b12', 'folate', 'choline']
  };

  // Define negative nutrients for specific goals
  const negativeNutrientMap: Record<string, string[]> = {
    'Sleep': ['caffeine', 'alcohol', 'sugar', 'fat', 'spice', 'tyramine'],
    'Weight Management': ['added sugar', 'refined carbs', 'trans fat', 'saturated fat', 'artificial sweeteners'],
    'Muscle Building': ['alcohol', 'excess fiber', 'food allergens'],
    'Energy': ['simple sugar', 'alcohol', 'high fat', 'artificial additives'],
    'Heart Health': ['sodium', 'trans fat', 'saturated fat', 'cholesterol', 'added sugar'],
    'Recovery': ['alcohol', 'processed food', 'sugar', 'omega-6', 'trans fat'],
    'Immune': ['alcohol', 'added sugar', 'processed foods', 'artificial additives'],
    'Performance': ['high fat', 'high fiber', 'alcohol', 'caffeine'],
    'Post Run Recovery': ['alcohol', 'excess caffeine', 'high fat', 'low carb', 'dehydrating foods'],
    'Digestion': ['fried foods', 'processed meat', 'alcohol', 'artificial additives', 'excess fat'],
    'Cognitive Function': ['trans fat', 'excess saturated fat', 'refined sugar', 'alcohol', 'artificial additives']
  };
  
  // Use a more nuanced approach for determining goal type
  const goalType = getGoalCategoryType(healthGoal);
  
  // Get the appropriate beneficial and negative nutrients lists, with fallback to a general health list
  const supportiveNutrientList = nutrientSupportMap[goalType] || [
    'protein', 'fiber', 'vitamin', 'mineral', 'antioxidant', 'omega-3', 'polyphenol', 'water'
  ];
  
  const harmfulNutrients = negativeNutrientMap[goalType] || [
    'added sugar', 'trans fat', 'saturated fat', 'excess sodium', 'artificial', 'processed'
  ];
  
  // Ensure we have basic nutrition values, even if estimated
  const basicNutrition = gptAnalysis.basicNutrition || {
    calories: "300-400",
    protein: "15-20",
    carbs: "30-40",
    fat: "10-15"
  };

  // Process detailed ingredients if available from enhanced analysis
  const detailedIngredients = gptAnalysis.detailedIngredients 
    ? gptAnalysis.detailedIngredients.map((ingredient: any) => ({
        name: ingredient.name,
        category: ingredient.category || 'unknown',
        confidence: ingredient.confidence || 5.0,
        confidenceEmoji: getConfidenceEmoji(ingredient.confidence || 5.0)
      }))
    : gptAnalysis.ingredientList 
      ? gptAnalysis.ingredientList.map((ingredient: string, index: number) => ({
          name: ingredient,
          category: 'food item',
          confidence: 5.0, // Medium confidence as default
          confidenceEmoji: '🟡' // Medium confidence as default
        }))
      : [];
  
  // Prepare the nutrients array with smarter highlighting based on the goal
  const nutrients = [
    {
      name: 'Calories',
      value: basicNutrition.calories,
      unit: 'kcal',
      isHighlight: goalType === 'Weight Management' || goalType === 'Muscle Building',
    },
    {
      name: 'Protein',
      value: basicNutrition.protein,
      unit: 'g',
      isHighlight: goalType === 'Muscle Building' || goalType === 'Recovery' || goalType === 'Athletic Performance' || goalType === 'Weight Management',
    },
    {
      name: 'Carbs',
      value: basicNutrition.carbs,
      unit: 'g',
      isHighlight: goalType === 'Energy' || goalType === 'Athletic Performance',
    },
    {
      name: 'Fat',
      value: basicNutrition.fat,
      unit: 'g',
      isHighlight: goalType === 'Heart Health' || goalType === 'Cognitive Function',
    },
  ];
  
  // Add detailed nutrient data from Nutritionix with smarter context awareness
  if (nutritionData.length > 0) {
    // First, collect all nutrients from all ingredients
    const aggregatedNutrients: {[key: string]: {value: number, unit: string}} = {};
    
    nutritionData.forEach(item => {
      const data = item.data;
      
      // List of common nutrients with their units
      const micronutrients = [
        { name: 'Magnesium', value: data.magnesium, unit: 'mg' },
        { name: 'Potassium', value: data.potassium, unit: 'mg' },
        { name: 'Calcium', value: data.calcium, unit: 'mg' },
        { name: 'Fiber', value: data.fiber, unit: 'g' },
        { name: 'Sugar', value: data.sugar, unit: 'g' },
        { name: 'Sodium', value: data.sodium, unit: 'mg' },
        { name: 'Iron', value: data.iron, unit: 'mg' },
        { name: 'Zinc', value: data.zinc || 0, unit: 'mg' },
        { name: 'Vitamin C', value: data.vitamin_c || 0, unit: 'mg' },
        { name: 'Vitamin D', value: data.vitamin_d || 0, unit: 'µg' },
        { name: 'Vitamin E', value: data.vitamin_e || 0, unit: 'mg' },
        { name: 'Vitamin B6', value: data.vitamin_b6 || 0, unit: 'mg' },
        { name: 'Vitamin B12', value: data.vitamin_b12 || 0, unit: 'µg' },
        { name: 'Folate', value: data.folate || 0, unit: 'µg' },
        { name: 'Selenium', value: data.selenium || 0, unit: 'µg' },
        { name: 'Omega-3', value: data.omega_3 || 0, unit: 'g' }
      ];
      
      // Aggregate values across all ingredients
      micronutrients.forEach(nutrient => {
        if (nutrient.value > 0) {
          if (!aggregatedNutrients[nutrient.name]) {
            aggregatedNutrients[nutrient.name] = { value: 0, unit: nutrient.unit };
          }
          aggregatedNutrients[nutrient.name].value += nutrient.value;
        }
      });
    });
    
    // Then add the aggregated nutrients to the final nutrients array
    Object.entries(aggregatedNutrients).forEach(([name, data]) => {
      const lowerName = name.toLowerCase();
      
      // Determine if this nutrient is supportive or negative for the user's goal
      const isHighlight = supportiveNutrientList.some(supportive => 
        lowerName.includes(supportive.toLowerCase()) || supportive.includes(lowerName)
      );
      
      const isNegative = harmfulNutrients.some(negative => 
        lowerName.includes(negative.toLowerCase()) || negative.includes(lowerName)
      );
      
      // Add to the nutrients array
      nutrients.push({
        name,
        value: data.value.toFixed(1),
        unit: data.unit,
        isHighlight: isHighlight && !isNegative,
      });
    });
  }
  
  // Use the goalImpactScore provided by GPT, or calculate a scientifically informed score
  let goalScore = gptAnalysis.goalImpactScore || 0;
  let scoreExplanation = gptAnalysis.scoreExplanation || '';
  let positiveFoodFactors = gptAnalysis.positiveFoodFactors || [];
  let negativeFoodFactors = gptAnalysis.negativeFoodFactors || [];
  
  // If GPT didn't provide a goal score or it's outside the valid range, calculate a fallback score
  if (!goalScore || goalScore < 1 || goalScore > 10) {
    // Calculate a score based on the goal with more nuanced logic
    let calculatedScore = 5; // Start with a neutral score
    
    // Count the number of supportive and negative nutrients present
    let supportiveCount = 0;
    let negativeCount = 0;
    
    nutrients.forEach(nutrient => {
      const name = nutrient.name.toLowerCase();
      
      // Check for supportive nutrients
      if (supportiveNutrientList.some(supportive => 
        name.includes(supportive.toLowerCase()) || supportive.includes(name)
      )) {
        supportiveCount++;
        calculatedScore += 0.5; // Add half a point for each supportive nutrient
      }
      
      // Check for negative nutrients
      if (harmfulNutrients.some(negative => 
        name.includes(negative.toLowerCase()) || negative.includes(name)
      )) {
        negativeCount++;
        calculatedScore -= 0.75; // Subtract points for negative nutrients
      }
    });
    
    // Add bonus points for balanced meals with multiple supportive nutrients
    if (supportiveCount >= 3) {
      calculatedScore += 1;
    }
    
    // Add goal-specific bonus points
    if (goalType === 'Muscle Building' && parseFloat(basicNutrition.protein) >= 20) {
      calculatedScore += 1; // Bonus for high protein for muscle building
    }
    
    if (goalType === 'Weight Management' && nutrients.some(n => n.name.toLowerCase() === 'fiber' && parseFloat(n.value) >= 5)) {
      calculatedScore += 1; // Bonus for high fiber for weight management
    }
    
    if (goalType === 'Heart Health' && nutrients.some(n => n.name.toLowerCase() === 'omega-3')) {
      calculatedScore += 1; // Bonus for omega-3 for heart health
    }
    
    // Ensure score is between 1 and 10
    goalScore = Math.max(1, Math.min(10, Math.round(calculatedScore)));
    
    // Generate a research-informed explanation if none exists
    if (!scoreExplanation) {
      if (goalScore >= 8) {
        scoreExplanation = `This meal provides excellent nutritional support for your ${healthGoal} goal with multiple research-backed components.`;
      } else if (goalScore >= 5) {
        scoreExplanation = `This meal provides moderate support for your ${healthGoal} goal, though some evidence-based adjustments could enhance benefits.`;
      } else {
        scoreExplanation = `This meal may not be optimal for your ${healthGoal} goal based on current nutritional research.`;
      }
    }
    
    // Generate smart positive/negative factors if not provided by GPT
    if (positiveFoodFactors.length === 0) {
      // Generate positive factors based on ingredients and the goal type
      if (gptAnalysis.ingredientList) {
        const ingredients: string[] = Array.isArray(gptAnalysis.ingredientList) 
          ? gptAnalysis.ingredientList 
          : typeof gptAnalysis.ingredientList === 'string'
            ? gptAnalysis.ingredientList.split(',').map((item: string) => item.trim())
            : [];
            
        // Generate goal-specific positive factors
        positiveFoodFactors = generatePositiveFactors(ingredients, goalType, nutrients);
      }
    }
    
    if (negativeFoodFactors.length === 0) {
      // Generate negative factors based on ingredients and the goal type
      if (gptAnalysis.ingredientList) {
        const ingredients: string[] = Array.isArray(gptAnalysis.ingredientList) 
          ? gptAnalysis.ingredientList 
          : typeof gptAnalysis.ingredientList === 'string'
            ? gptAnalysis.ingredientList.split(',').map((item: string) => item.trim())
            : [];
            
        // Generate goal-specific negative factors
        negativeFoodFactors = generateNegativeFactors(ingredients, goalType, nutrients);
      }
    }
  }
  
  // Format the goal name for display
  const goalName = formatGoalName(healthGoal);
  
  // Include reasoning logs if available
  const reasoningLogs = gptAnalysis.reasoningLogs || [];
  
  // Get image challenges if available
  const imageChallenges = gptAnalysis.imageChallenges || [];
  
  // Now return the object with all properties
  return {
    description: gptAnalysis.description || 'A meal containing various ingredients and nutrients.',
    nutrients,
    feedback: gptAnalysis.feedback || ['Try to eat a balanced meal with protein, healthy fats, and complex carbohydrates.'],
    suggestions: gptAnalysis.suggestions || ['Consider adding more vegetables to your next meal.'],
    goalScore,
    goalName: formatGoalName(healthGoal),
    scoreExplanation,
    positiveFoodFactors,
    negativeFoodFactors,
    rawGoal: healthGoal,
    confidence: gptAnalysis.confidence || 5, // Extract confidence score with fallback to medium confidence
    detailedIngredients,
    reasoningLogs,
    ingredients: gptAnalysis.ingredientList || [],
    status: 'success',
    success: true,
    fallback: false,
    lowConfidence: isLowConfidenceAnalysis(gptAnalysis),
    message: '',
    partialResults: false,
    _meta: undefined
  };
}

// Helper function to get confidence emoji
function getConfidenceEmoji(confidence: number): string {
  if (confidence >= 8) return '🟢'; // High confidence
  if (confidence >= 5) return '🟡'; // Medium confidence
  return '🔴'; // Low confidence
}

// Helper function to generate positive factors based on ingredients and goal type
function generatePositiveFactors(ingredients: string[], goalType: string, nutrients: any[]): string[] {
  const positiveFactors: string[] = [];
  
  // Goal-specific ingredient analysis
  switch (goalType) {
    case 'Sleep':
      if (ingredients.some(i => i.toLowerCase().includes('milk') || i.toLowerCase().includes('dairy'))) {
        positiveFactors.push('Contains dairy with tryptophan and calcium that support melatonin production');
      }
      if (ingredients.some(i => i.toLowerCase().includes('cherry') || i.toLowerCase().includes('kiwi') || i.toLowerCase().includes('banana'))) {
        positiveFactors.push('Contains natural sources of melatonin and sleep-promoting compounds');
      }
      if (ingredients.some(i => i.toLowerCase().includes('turkey') || i.toLowerCase().includes('chicken') || i.toLowerCase().includes('nuts'))) {
        positiveFactors.push('Contains tryptophan-rich foods that support serotonin production');
      }
      break;
      
    case 'Muscle Building':
      if (ingredients.some(i => 
        i.toLowerCase().includes('chicken') || 
        i.toLowerCase().includes('beef') || 
        i.toLowerCase().includes('fish') || 
        i.toLowerCase().includes('egg') || 
        i.toLowerCase().includes('greek yogurt')
      )) {
        positiveFactors.push('Contains complete proteins with essential amino acids for muscle synthesis');
      }
      if (ingredients.some(i => i.toLowerCase().includes('rice') || i.toLowerCase().includes('potato') || i.toLowerCase().includes('pasta'))) {
        positiveFactors.push('Contains complex carbohydrates for glycogen replenishment and recovery');
      }
      if (nutrients.some(n => n.name.toLowerCase() === 'zinc' || n.name.toLowerCase() === 'magnesium')) {
        positiveFactors.push('Contains minerals essential for testosterone production and muscle function');
      }
      break;
      
    case 'Energy':
      if (ingredients.some(i => i.toLowerCase().includes('oats') || i.toLowerCase().includes('brown rice') || i.toLowerCase().includes('quinoa'))) {
        positiveFactors.push('Contains slow-releasing complex carbs for sustained energy');
      }
      if (ingredients.some(i => i.toLowerCase().includes('spinach') || i.toLowerCase().includes('leafy green') || i.toLowerCase().includes('red meat'))) {
        positiveFactors.push('Contains iron-rich foods that support oxygen transport and energy production');
      }
      if (nutrients.some(n => n.name.toLowerCase().includes('b vitamin'))) {
        positiveFactors.push('Contains B vitamins that support energy metabolism and cell function');
      }
      break;
      
    case 'Heart Health':
      if (ingredients.some(i => i.toLowerCase().includes('salmon') || i.toLowerCase().includes('fish') || i.toLowerCase().includes('flax') || i.toLowerCase().includes('chia'))) {
        positiveFactors.push('Contains omega-3 fatty acids that support cardiovascular health');
      }
      if (ingredients.some(i => i.toLowerCase().includes('berry') || i.toLowerCase().includes('colorful vegetable') || i.toLowerCase().includes('fruit'))) {
        positiveFactors.push('Contains antioxidants and polyphenols that support heart health');
      }
      if (ingredients.some(i => i.toLowerCase().includes('bean') || i.toLowerCase().includes('lentil') || i.toLowerCase().includes('oat'))) {
        positiveFactors.push('Contains soluble fiber that helps manage cholesterol levels');
      }
      break;
      
    case 'Recovery':
      if (ingredients.some(i => i.toLowerCase().includes('berry') || i.toLowerCase().includes('cherry') || i.toLowerCase().includes('pineapple'))) {
        positiveFactors.push('Contains anti-inflammatory compounds and antioxidants that reduce muscle soreness');
      }
      if (ingredients.some(i => i.toLowerCase().includes('salmon') || i.toLowerCase().includes('tuna') || i.toLowerCase().includes('olive oil'))) {
        positiveFactors.push('Contains omega-3 and healthy fats that reduce inflammation');
      }
      if (ingredients.some(i => i.toLowerCase().includes('turmeric') || i.toLowerCase().includes('ginger'))) {
        positiveFactors.push('Contains natural anti-inflammatory compounds that support recovery');
      }
      break;
      
    case 'Athletic Performance':
      if (ingredients.some(i => i.toLowerCase().includes('beet') || i.toLowerCase().includes('leafy green'))) {
        positiveFactors.push('Contains nitrates that may improve blood flow and exercise performance');
      }
      if (ingredients.some(i => i.toLowerCase().includes('banana') || i.toLowerCase().includes('sweet potato') || i.toLowerCase().includes('whole grain'))) {
        positiveFactors.push('Contains ideal carbohydrates for pre-workout energy and glycogen storage');
      }
      if (ingredients.some(i => i.toLowerCase().includes('greek yogurt') || i.toLowerCase().includes('cottage cheese') || i.toLowerCase().includes('chicken'))) {
        positiveFactors.push('Contains high-quality protein for muscle recovery and adaptation');
      }
      break;
      
    default:
      // Generic positive factors for any health goal
      if (ingredients.some(i => 
        i.toLowerCase().includes('vegetable') || 
        i.toLowerCase().includes('broccoli') || 
        i.toLowerCase().includes('spinach') || 
        i.toLowerCase().includes('kale')
      )) {
        positiveFactors.push('Contains nutrient-dense vegetables with vitamins, minerals, and antioxidants');
      }
      if (ingredients.some(i => i.toLowerCase().includes('protein') || i.toLowerCase().includes('chicken') || i.toLowerCase().includes('fish'))) {
        positiveFactors.push('Contains quality protein for tissue maintenance and satiety');
      }
      if (ingredients.some(i => i.toLowerCase().includes('whole grain') || i.toLowerCase().includes('brown rice') || i.toLowerCase().includes('quinoa'))) {
        positiveFactors.push('Contains complex carbohydrates for sustained energy release');
      }
  }
  
  // Add at least one generic positive factor if none were generated
  if (positiveFactors.length === 0) {
    positiveFactors.push('Contains nutrients that contribute to overall health and wellbeing');
  }
  
  return positiveFactors;
}

// Helper function to generate negative factors based on ingredients and goal type
function generateNegativeFactors(ingredients: string[], goalType: string, nutrients: any[]): string[] {
  const negativeFactors: string[] = [];
  
  // Goal-specific ingredient analysis for negative factors
  switch (goalType) {
    case 'Sleep':
      if (ingredients.some(i => i.toLowerCase().includes('coffee') || i.toLowerCase().includes('chocolate') || i.toLowerCase().includes('tea'))) {
        negativeFactors.push('Contains caffeine which may disrupt sleep by blocking adenosine receptors');
      }
      if (ingredients.some(i => i.toLowerCase().includes('sugar') || i.toLowerCase().includes('dessert') || i.toLowerCase().includes('candy'))) {
        negativeFactors.push('Contains added sugars which may cause blood sugar fluctuations during sleep');
      }
      if (ingredients.some(i => i.toLowerCase().includes('spicy') || i.toLowerCase().includes('hot sauce') || i.toLowerCase().includes('chili'))) {
        negativeFactors.push('Contains spicy elements that may cause digestive discomfort and disrupt sleep');
      }
      break;
      
    case 'Weight Management':
      if (ingredients.some(i => i.toLowerCase().includes('sugar') || i.toLowerCase().includes('syrup') || i.toLowerCase().includes('sweet'))) {
        negativeFactors.push('Contains added sugars which may contribute to caloric surplus and insulin resistance');
      }
      if (ingredients.some(i => i.toLowerCase().includes('fried') || i.toLowerCase().includes('oil') || i.toLowerCase().includes('creamy'))) {
        negativeFactors.push('Contains high caloric density from oils/fats that may exceed energy needs');
      }
      if (ingredients.some(i => i.toLowerCase().includes('refined') || i.toLowerCase().includes('white bread') || i.toLowerCase().includes('processed'))) {
        negativeFactors.push('Contains refined carbohydrates that may spike blood sugar and increase hunger');
      }
      break;
      
    case 'Heart Health':
      if (ingredients.some(i => i.toLowerCase().includes('salt') || i.toLowerCase().includes('processed meat') || i.toLowerCase().includes('canned'))) {
        negativeFactors.push('Contains sodium which may elevate blood pressure in sensitive individuals');
      }
      if (ingredients.some(i => i.toLowerCase().includes('butter') || i.toLowerCase().includes('cheese') || i.toLowerCase().includes('cream'))) {
        negativeFactors.push('Contains saturated fats which research links to increased LDL cholesterol');
      }
      if (ingredients.some(i => i.toLowerCase().includes('processed') || i.toLowerCase().includes('package') || i.toLowerCase().includes('fast food'))) {
        negativeFactors.push('Contains processed ingredients with trans fats or oxidized oils that may impair heart health');
      }
      break;
      
    case 'Recovery':
      if (ingredients.some(i => i.toLowerCase().includes('processed') || i.toLowerCase().includes('fried') || i.toLowerCase().includes('refined'))) {
        negativeFactors.push('Contains pro-inflammatory ingredients that may delay recovery');
      }
      if (ingredients.some(i => i.toLowerCase().includes('alcohol') || i.toLowerCase().includes('beer') || i.toLowerCase().includes('wine'))) {
        negativeFactors.push('Contains alcohol which impairs protein synthesis and recovery processes');
      }
      if (nutrients.some(n => n.name.toLowerCase() === 'sugar' && parseFloat(n.value) > 10)) {
        negativeFactors.push('Contains excess sugar which may increase systemic inflammation');
      }
      break;
      
    default:
      // Generic negative factors for any health goal
      if (ingredients.some(i => i.toLowerCase().includes('sugar') || i.toLowerCase().includes('syrup') || i.toLowerCase().includes('candy'))) {
        negativeFactors.push('Contains added sugars that provide calories with minimal nutritional benefit');
      }
      if (ingredients.some(i => i.toLowerCase().includes('processed') || i.toLowerCase().includes('packaged') || i.toLowerCase().includes('fast food'))) {
        negativeFactors.push('Contains processed elements with potential additives and lower nutrient density');
      }
      if (nutrients.some(n => n.name.toLowerCase() === 'sodium' && parseFloat(n.value) > 500)) {
        negativeFactors.push('Contains higher sodium levels which may not be ideal for some health goals');
      }
  }
  
  return negativeFactors;
}

// Helper function to determine the goal category type in a more nuanced way
function getGoalCategoryType(healthGoal: string): string {
  const goalLower = healthGoal.toLowerCase();
  
  if (goalLower.includes('sleep') || goalLower.includes('insomnia') || goalLower.includes('rest')) 
    return 'Sleep';
  
  if (goalLower.includes('weight') || goalLower.includes('fat') || goalLower.includes('lean') || goalLower.includes('slim')) 
    return 'Weight Management';
  
  if (goalLower.includes('muscle') || goalLower.includes('strength') || goalLower.includes('bulk') || goalLower.includes('gain mass')) 
    return 'Muscle Building';
  
  if (goalLower.includes('energy') || goalLower.includes('fatigue') || goalLower.includes('tired') || goalLower.includes('focus')) 
    return 'Energy';
  
  if (goalLower.includes('heart') || goalLower.includes('cardiac') || goalLower.includes('blood pressure') || goalLower.includes('cholesterol')) 
    return 'Heart Health';
  
  if (goalLower.includes('recovery') || goalLower.includes('inflammation') || goalLower.includes('pain') || goalLower.includes('soreness') || goalLower.includes('injury')) 
    return 'Recovery';
  
  if (goalLower.includes('immune') || goalLower.includes('sick') || goalLower.includes('cold') || goalLower.includes('flu') || goalLower.includes('virus')) 
    return 'Immune';
  
  if (goalLower.includes('digest') || goalLower.includes('gut') || goalLower.includes('stomach') || goalLower.includes('bloat') || goalLower.includes('ibs')) 
    return 'Digestive Health';
  
  if (goalLower.includes('brain') || goalLower.includes('cognitive') || goalLower.includes('memory') || goalLower.includes('focus') || goalLower.includes('mental')) 
    return 'Cognitive Function';
  
  if (goalLower.includes('run') || goalLower.includes('workout') || goalLower.includes('performance') || goalLower.includes('training') || goalLower.includes('exercise') || goalLower.includes('endurance') || goalLower.includes('gym')) 
    return 'Athletic Performance';
  
  // If no specific match is found, make an intelligent guess
  if (goalLower.includes('health') || goalLower.includes('overall') || goalLower.includes('wellbeing') || goalLower.includes('wellness')) 
    return 'General Health';
  
  // Default to General Health if no pattern is recognized
  return 'General Health';
}

// Helper function to format goal name for display
function formatGoalName(healthGoal: string): string {
  // Normalize the goal text
  const normalizedGoal = healthGoal.toLowerCase().trim();
  
  if (normalizedGoal.includes('sleep')) {
    return 'Sleep Impact';
  } 
  else if (normalizedGoal.includes('weight') || normalizedGoal.includes('fat loss')) {
    return 'Weight Management';
  }
  else if (normalizedGoal.includes('muscle') || normalizedGoal.includes('strength')) {
    return 'Muscle Building';
  }
  else if (normalizedGoal.includes('energy')) {
    return 'Energy';
  }
  else if (normalizedGoal.includes('heart') || normalizedGoal.includes('cardiac')) {
    return 'Heart Health';
  }
  else if (normalizedGoal.includes('recovery') || normalizedGoal.includes('inflammation')) {
    return 'Recovery';
  }
  else {
    // Capitalize first letter of each word for a generic goal
    return healthGoal
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
}

// Helper function to check if GPT results are valid and contain identified ingredients
function isValidGptAnalysis(gptAnalysis: any): { isValid: boolean; reason: string | null } {
  console.log('Validating GPT analysis results...');

  // Check if we have any result at all
  if (!gptAnalysis) {
    return { isValid: false, reason: 'no_analysis_result' };
  }

  // Check if we have an ingredients list
  if (!gptAnalysis.ingredientList || !Array.isArray(gptAnalysis.ingredientList)) {
    console.log('GPT did not return any ingredients in the image');
    return { isValid: false, reason: 'missing_ingredients_list' };
  }

  // If we have at least 1 ingredient, consider it valid but possibly low confidence
  if (gptAnalysis.ingredientList.length > 0) {
    // Check for extremely low confidence across all ingredients
    if (gptAnalysis.detailedIngredients && gptAnalysis.detailedIngredients.length > 0) {
      const totalConfidence = gptAnalysis.detailedIngredients.reduce(
        (sum: number, ingredient: any) => sum + (ingredient.confidence || 0), 0);
      const avgConfidence = totalConfidence / gptAnalysis.detailedIngredients.length;
      
      // Only consider truly extremely low confidence invalid (below 2/10)
      if (avgConfidence < 2) {
        console.log(`Extremely low average confidence (${avgConfidence.toFixed(1)}) across all ingredients`);
        return { isValid: false, reason: 'extremely_low_confidence' };
      }
    }
    
    // Has at least some ingredients with some confidence
    return { isValid: true, reason: null };
  }

  // No ingredients found at all
  return { isValid: false, reason: 'empty_ingredients_list' };
}

// Function to create a friendly fallback message based on the validation failure reason
function createFallbackResponse(reason: string, healthGoal: string, requestId: string): any {
  console.log(`[${requestId}] Creating fallback response for reason: ${reason}`);
  
  let fallbackMessage = "";
  let reasonCode = "";
  
  switch (reason) {
    case 'missing_ingredients_list':
    case 'empty_ingredients_list':
      fallbackMessage = "We couldn't identify specific ingredients in your photo. We've provided our best estimate based on what we can see.";
      reasonCode = 'estimated_ingredients';
      break;
    case 'extremely_low_confidence':
      fallbackMessage = "We detected some food items but with limited certainty. We've provided our best analysis based on what we can see.";
      reasonCode = 'low_confidence_analysis';
      break;
    case 'no_analysis_result':
      fallbackMessage = "We've provided an estimated analysis. For more accurate results, try a photo with better lighting and less blur.";
      reasonCode = 'estimated_analysis';
      break;
    default:
      fallbackMessage = "We've provided our best analysis based on what we can see in the photo.";
      reasonCode = 'partial_analysis';
  }

  // Define a default goal score based on the health goal
  let defaultGoalScore = 5; // Neutral score
  let defaultScoreExplanation = "";

  // Customize based on common health goals
  if (healthGoal.toLowerCase().includes('weight')) {
    defaultGoalScore = 4;
    defaultScoreExplanation = "This meal may be balanced, but without clear ingredient information, it's difficult to determine its exact impact on weight management.";
  } else if (healthGoal.toLowerCase().includes('sleep')) {
    defaultGoalScore = 5;
    defaultScoreExplanation = "Without clear ingredient information, we can't assess sleep-supportive nutrients like magnesium or tryptophan.";
  } else if (healthGoal.toLowerCase().includes('muscle')) {
    defaultGoalScore = 5;
    defaultScoreExplanation = "Without clear protein content information, it's difficult to assess this meal's impact on muscle building.";
  } else if (healthGoal.toLowerCase().includes('energy')) {
    defaultGoalScore = 5;
    defaultScoreExplanation = "Without clear ingredient information, we can't precisely assess how this meal impacts your energy levels.";
  } else if (healthGoal.toLowerCase().includes('heart')) {
    defaultGoalScore = 5;
    defaultScoreExplanation = "Without clear nutrient information, we can't precisely assess this meal's impact on heart health.";
  }

  // Create a fallback analysis that includes some minimal information but is still useful
  return {
    fallback: true,
    success: true, // Change to true so frontend doesn't show error
    reason: reasonCode,
    lowConfidence: true, // Mark as low confidence
    message: fallbackMessage,
    description: "A meal that appears to contain some nutritional value",
    ingredientList: ["possible protein", "possible carbohydrate", "possible vegetables"],
    detailedIngredients: [
      { name: "possible protein source", category: "protein", confidence: 3.0 },
      { name: "possible carbohydrate", category: "carbohydrate", confidence: 3.0 },
      { name: "possible vegetables", category: "vegetable", confidence: 3.0 }
    ],
    basicNutrition: {
      calories: "300-500",
      protein: "15-25g",
      carbs: "30-45g",
      fat: "10-20g"
    },
    nutrients: [
      { name: "Protein", value: "20", unit: "g", isHighlight: true },
      { name: "Carbohydrates", value: "40", unit: "g", isHighlight: false },
      { name: "Fat", value: "15", unit: "g", isHighlight: false },
      { name: "Fiber", value: "5", unit: "g", isHighlight: true },
      { name: "Calcium", value: "8", unit: "%DV", isHighlight: false },
      { name: "Iron", value: "10", unit: "%DV", isHighlight: true }
    ],
    confidence: 3,
    goalName: formatGoalName(healthGoal),
    goalImpactScore: defaultGoalScore,
    scoreExplanation: defaultScoreExplanation,
    feedback: [
      fallbackMessage,
      "Even with limited information, balanced meals typically contain protein, complex carbs, and vegetables.",
      "For better analysis, try taking photos in natural light with all food items clearly visible."
    ],
    suggestions: [
      "Consider taking photos from directly above for clearer food identification",
      "Including a variety of colorful vegetables helps support overall nutrition",
      `For ${healthGoal.toLowerCase()}, focus on meals with a good balance of macronutrients`
    ],
    positiveFoodFactors: [
      "Balanced meals typically provide sustained energy",
      "Variety in food groups helps ensure broad nutrient intake"
    ],
    negativeFoodFactors: [
      "Without clear identification, we can't assess potential dietary concerns",
      "Consider adding more colorful vegetables for increased micronutrients"
    ]
  };
}

/**
 * Uploads an image to Firebase Storage using Admin SDK
 * @param file The file data to upload
 * @param userId The user ID for the storage path
 * @param requestId The request ID for logging
 * @param timeoutMs Timeout in milliseconds
 * @returns The download URL or null if the upload fails
 */
async function uploadImageToFirebase(
  file: unknown, 
  userId: string, 
  requestId: string,
  timeoutMs: number = 5000
): Promise<string | null> {
  console.time(`⏱️ [${requestId}] uploadImageToFirebase`);
  console.log(`🖼️ [${requestId}] Starting image upload to Firebase Storage for user ${userId}`);
  
  // Debug metadata to track file types and conversion
  const debugMeta: Record<string, any> = {
    startTime: Date.now(),
    imageBufferType: typeof file,
    originalFileType: file?.constructor?.name || 'unknown',
    inspectType: Object.prototype.toString.call(file),
    imageInstanceChecks: {},
    processingSteps: [],
    errors: []
  };
  
  // Very early validation - null/undefined check
  if (file === null || file === undefined) {
    debugMeta.errors.push('File is null or undefined');
    console.error(`❌ [${requestId}] No file provided to uploadImageToFirebase`);
    console.timeEnd(`⏱️ [${requestId}] uploadImageToFirebase`);
    return null;
  }
  
  // Early validation - do we have Firebase Admin Storage?
  if (!adminStorage) {
    debugMeta.errors.push('Firebase Admin Storage not initialized');
    console.error(`❌ [${requestId}] Firebase Admin Storage is not initialized`);
    console.timeEnd(`⏱️ [${requestId}] uploadImageToFirebase`);
    return null;
  }
  
  // Early validation - do we have a valid userId?
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    debugMeta.errors.push('Invalid or missing userId');
    console.error(`❌ [${requestId}] Invalid or missing userId for uploadImageToFirebase`);
    console.timeEnd(`⏱️ [${requestId}] uploadImageToFirebase`);
    return null;
  }
  
  try {
    const fileExtension = 'jpg'; // Default to jpg for consistency
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 10);
    const filename = `${timestamp}-${randomId}.${fileExtension}`;
    const storagePath = `users/${userId}/meals/${filename}`;
    
    console.log(`📁 [${requestId}] Upload path: ${storagePath}`);
    
    // Create storage reference using admin SDK
    let file_ref;
    try {
      file_ref = adminStorage.bucket().file(storagePath);
      debugMeta.processingSteps.push('Created storage reference');
    } catch (refError: any) {
      debugMeta.errors.push(`Failed to create storage reference: ${refError.message || 'Unknown error'}`);
      console.error(`❌ [${requestId}] Failed to create storage reference:`, refError);
      console.timeEnd(`⏱️ [${requestId}] uploadImageToFirebase`);
      return null;
    }
    
    // Enhanced type checking for file conversion
    debugMeta.imageInstanceChecks = {
      isFile: typeof File !== 'undefined' && file instanceof File,
      isBlob: typeof Blob !== 'undefined' && file instanceof Blob,
      isArrayBuffer: file instanceof ArrayBuffer,
      isBuffer: Buffer.isBuffer(file),
      isUint8Array: file instanceof Uint8Array,
      isFormDataEntryValue: typeof file === 'object' && file !== null && 
                          ('stream' in file || 'arrayBuffer' in file) && 'size' in file,
      isString: typeof file === 'string',
      hasToString: typeof file === 'object' && file !== null && 
                 typeof (file as any).toString === 'function' && 
                 (file as any).toString !== Object.prototype.toString
    };
    
    console.log(`🔍 [${requestId}] Image file type analysis:`, JSON.stringify(debugMeta.imageInstanceChecks, null, 2));
    
    // Convert to Buffer with comprehensive type checking
    let fileBuffer: Buffer | null = null;
    
    try {
      debugMeta.processingSteps.push('Starting file conversion');
      
      // Already a Buffer
      if (Buffer.isBuffer(file)) {
        debugMeta.processingSteps.push('Using existing Buffer');
        
        if ((file as Buffer).length === 0) {
          debugMeta.errors.push('Provided Buffer is empty (zero bytes)');
          throw new Error('Empty buffer provided');
        }
        
        fileBuffer = file as Buffer;
      }
      // Check for Uint8Array
      else if (file instanceof Uint8Array) {
        debugMeta.processingSteps.push('Converting Uint8Array to Buffer');
        
        if ((file as Uint8Array).length === 0) {
          debugMeta.errors.push('Provided Uint8Array is empty (zero bytes)');
          throw new Error('Empty Uint8Array provided');
        }
        
        fileBuffer = Buffer.from(file);
      }
      // Check for common browser File/Blob types
      else if ((typeof File !== 'undefined' && file instanceof File) || 
              (typeof Blob !== 'undefined' && file instanceof Blob)) {
        debugMeta.processingSteps.push('Converting File/Blob to ArrayBuffer');
        
        try {
          // Safely check size if available
          if ('size' in file && (file as any).size === 0) {
            debugMeta.errors.push('File/Blob has zero size');
            throw new Error('Empty File/Blob (zero bytes)');
          }
          
          const arrayBuffer = await (file as any).arrayBuffer();
          
          if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            debugMeta.errors.push('File/Blob ArrayBuffer is empty');
            throw new Error('Empty ArrayBuffer from File/Blob');
          }
          
          debugMeta.processingSteps.push('Converting ArrayBuffer to Buffer');
          fileBuffer = Buffer.from(new Uint8Array(arrayBuffer));
          
          if (fileBuffer.length === 0) {
            debugMeta.errors.push('Buffer from File/Blob is empty after conversion');
            throw new Error('Empty buffer after File/Blob conversion');
          }
        } catch (fileError: any) {
          debugMeta.errors.push(`File/Blob conversion error: ${fileError.message || 'Unknown error'}`);
          console.warn(`⚠️ [${requestId}] Error converting File/Blob:`, fileError);
          // Continue to next method - don't throw yet
        }
      }
      
      // Handle ArrayBuffer directly
      if (!fileBuffer && file instanceof ArrayBuffer) {
        debugMeta.processingSteps.push('Converting ArrayBuffer to Buffer');
        
        if ((file as ArrayBuffer).byteLength === 0) {
          debugMeta.errors.push('Provided ArrayBuffer is empty (zero bytes)');
          throw new Error('Empty ArrayBuffer provided');
        }
        
        fileBuffer = Buffer.from(new Uint8Array(file));
        
        if (fileBuffer.length === 0) {
          debugMeta.errors.push('Buffer from ArrayBuffer is empty after conversion');
          throw new Error('Empty buffer after ArrayBuffer conversion');
        }
      }
      
      // Handle FormDataEntryValue (most common case from HTTP requests)
      if (!fileBuffer && typeof file === 'object' && file !== null) {
        // Try with arrayBuffer method
        if (!fileBuffer && 'arrayBuffer' in file && typeof (file as any).arrayBuffer === 'function') {
          debugMeta.processingSteps.push('Converting FormDataEntryValue via arrayBuffer');
          
          try {
            const arrayBuffer = await (file as any).arrayBuffer();
            
            if (!arrayBuffer || arrayBuffer.byteLength === 0) {
              debugMeta.errors.push('FormDataEntryValue ArrayBuffer is empty');
              throw new Error('Empty ArrayBuffer from FormDataEntryValue');
            }
            
            fileBuffer = Buffer.from(new Uint8Array(arrayBuffer));
            
            if (fileBuffer.length === 0) {
              debugMeta.errors.push('Buffer from FormDataEntryValue ArrayBuffer is empty after conversion'); 
              throw new Error('Empty buffer after FormDataEntryValue ArrayBuffer conversion');
            }
          } catch (arrayBufferError: any) {
            debugMeta.errors.push(`FormDataEntryValue arrayBuffer error: ${arrayBufferError.message || 'Unknown error'}`);
            console.warn(`⚠️ [${requestId}] FormData arrayBuffer method failed:`, arrayBufferError);
            // Continue to next method - don't throw yet
          }
        }
        
        // Try with stream method if arrayBuffer failed
        if (!fileBuffer && 'stream' in file && typeof (file as any).stream === 'function') {
          debugMeta.processingSteps.push('Converting FormDataEntryValue via stream');
          
          try {
            const chunks: Uint8Array[] = [];
            const stream = (file as any).stream();
            const reader = stream.getReader();
            
            let chunkCount = 0;
            let bytesRead = 0;
            
            // Read the stream chunk by chunk
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) {
                chunks.push(value);
                chunkCount++;
                bytesRead += value.length;
              }
            }
            
            debugMeta.streamStats = { chunkCount, bytesRead };
            
            if (chunks.length === 0 || bytesRead === 0) {
              debugMeta.errors.push('FormDataEntryValue stream produced no data');
              throw new Error('Empty stream from FormDataEntryValue');
            }
            
            // Combine all chunks into a single buffer
            fileBuffer = Buffer.concat(chunks);
            
            if (fileBuffer.length === 0) {
              debugMeta.errors.push('Buffer from FormDataEntryValue stream is empty after conversion');
              throw new Error('Empty buffer after FormDataEntryValue stream conversion');
            }
          } catch (streamError: any) {
            debugMeta.errors.push(`FormDataEntryValue stream error: ${streamError.message || 'Unknown error'}`);
            console.error(`❌ [${requestId}] FormData stream method failed:`, streamError.message);
            // Continue to next method - don't throw yet
          }
        }
      }
      
      // Handle string inputs (base64, data URLs)
      if (!fileBuffer && typeof file === 'string') {
        // Handle string input - empty check
        if (!file || file.length === 0) {
          debugMeta.errors.push('Provided string is empty');
          throw new Error('Empty string provided');
        }
        
        debugMeta.processingSteps.push('Converting string to Buffer');
        debugMeta.stringType = file.startsWith('data:') ? 'data-url' : 'plain-string';
        
        // Check if it's a data URL
        if (file.startsWith('data:')) {
          // Extract base64 content from data URL
          const parts = file.split(',');
          const base64Data = parts.length > 1 ? parts[1] : '';
          
          if (!base64Data || base64Data.length === 0) {
            debugMeta.errors.push('Data URL contains no base64 data');
            throw new Error('Empty base64 data in data URL');
          }
          
          try {
            fileBuffer = Buffer.from(base64Data, 'base64');
            
            if (fileBuffer.length === 0) {
              debugMeta.errors.push('Buffer from data URL is empty after conversion');
              throw new Error('Empty buffer after data URL conversion');
            }
          } catch (base64Error: any) {
            debugMeta.errors.push(`Data URL parsing error: ${base64Error.message || 'Unknown error'}`);
            throw new Error(`Failed to parse data URL as base64: ${base64Error.message}`);
          }
        } else {
          // Try as base64 directly
          try {
            fileBuffer = Buffer.from(file, 'base64');
            
            if (fileBuffer.length === 0) {
              debugMeta.errors.push('Buffer from base64 string is empty after conversion');
              throw new Error('Empty buffer after base64 string conversion');
            }
          } catch (base64Error: any) {
            debugMeta.errors.push(`Base64 string parsing error: ${base64Error.message || 'Unknown error'}`);
            console.warn(`⚠️ [${requestId}] Base64 string parsing failed, trying as UTF-8:`, base64Error.message);
            
            // Fall back to treating as a plain text string
            try {
              fileBuffer = Buffer.from(file, 'utf8');
              
              if (fileBuffer.length === 0) {
                debugMeta.errors.push('Buffer from string is empty after UTF-8 conversion');
                throw new Error('Empty buffer after UTF-8 string conversion');
              }
            } catch (stringError: any) {
              debugMeta.errors.push(`UTF-8 string parsing error: ${stringError.message || 'Unknown error'}`);
              throw new Error(`Failed to convert string to buffer: ${stringError.message}`);
            }
          }
        }
      }
      
      // Last resort - try to use toString if available
      if (!fileBuffer && file && typeof (file as any).toString === 'function' && 
         (file as any).toString !== Object.prototype.toString) {
        debugMeta.processingSteps.push('FALLBACK: Converting using toString()');
        
        try {
          const stringValue = (file as any).toString();
          
          if (!stringValue || stringValue.length === 0 || stringValue === '[object Object]') {
            debugMeta.errors.push('toString() produced empty or useless string');
            throw new Error('Empty or useless output from toString()');
          }
          
          fileBuffer = Buffer.from(stringValue, 'utf8');
          
          if (fileBuffer.length === 0) {
            debugMeta.errors.push('Buffer from toString() is empty after conversion');
            throw new Error('Empty buffer after toString() conversion');
          }
        } catch (stringError: any) {
          debugMeta.errors.push(`toString() conversion error: ${stringError.message || 'Unknown error'}`);
          throw new Error(`Failed to convert using toString(): ${stringError.message}`);
        }
      }
      
      // Final validation - If we still don't have a buffer after trying all methods
      if (!fileBuffer) {
        debugMeta.errors.push('All conversion methods failed, no buffer created');
        throw new Error(`Failed to convert file to buffer. Tried ${debugMeta.processingSteps.length} methods.`);
      }
      
      // Size validation
      if (fileBuffer.length === 0) {
        debugMeta.errors.push('Final buffer is empty (zero bytes)');
        throw new Error('Buffer is empty after conversion');
      }
      
      if (fileBuffer.length > 10 * 1024 * 1024) {
        debugMeta.errors.push(`Buffer size too large: ${fileBuffer.length} bytes (>10MB)`);
        throw new Error('Image too large (>10MB)');
      }
      
      // Add buffer info to debug metadata
      debugMeta.finalBufferSize = fileBuffer.length;
      debugMeta.bufferValidation = 'PASS';
      
      console.log(`✅ [${requestId}] Successfully converted image to Buffer (${fileBuffer.length} bytes)`);
      
    } catch (conversionError: any) {
      debugMeta.bufferConversionError = conversionError.message || 'Unknown conversion error';
      debugMeta.conversionErrorStack = conversionError.stack;
      debugMeta.errors.push(`Buffer conversion error: ${conversionError.message || 'Unknown conversion error'}`);
      
      console.error(`❌ [${requestId}] Error converting image to Buffer:`, conversionError);
      console.timeEnd(`⏱️ [${requestId}] uploadImageToFirebase`);
      return null;  // Return null instead of throwing to prevent API errors
    }
    
    // Validation check before upload
    if (!fileBuffer || fileBuffer.length === 0) {
      debugMeta.errors.push('No valid buffer to upload or buffer is empty');
      console.error(`❌ [${requestId}] No valid buffer to upload or buffer is empty`);
      console.timeEnd(`⏱️ [${requestId}] uploadImageToFirebase`);
      return null;
    }
    
    // Create a promise race to handle timeout
    try {
      debugMeta.processingSteps.push('Starting Firebase upload');
      debugMeta.uploadStartTime = Date.now();
      
      const uploadPromise = Promise.race([
        file_ref.save(fileBuffer, {
          metadata: {
            contentType: 'image/jpeg',
            metadata: {
              originalUpload: new Date().toISOString(),
              bufferSize: fileBuffer.length,
              conversionInfo: debugMeta
            }
          }
        }),
        new Promise<never>((_resolve, reject) => 
          setTimeout(() => {
            debugMeta.errors.push(`Upload timed out after ${timeoutMs}ms`);
            reject(new Error(`Admin SDK upload timed out after ${timeoutMs}ms`));
          }, timeoutMs)
        )
      ]);
      
      try {
        await uploadPromise;
        debugMeta.processingSteps.push('Upload completed successfully');
        debugMeta.uploadEndTime = Date.now();
        debugMeta.uploadDuration = debugMeta.uploadEndTime - debugMeta.uploadStartTime;
      } catch (uploadError: any) {
        debugMeta.errors.push(`Upload error: ${uploadError.message || 'Unknown upload error'}`);
        console.error(`❌ [${requestId}] Firebase upload failed:`, uploadError.message);
        console.timeEnd(`⏱️ [${requestId}] uploadImageToFirebase`);
        return null;
      }
      
      // Get download URL from admin SDK with timeout
      try {
        debugMeta.processingSteps.push('Getting signed URL');
        debugMeta.urlStartTime = Date.now();
        
        const urlPromise = Promise.race([
          file_ref.getSignedUrl({
            action: 'read',
            expires: '03-01-2500', // Far future expiration
          }),
          new Promise<never>((_resolve, reject) => 
            setTimeout(() => {
              debugMeta.errors.push(`URL generation timed out after ${timeoutMs}ms`);
              reject(new Error(`Get download URL timed out after ${timeoutMs}ms`));
            }, timeoutMs)
          )
        ]);
        
        const [url] = await urlPromise;
        
        debugMeta.processingSteps.push('URL generation completed successfully');
        debugMeta.urlEndTime = Date.now();
        debugMeta.urlDuration = debugMeta.urlEndTime - debugMeta.urlStartTime;
        debugMeta.totalDuration = Date.now() - debugMeta.startTime;
        
        console.log(`✅ [${requestId}] Image uploaded successfully via Admin SDK`);
        console.log(`🔗 [${requestId}] Download URL generated: ${url.substring(0, 50)}...`);
        console.timeEnd(`⏱️ [${requestId}] uploadImageToFirebase`);
        return url;
      } catch (urlError: any) {
        debugMeta.errors.push(`URL generation error: ${urlError.message || 'Unknown URL error'}`);
        console.error(`❌ [${requestId}] Failed to get download URL:`, urlError.message);
        console.timeEnd(`⏱️ [${requestId}] uploadImageToFirebase`);
        return null;
      }
    } catch (error: any) {
      debugMeta.errors.push(`Unexpected error: ${error.message || 'Unknown error'}`);
      console.error(`❌ [${requestId}] Failed to upload image to Firebase:`, error.message);
      console.timeEnd(`⏱️ [${requestId}] uploadImageToFirebase`);
      return null;
    }
  } catch (outerError: any) {
    // Catch-all for any unexpected errors
    debugMeta.errors.push(`Fatal error: ${outerError.message || 'Unknown fatal error'}`);
    console.error(`❌ [${requestId}] Fatal error in uploadImageToFirebase:`, outerError.message || outerError);
    console.timeEnd(`⏱️ [${requestId}] uploadImageToFirebase`);
    return null;
  }
}

// At the very top of the file, add the placeholder image definition if it doesn't exist
// Placeholder image for development fallback
const PLACEHOLDER_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// Default health goals for when none are provided
const DEFAULT_HEALTH_GOALS = ['Improve Sleep', 'Weight Management', 'Build Muscle', 'Boost Energy'];

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
      errorDetails: []
    },
    _meta: {
      imageError: null  // Add this to track image-related errors
    }
  };
  
  // Track detailed performance metrics
  const perfMetrics: Record<string, number> = {
    totalTime: 0,
    imageProcessingTime: 0,
    analysisTime: 0,
    enrichmentTime: 0
  };
  
  try {
    // First, validate request content type
    responseData.debug.processingSteps.push('Validating request');
    
    const contentType = request.headers.get('content-type');
    if (!contentType) {
      const error = 'Missing Content-Type header';
      responseData.errors.push(error);
      responseData.debug.errorDetails.push({ step: 'request_validation', error });
      responseData.message = 'Missing Content-Type header';
      responseData._meta.imageError = error;
      
      console.error(`❌ [${requestId}] ${error}`);
      return createAnalysisResponse(responseData);
    }
    
    // Parse request data based on content type
    let requestData: FormData | null = null;
    let jsonData: any = null;
    let rawFile: any = null;
    let userId: string = '';
    let healthGoals: string[] = [];
    let dietaryPreferences: string[] = [];
    
    try {
      if (contentType.includes('multipart/form-data')) {
        responseData.debug.processingSteps.push('Parsing multipart form data');
        
        try {
          requestData = await request.formData();
          responseData.debug.dataFormat = 'multipart/form-data';
        } catch (formError: any) {
          const error = `Failed to parse form data: ${formError?.message || 'Unknown form parsing error'}`;
          responseData.errors.push(error);
          responseData.debug.errorDetails.push({ step: 'form_parsing', error, details: formError });
          responseData.message = 'Failed to parse form data';
          responseData._meta.imageError = error;
          
          console.error(`❌ [${requestId}] ${error}`);
          return createAnalysisResponse(responseData);
        }
        
        // Get file from form data
        rawFile = requestData?.get('file') || null;
        userId = (requestData?.get('userId') || '').toString();
        
        // Parse health goals array if provided
        try {
          const goalsParam = requestData?.get('healthGoals');
          if (goalsParam) {
            if (typeof goalsParam === 'string') {
              try {
                healthGoals = JSON.parse(goalsParam);
              } catch (e) {
                // If can't parse as JSON, treat as comma-separated string
                healthGoals = goalsParam.split(',').map(g => g.trim()).filter(Boolean);
              }
            }
          }
        } catch (goalsError: any) {
          console.warn(`⚠️ [${requestId}] Failed to parse health goals: ${goalsError?.message}`);
          responseData.debug.errorDetails.push({ 
            step: 'goals_parsing', 
            warning: 'Failed to parse health goals', 
            details: goalsError?.message 
          });
        }
        
        // Parse dietary preferences array if provided
        try {
          const dietParam = requestData?.get('dietaryPreferences');
          if (dietParam) {
            if (typeof dietParam === 'string') {
              try {
                dietaryPreferences = JSON.parse(dietParam);
              } catch (e) {
                // If can't parse as JSON, treat as comma-separated string
                dietaryPreferences = dietParam.split(',').map(d => d.trim()).filter(Boolean);
              }
            }
          }
        } catch (dietError: any) {
          console.warn(`⚠️ [${requestId}] Failed to parse dietary preferences: ${dietError?.message}`);
          responseData.debug.errorDetails.push({ 
            step: 'diet_parsing', 
            warning: 'Failed to parse dietary preferences', 
            details: dietError?.message 
          });
        }
        
      } else if (contentType.includes('application/json')) {
        responseData.debug.processingSteps.push('Parsing JSON data');
        
        try {
          jsonData = await request.json();
          responseData.debug.dataFormat = 'application/json';
          
          // Extract fields from JSON
          if (jsonData && typeof jsonData === 'object') {
            rawFile = jsonData.file || jsonData.image || jsonData.base64Image || null;
            userId = jsonData.userId || '';
            healthGoals = Array.isArray(jsonData.healthGoals) ? jsonData.healthGoals : [];
            dietaryPreferences = Array.isArray(jsonData.dietaryPreferences) ? jsonData.dietaryPreferences : [];
          } else {
            const error = 'Invalid JSON structure';
            responseData.errors.push(error);
            responseData.debug.errorDetails.push({ step: 'json_validation', error });
            responseData.message = 'Invalid JSON data format';
            responseData._meta.imageError = error;
            
            console.error(`❌ [${requestId}] ${error}`);
            return createAnalysisResponse(responseData);
          }
        } catch (jsonError: any) {
          const error = `Failed to parse JSON: ${jsonError?.message || 'Unknown JSON parsing error'}`;
          responseData.errors.push(error);
          responseData.debug.errorDetails.push({ step: 'json_parsing', error, details: jsonError });
          responseData.message = 'Failed to parse JSON data';
          responseData._meta.imageError = error;
          
          console.error(`❌ [${requestId}] ${error}`);
          return createAnalysisResponse(responseData);
        }
      } else {
        const error = `Unsupported content type: ${contentType}`;
        responseData.errors.push(error);
        responseData.debug.errorDetails.push({ step: 'content_type_validation', error });
        responseData.message = 'Unsupported content type';
        responseData._meta.imageError = error;
        
        console.error(`❌ [${requestId}] ${error}`);
        return createAnalysisResponse(responseData);
      }
    } catch (requestParsingError: any) {
      const error = `Failed to parse request: ${requestParsingError?.message || 'Unknown request parsing error'}`;
      responseData.errors.push(error);
      responseData.debug.errorDetails.push({ step: 'request_parsing', error, details: requestParsingError });
      responseData.message = 'Failed to parse request data';
      responseData._meta.imageError = error;
      
      console.error(`❌ [${requestId}] ${error}`);
      return createAnalysisResponse(responseData);
    }
    
    // Validate required parameters
    if (!rawFile) {
      const error = 'No image file provided';
      responseData.errors.push(error);
      responseData.debug.errorDetails.push({ step: 'file_validation', error });
      responseData.message = 'No image file provided';
      responseData._meta.imageError = error;
      
      console.error(`❌ [${requestId}] ${error}`);
      // Create empty fallback response with error metadata
      return createAnalysisResponse({
        ...responseData,
        success: false,
        fallback: true,
        analysis: createEmptyFallbackAnalysis(),
        _meta: {
          imageError: error
        }
      });
    }
    
    responseData.debug.processingSteps.push('File provided, starting extraction');
    responseData.debug.rawFileType = typeof rawFile;
    responseData.debug.rawFileInfo = {
      constructor: rawFile?.constructor?.name || 'unknown',
      isNull: rawFile === null,
      isUndefined: rawFile === undefined,
      isString: typeof rawFile === 'string',
      isObject: typeof rawFile === 'object' && rawFile !== null,
      hasSize: rawFile && typeof rawFile === 'object' && 'size' in rawFile,
      size: rawFile && typeof rawFile === 'object' && 'size' in rawFile ? rawFile.size : null,
      isFormData: rawFile && typeof rawFile === 'object' && 'name' in rawFile,
      name: rawFile && typeof rawFile === 'object' && 'name' in rawFile ? rawFile.name : null,
    };
    
    // Extract image base64 data
    console.time(`⏱️ [${requestId}] Image extraction`);
    let base64Image: string | null = null;
    
    try {
      // Safely extract the base64 image data
      try {
        base64Image = await extractBase64Image(rawFile, requestId);
      } catch (conversionError: any) {
        const error = `Unable to convert image: ${conversionError.message || 'Unknown conversion error'}`;
        console.error(`❌ [${requestId}] ${error}`);
        throw new Error(error);
      }
      
      if (!base64Image) {
        const error = 'Failed to extract valid image data';
        responseData.errors.push(error);
        responseData.debug.errorDetails.push({ step: 'image_extraction', error });
        responseData.message = 'Failed to extract valid image data';
        responseData._meta.imageError = error;
        
        console.error(`❌ [${requestId}] ${error}`);
        return createAnalysisResponse({
          ...responseData,
          success: false,
          fallback: true,
          analysis: createEmptyFallbackAnalysis(),
          _meta: {
            imageError: error
          }
        });
      }
      
      // Check if base64Image has a reasonable size
      if (base64Image.length < 100) { // Arbitrary minimum size - any valid image would be larger
        const error = `Base64 image data too small (${base64Image.length} chars)`;
        responseData.errors.push(error);
        responseData.debug.errorDetails.push({ step: 'image_validation', error });
        responseData.message = 'Invalid image data (too small)';
        responseData._meta.imageError = error;
        
        console.error(`❌ [${requestId}] ${error}`);
        return createAnalysisResponse({
          ...responseData,
          success: false,
          fallback: true,
          analysis: createEmptyFallbackAnalysis(),
          _meta: {
            imageError: error
          }
        });
      }
      
      console.timeEnd(`⏱️ [${requestId}] Image extraction`);
      responseData.debug.timestamps.imageProcessed = new Date().toISOString();
      responseData.debug.processingSteps.push('Image data extracted successfully');
      
      console.log(`✅ [${requestId}] Successfully extracted base64 image (${base64Image.length} chars)`);
    } catch (extractionError: any) {
      console.timeEnd(`⏱️ [${requestId}] Image extraction`);
      
      const error = `Image extraction failed: ${extractionError?.message || 'Unknown extraction error'}`;
      responseData.errors.push(error);
      responseData.debug.errorDetails.push({ 
        step: 'image_extraction', 
        error,
        details: extractionError?.stack || extractionError
      });
      responseData.message = 'Failed to process image';
      responseData._meta.imageError = error;
      
      console.error(`❌ [${requestId}] ${error}`);
      
      // Fall back to placeholder for development and testing purposes
      if (process.env.NODE_ENV === 'development' && process.env.ALLOW_PLACEHOLDER === 'true') {
        console.log(`♻️ [${requestId}] Falling back to placeholder image for development`);
        base64Image = PLACEHOLDER_IMAGE;
        responseData.debug.processingSteps.push('Using placeholder image for development');
        responseData.debug.usedPlaceholder = true;
        
        // Clear errors since we're proceeding with the placeholder
        responseData.errors = [];
        responseData.debug.errorDetails = responseData.debug.errorDetails.map(item => {
          if (item.step === 'image_extraction') {
            return { ...item, resolved: 'Used placeholder image instead' };
          }
          return item;
        });
      } else {
        // Return a properly structured error response
        return createAnalysisResponse({
          ...responseData,
          success: false,
          fallback: true,
          analysis: createEmptyFallbackAnalysis(),
          _meta: {
            imageError: error
          }
        });
      }
    }
    
    // Upload image to Firebase if we have a user ID
    let imageUrl: string | null = null;
    
    if (userId && base64Image) {
      try {
        console.log(`🔄 [${requestId}] Attempting to upload image to Firebase for user: ${userId}`);
        
        responseData.debug.processingSteps.push('Uploading image to Firebase');
        imageUrl = await uploadImageToFirebase(base64Image, userId, requestId);
        
        if (imageUrl) {
          console.log(`✅ [${requestId}] Image uploaded successfully: ${imageUrl.substring(0, 50)}...`);
          responseData.debug.processingSteps.push('Image uploaded successfully');
          responseData.debug.imageUploaded = true;
        } else {
          console.warn(`⚠️ [${requestId}] Image upload failed, continuing with analysis only`);
          responseData.debug.processingSteps.push('Image upload failed, continuing with analysis only');
          responseData.debug.imageUploaded = false;
          responseData.debug.errorDetails.push({ 
            step: 'image_upload', 
            warning: 'Image upload failed, continuing with analysis only'
          });
        }
      } catch (uploadError: any) {
        console.error(`❌ [${requestId}] Firebase upload error: ${uploadError?.message}`);
        responseData.debug.errorDetails.push({ 
          step: 'image_upload', 
          warning: `Image upload failed: ${uploadError?.message || 'Unknown upload error'}`,
          details: uploadError?.stack
        });
        
        // We don't fail the entire request if upload fails
        responseData.debug.imageUploaded = false;
        responseData.debug.processingSteps.push('Image upload failed, continuing with analysis only');
      }
    } else {
      if (!userId) {
        console.log(`ℹ️ [${requestId}] No userId provided, skipping image upload`);
        responseData.debug.processingSteps.push('No userId provided, skipping image upload');
      } else {
        console.log(`ℹ️ [${requestId}] No valid image data for upload`);
        responseData.debug.processingSteps.push('No valid image data for upload');
      }
    }
    
    // Analyze the image with GPT-4V
    console.time(`⏱️ [${requestId}] GPT analysis`);
    
    try {
      responseData.debug.processingSteps.push('Starting GPT-4V analysis');
      
      // Set up health goals for analysis
      const effectiveHealthGoals = healthGoals && healthGoals.length > 0 
        ? healthGoals 
        : DEFAULT_HEALTH_GOALS;
        
      const effectiveDietaryPreferences = dietaryPreferences && dietaryPreferences.length > 0
        ? dietaryPreferences
        : [];
      
      responseData.debug.analysisParams = {
        healthGoals: effectiveHealthGoals,
        dietaryPreferences: effectiveDietaryPreferences
      };
      
      // Perform the analysis
      const analysisResult = await analyzeImageWithGPT4V(
        base64Image, 
        effectiveHealthGoals,
        effectiveDietaryPreferences,
        requestId
      );
      
      console.timeEnd(`⏱️ [${requestId}] GPT analysis`);
      responseData.debug.timestamps.analysisCompleted = new Date().toISOString();
      responseData.debug.processingSteps.push('GPT-4V analysis completed');
      
      // Check if analysis was successful
      if (!analysisResult || !analysisResult.result) {
        const error = 'GPT-4V analysis failed to return results';
        responseData.errors.push(error);
        responseData.debug.errorDetails.push({ step: 'gpt_analysis', error });
        responseData.message = 'Analysis failed';
        
        console.error(`❌ [${requestId}] ${error}`);
        return createAnalysisResponse(responseData);
      }
      
      // Check for low confidence results that need enrichment
      const needsEnrichment = needsConfidenceEnrichment(analysisResult.result);
      
      // If we need to enrich, perform a second pass
      if (needsEnrichment) {
        console.log(`🔄 [${requestId}] Low confidence detected, performing enrichment pass`);
        responseData.debug.processingSteps.push('Low confidence detected, performing enrichment');
        responseData.debug.originalConfidence = analysisResult.result?.confidence || 'unknown';
        
        console.time(`⏱️ [${requestId}] GPT enrichment`);
        
        try {
          const enrichedResult = await enrichAnalysisResult(
            analysisResult.result,
            effectiveHealthGoals,
            effectiveDietaryPreferences,
            requestId
          );
          
          if (enrichedResult) {
            // Combine the enriched analysis with the original
            analysisResult.result = enrichedResult;
            responseData.debug.processingSteps.push('Enrichment completed successfully');
            responseData.debug.wasEnriched = true;
          } else {
            console.warn(`⚠️ [${requestId}] Enrichment failed, using original analysis`);
            responseData.debug.processingSteps.push('Enrichment failed, using original analysis');
            responseData.debug.enrichmentFailed = true;
          }
        } catch (enrichmentError: any) {
          console.error(`❌ [${requestId}] Enrichment error: ${enrichmentError?.message}`);
          responseData.debug.errorDetails.push({ 
            step: 'enrichment', 
            warning: `Enrichment failed: ${enrichmentError?.message || 'Unknown enrichment error'}`,
            details: enrichmentError?.stack
          });
          responseData.debug.enrichmentFailed = true;
        }
        
        console.timeEnd(`⏱️ [${requestId}] GPT enrichment`);
        responseData.debug.timestamps.enrichmentCompleted = new Date().toISOString();
      }
      
      // Validate the analysis result
      try {
        const validationResult = validateGptAnalysisResult(analysisResult.result);
        
        if (!validationResult.valid) {
          console.warn(`⚠️ [${requestId}] Analysis validation failed: ${validationResult.reason}`);
          responseData.debug.processingSteps.push('Analysis validation failed');
          responseData.debug.validationFailed = true;
          responseData.debug.validationReason = validationResult.reason;
          
          // Create fallback for invalid results
          const fallbackResponse = createFallbackResponse(validationResult.reason, analysisResult.result);
          analysisResult.result = fallbackResponse;
          
          console.log(`♻️ [${requestId}] Using fallback analysis response`);
          responseData.debug.processingSteps.push('Using fallback analysis response');
          responseData.debug.usedFallback = true;
        } else {
          responseData.debug.processingSteps.push('Analysis validation passed');
          responseData.debug.validationPassed = true;
        }
      } catch (validationError: any) {
        console.error(`❌ [${requestId}] Validation error: ${validationError?.message}`);
        responseData.debug.errorDetails.push({
          step: 'validation',
          warning: `Validation error: ${validationError?.message || 'Unknown validation error'}`,
          details: validationError?.stack
        });
      }
      
      // Prepare final response
      responseData.success = true;
      responseData.message = 'Analysis completed successfully';
      responseData.analysis = analysisResult.result;
      responseData.imageUrl = imageUrl;
      responseData.requestId = requestId;
      
      if (analysisResult.reasoning) {
        responseData.debug.reasoning = analysisResult.reasoning;
      }
      
      console.log(`✅ [${requestId}] Analysis completed successfully`);
    } catch (analysisError: any) {
      console.timeEnd(`⏱️ [${requestId}] GPT analysis`);
      
      const error = `GPT-4V analysis failed: ${analysisError?.message || 'Unknown analysis error'}`;
      responseData.errors.push(error);
      responseData.debug.errorDetails.push({ 
        step: 'gpt_analysis', 
        error, 
        details: analysisError?.stack || analysisError 
      });
      responseData.message = 'Analysis failed';
      
      console.error(`❌ [${requestId}] ${error}`);
      
      // Create an empty fallback response for API consumers in case of error
      if (process.env.NODE_ENV === 'development' && process.env.ALLOW_FALLBACK === 'true') {
        try {
          console.log(`♻️ [${requestId}] Creating emergency fallback response for development`);
          
          const fallbackResponse = createEmergencyFallbackResponse();
          responseData.analysis = fallbackResponse;
          responseData.debug.processingSteps.push('Using emergency fallback response');
          responseData.debug.usedEmergencyFallback = true;
          responseData.success = true; // Mark as successful so clients can at least get something
          responseData.message = 'Analysis completed with emergency fallback';
          
          // Clear error since we're using a fallback
          responseData.errors = responseData.errors.map(err => 
            err.includes('GPT-4V analysis failed') ? 'Used emergency fallback due to analysis error' : err
          );
        } catch (fallbackError: any) {
          console.error(`❌ [${requestId}] Failed to create fallback response:`, fallbackError);
        }
      }
    }
  } catch (error: any) {
    // Catch-all for any unexpected errors during processing
    const fatalError = `Fatal error in analysis API: ${error?.message || 'Unknown error'}`;
    responseData.errors.push(fatalError);
    responseData.debug.errorDetails.push({ 
      step: 'fatal_error', 
      error: fatalError, 
      details: error?.stack || error 
    });
    responseData.message = 'An unexpected error occurred';
    responseData._meta.imageError = fatalError;
    
    console.error(`⛔ [${requestId}] FATAL ERROR:`, error);
    
    // Always return a structured response, even for fatal errors
    return createAnalysisResponse({
      ...responseData,
      success: false,
      fallback: true,
      analysis: createEmptyFallbackAnalysis(),
      _meta: {
        imageError: fatalError
      }
    });
  } finally {
    // Complete timing and add final timestamp
    console.timeEnd(`⏱️ [${requestId}] Total API execution time`);
    responseData.debug.timestamps.end = new Date().toISOString();
    
    // Calculate total duration
    const startTime = new Date(responseData.debug.timestamps.start).getTime();
    const endTime = new Date(responseData.debug.timestamps.end).getTime();
    responseData.debug.totalDurationMs = endTime - startTime;
  }

  // Continue with usual processing flow
  return createAnalysisResponse(responseData);
} catch (error: any) {
  // Catch-all for any unexpected errors during processing
  const fatalError = `Fatal error in analysis API: ${error?.message || 'Unknown error'}`;
  responseData.errors.push(fatalError);
  responseData.debug.errorDetails.push({ 
    step: 'fatal_error', 
    error: fatalError, 
    details: error?.stack || error 
  });
  responseData.message = 'An unexpected error occurred';
  responseData._meta.imageError = fatalError;
  
  console.error(`⛔ [${requestId}] FATAL ERROR:`, error);
  
  // Always return a structured response, even for fatal errors
  return createAnalysisResponse({
    ...responseData,
    success: false,
    fallback: true,
    analysis: createEmptyFallbackAnalysis(),
    _meta: {
      imageError: fatalError
    }
  });
}

/**
 * Helper function to create a standardized NextResponse
 */
function createAnalysisResponse(data: any): NextResponse {
  // Always return 200 status, put actual status in the response body
  return NextResponse.json(data, { status: 200 });
}

/**
 * Creates an empty fallback analysis result for when image processing fails
 */
function createEmptyFallbackAnalysis() {
  return {
    fallback: true,
    success: false,
    description: "Unable to analyze the image",
    ingredientList: [],
    detailedIngredients: [],
    confidence: 0,
    basicNutrition: {
      calories: "Unknown",
      protein: "Unknown",
      carbs: "Unknown",
      fat: "Unknown"
    },
    goalImpactScore: 0,
    goalName: "Unknown",
    scoreExplanation: "We couldn't analyze this image properly. Please try again with a clearer photo.",
    feedback: [
      "We couldn't process this image. This could be due to the image being invalid, corrupted, or not containing food.",
      "Try uploading a clearer photo with good lighting.",
      "Make sure your image shows the food items clearly."
    ],
    suggestions: [
      "Take photos in good lighting",
      "Ensure your food is clearly visible in the frame",
      "Use a higher quality image if possible"
    ],
    imageChallenges: ["Unable to process image"]
  };
}