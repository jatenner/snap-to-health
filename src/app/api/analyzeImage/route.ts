import { NextRequest, NextResponse } from 'next/server';
import NodeCache from 'node-cache'
import { OpenAI } from 'openai'
import crypto from 'crypto';
import { adminStorage } from '@/lib/firebaseAdmin';
import { trySaveMealServer } from '@/lib/serverMealUtils';
import { uploadImageToFirebase } from '@/lib/firebaseStorage';
import { extractBase64Image } from '@/lib/imageProcessing';
import { API_CONFIG } from '@/lib/constants';
import { GPT_MODEL } from '@/lib/constants';
import { saveMealToFirestore } from '@/lib/mealUtils';
import { isValidAnalysis, normalizeAnalysisResult } from '@/lib/utils/analysisValidator';
import { analyzeWithGPT4Vision } from '@/lib/gptVision';

// Use Node.js runtime since we depend on Node.js specific modules
export const runtime = 'nodejs';

const cache = new NodeCache({ stdTTL: 60 * 60 })  // 1 hour
const oai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

/**
 * Creates a guaranteed valid error fallback result with all required fields
 * to prevent frontend from crashing when no data is available
 */
function createUniversalErrorFallback(reason: string = "unknown"): AnalysisResult {
  console.log(`Creating universal error fallback for reason: ${reason}`);
  
  return {
    description: "We couldn't analyze this image properly. Please try again with a clearer photo.",
    nutrients: [
      { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
      { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
      { name: 'Carbohydrates', value: 0, unit: 'g', isHighlight: true },
      { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
    ],
    feedback: ["Image analysis failed. Please upload a clearer image."],
    suggestions: ["Try uploading a clearer, well-lit photo of your food"],
    detailedIngredients: [],
    goalScore: { overall: 0, specific: {} },
    modelInfo: {
      model: "error_fallback",
      usedFallback: true,
      ocrExtracted: false
    },
    source: "error_fallback",
    _meta: {
      debugTrace: `Error fallback created due to: ${reason}`
    }
  };
}

/**
 * Creates a universal fallback result structure that guarantees a complete API response
 * This function ensures that all required fields exist to prevent frontend crashes
 * @param reason Reason for the fallback (for debugging purposes)
 * @param partial Optional partial data to incorporate
 * @returns Complete and valid AnalysisResult structure
 */
function createUniversalFallbackResult(reason: string = "unknown", partial: Partial<AnalysisResult> = {}): AnalysisResult {
  // Base fallback that MUST have ALL required fields for frontend
  const fallback: AnalysisResult = {
    description: "Could not analyze meal completely.",
    nutrients: [
      { name: "Calories", value: 0, unit: "kcal", isHighlight: true },
      { name: "Protein", value: 0, unit: "g", isHighlight: true },
      { name: "Carbs", value: 0, unit: "g", isHighlight: true },
      { name: "Fat", value: 0, unit: "g", isHighlight: true }
    ],
    feedback: ["No nutritional data was found for this meal."],
    suggestions: ["Try a clearer image with more visible food."],
    detailedIngredients: [],
    goalScore: {
      overall: 0,
      specific: {}
    },
    fallback: true,
    lowConfidence: true,
    source: `universal_fallback:${reason}`,
    modelInfo: {
      model: `fallback:${reason}`,
      usedFallback: true,
      ocrExtracted: false
    },
    _meta: {
      debugTrace: `Universal fallback created due to: ${reason}`
    }
  };

  // Track which fields are present in the partial data for better debugging
  const presentFields: Record<string, boolean> = {
    description: false,
    nutrients: false,
    feedback: false,
    suggestions: false
  };

  // Selectively merge partial data if it exists and is valid
  if (partial && typeof partial === 'object') {
    // Accept any partial data - we'll normalize/validate properties individually
    
    // Only use partial description if it's a non-empty string
    if (typeof partial.description === 'string' && partial.description.trim()) {
      fallback.description = partial.description;
      presentFields.description = true;
    }

    // Accept partial nutrients if it's a valid array
    if (Array.isArray(partial.nutrients)) {
      // Even if the array is empty, keep the partial data structure as is
      // We'll validate and provide defaults in normalization if needed
      fallback.nutrients = partial.nutrients;
      
      // Only mark as present if the array has elements
      presentFields.nutrients = partial.nutrients.length > 0;
      
      // If we have an empty array, log a warning
      if (partial.nutrients.length === 0) {
        console.warn(`[Universal Fallback] Nutrients array is empty, will be populated with defaults in normalization`);
      }
    }

    // Accept feedback if it's a valid array or convert to array if string
    if (Array.isArray(partial.feedback)) {
      fallback.feedback = partial.feedback;
      presentFields.feedback = partial.feedback.length > 0;
    } else if (typeof partial.feedback === 'string') {
      // Handle case where feedback might be a string instead of array
      fallback.feedback = [partial.feedback as string];
      presentFields.feedback = true;
    }

    // Accept suggestions if it's a valid array or convert to array if string
    if (Array.isArray(partial.suggestions)) {
      fallback.suggestions = partial.suggestions;
      presentFields.suggestions = partial.suggestions.length > 0;
    } else if (typeof partial.suggestions === 'string') {
      // Handle case where suggestions might be a string instead of array
      fallback.suggestions = [partial.suggestions as string];
      presentFields.suggestions = true;
    }

    // Accept detailedIngredients if it's a valid array
    if (Array.isArray(partial.detailedIngredients)) {
      fallback.detailedIngredients = partial.detailedIngredients;
    }

    // Accept goalScore if it's valid
    if (partial.goalScore && typeof partial.goalScore === 'object') {
      fallback.goalScore = partial.goalScore;
    } else if (typeof partial.goalScore === 'number') {
      fallback.goalScore = {
        overall: partial.goalScore,
        specific: {}
      };
    }

    // Accept source if provided
    if (typeof partial.source === 'string' && partial.source.trim()) {
      fallback.source = partial.source;
    }
    
    // Accept modelInfo if provided
    if (partial.modelInfo && typeof partial.modelInfo === 'object') {
      // Preserve the model info but flag that we used fallback
      fallback.modelInfo = {
        ...partial.modelInfo,
        usedFallback: true
      };
    }
    
    // Accept _meta if provided
    if (partial._meta && typeof partial._meta === 'object') {
      fallback._meta = {
        ...fallback._meta,
        ...partial._meta
      };
    }
  }

  // Enhanced logging for debugging
  const presentFieldsCount = Object.values(presentFields).filter(Boolean).length;
  console.log(`[Universal Fallback] Created for reason: ${reason}`, {
    fieldsPresent: presentFields,
    presentFieldsCount: presentFieldsCount,
    totalFieldsNeeded: Object.keys(presentFields).length,
    description: presentFields.description ? fallback.description.substring(0, 30) + '...' : 'using default',
    nutrientsCount: fallback.nutrients?.length || 0,
    feedbackCount: fallback.feedback?.length || 0,
    suggestionsCount: fallback.suggestions?.length || 0,
    source: fallback.source
  });

  return fallback;
}

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
  
  return false;
}

// Define the AnalysisResponse interface
interface AnalysisResponse {
  success: boolean;
  fallback: boolean;
  requestId: string;
  message: string;
  imageUrl: string | null;
  result: AnalysisResult | null;
  error: string | null;
  elapsedTime: number;
  diagnostics: any | null;
  timing?: {
    total: number;
    components: Record<string, number>;
  };
}

interface AnalysisResult {
  description: string;
  nutrients: Array<{
    name: string;
    value: string | number;
    unit: string;
    isHighlight: boolean;
    percentOfDailyValue?: number;
    amount?: number;
  }>;
  feedback: string[];
  suggestions: string[];
  detailedIngredients: Array<{
    name: string;
    category: string;
    confidence: number;
    confidenceEmoji?: string;
  }>;
  goalScore: {
    overall: number;
    specific: Record<string, number>;
  };
  goalName?: string;
  modelInfo?: {
    model: string;
    usedFallback: boolean;
    ocrExtracted: boolean;
    usedLabelDetection?: boolean;
    detectedLabel?: string | null;
    labelConfidence?: number;
  };
  lowConfidence?: boolean;
  fallback?: boolean;
  source?: string;
  saved?: boolean;
  savedMealId?: string;
  saveError?: string;
  rawTextResponse?: string;
  _meta?: {
    ocrText?: string;
    foodTerms?: string[];
    isNutritionLabel?: boolean;
    foodConfidence?: number;
    debugTrace?: string;
    ocrConfidence?: number;
    usedLabelDetection?: boolean;
    detectedLabel?: string | null;
    labelConfidence?: number;
  };
  no_result?: boolean;
}

interface NutrientAnalysisResult {
  success: boolean;
  feedback: string[];
  suggestions: string[];
  goalScore: {
    overall: number;
    specific: Record<string, number>;
  };
}

/**
 * Creates a fallback response when meal analysis fails
 * @param message Error message
 * @param error Error object or string
 * @param requestId Request identifier for tracking
 * @returns Structured fallback response
 */
function createFallbackResponse(
  message: string,
  error: Error | string | null,
  requestId: string
): AnalysisResult {
  console.log(`[${requestId}] createFallbackResponse: ${message}, Error: ${error || 'none'}`);
  
  // Use the universal fallback with more details for reliability
  return createUniversalFallbackResult(`error_response:${message}`, {
    description: "Could not analyze meal.",
    feedback: ["No nutritional data was found."],
    suggestions: ["Try a clearer image with more visible food."],
    source: "error_fallback"
  });
}

// Function to create an MD5 hash
function createMD5Hash(data: string): string {
  return crypto.createHash('md5').update(data).digest('hex');
}

/**
 * Helper function to determine if an analysis result should be enriched with additional passes
 */
function shouldEnrichAnalysis(analysisJson: any): string | null {
  // Check for low confidence indicators
  if (!analysisJson) return "null_result";
  
  // Check confidence score
  const confidence = analysisJson.confidence || 0;
  if (confidence < 5) return "low_confidence_score";
  
  // Check for empty or minimal ingredient list
  if (!analysisJson.detailedIngredients || analysisJson.detailedIngredients.length < 2) {
    return "insufficient_ingredients";
  }
  
  // Check for image challenges
  if (analysisJson.imageChallenges && analysisJson.imageChallenges.length > 0) {
    // If the image has multiple severe challenges, it might need enrichment
    if (analysisJson.imageChallenges.length >= 2) {
      return "multiple_image_challenges";
    }
  }
  
  return null; // No enrichment needed
}

/**
 * Function to refine low confidence analysis with a second, more focused pass
 */
async function refineLowConfidenceAnalysis(
  base64Image: string,
  initialAnalysis: any,
  healthGoal: string,
  requestId: string
): Promise<any> {
  console.log(`[${requestId}] Running refinement pass for low confidence analysis`);
  
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  
  // Extract the ingredients we already detected to help with the refined analysis
  const detectedIngredients = initialAnalysis.detailedIngredients || [];
  const ingredientNames = detectedIngredients.map((i: any) => i.name).join(", ");
  
  // Prepare a focused prompt that builds on what we already detected
  const refinementSystemPrompt = `You are analyzing a food image that was initially difficult to process.
Initial analysis detected these possible ingredients with low confidence: ${ingredientNames}

The user's health goal is: "${healthGoal}"

Your task is to:
1. Look carefully at the image and confirm or correct the initially detected ingredients
2. Add any ingredients that were missed in the first pass
3. Assign appropriate confidence scores 
4. Focus on nutritional aspects relevant to the user's health goal
5. Provide detailed insights about how this meal relates to their specific health goal

Even if the image is unclear or partial, provide your best analysis of the visible food items.`;
  
  // Configure request
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
    'OpenAI-Beta': 'assistants=v1'
  };
  
  const requestPayload = {
    model: "gpt-4o", 
    messages: [
      {
        role: "user",
        content: [
          { 
            type: "text", 
            text: `${refinementSystemPrompt}
            
Return ONLY valid JSON with the same structure as before. Focus on improving these fields:
- detailedIngredients (with accurate confidence scores)
- basicNutrition (more accurate estimates)
- goalImpactScore (better aligned with health goal)
- feedback & suggestions (more specific to detected ingredients)

Do not return any explanation or text outside the JSON block.`
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`,
              detail: "high" // Use high detail for refinement
            }
          }
        ]
      }
    ],
    max_tokens: 1000,
    temperature: 0.3,  // Lower temperature for more focused analysis
    response_format: { type: "json_object" }
  };
  
  try {
    // Create an AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      console.error(`[${requestId}] Refinement request aborted due to timeout (25s)`);
    }, 25000);
    
    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify(requestPayload),
      signal: controller.signal
    });
    
    // Clear timeout
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${requestId}] Refinement API Error:`, response.status, errorText);
      return initialAnalysis; // Return original analysis if refinement fails
    }
    
    const responseData = await response.json();
    
    if (
      !responseData.choices || 
      !responseData.choices[0] || 
      !responseData.choices[0].message || 
      !responseData.choices[0].message.content
    ) {
      console.error(`[${requestId}] Invalid refinement response structure`);
      return initialAnalysis;
    }
    
    const refinedText = responseData.choices[0].message.content;
    
    try {
      // Parse the JSON response
      const refinedJson = JSON.parse(refinedText.trim());
      console.log(`[${requestId}] Refinement JSON parsed successfully`);
      
      // Create a merged result that takes the best of both analyses
      return {
        ...initialAnalysis,
        ...refinedJson,
        confidence: Math.max(initialAnalysis.confidence || 0, refinedJson.confidence || 0),
        // Keep track of the refinement in the analysis
        _meta: {
          ...(initialAnalysis._meta || {}),
          refinementApplied: true,
          originalConfidence: initialAnalysis.confidence
        }
      };
    } catch (error) {
      console.error(`[${requestId}] Failed to parse refinement JSON:`, error);
      return initialAnalysis;
    }
  } catch (error) {
    console.error(`[${requestId}] Refinement request error:`, error);
    return initialAnalysis;
  }
}

/**
 * Function to convert GPT-4 Vision result to the standard AnalysisResult format
 */
function convertVisionResultToAnalysisResult(
  visionResult: any, 
  requestId: string, 
  healthGoal: string
): AnalysisResult {
  console.log(`[${requestId}] Converting GPT-4 Vision result to AnalysisResult format`);
  
  // Extract basic nutrition values from the Vision API response
  const basicNutrition = visionResult.basicNutrition || {};
  
  // Helper function to parse a nutrition value that might be a string with units
  const parseNutritionValue = (value: string | number): number => {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return 0;
    
    // Extract the numeric portion from strings like "500 kcal" or "25g"
    const match = value.match(/(\d+(\.\d+)?)/);
    return match ? parseFloat(match[1]) : 0;
  };
  
  // Convert nutrient values
  const nutrients = [
    { 
      name: 'Calories', 
      value: parseNutritionValue(basicNutrition.calories || '0'), 
      unit: 'kcal', 
      isHighlight: true 
    },
    { 
      name: 'Protein', 
      value: parseNutritionValue(basicNutrition.protein || '0'), 
      unit: 'g', 
      isHighlight: true 
    },
    { 
      name: 'Carbohydrates', 
      value: parseNutritionValue(basicNutrition.carbs || '0'), 
      unit: 'g', 
      isHighlight: true 
    },
    { 
      name: 'Fat', 
      value: parseNutritionValue(basicNutrition.fat || '0'), 
      unit: 'g', 
      isHighlight: true 
    }
  ];
  
  // Convert detailed ingredients adding confidence emojis
  const detailedIngredients = (visionResult.detailedIngredients || []).map((ingredient: any) => {
    // Calculate emoji based on confidence level
    let confidenceEmoji = '❓'; // Default/unknown
    const confidence = ingredient.confidence || 0;
    
    if (confidence >= 8) confidenceEmoji = '✅'; // High confidence
    else if (confidence >= 5) confidenceEmoji = '🟡'; // Medium confidence
    else confidenceEmoji = '❓'; // Low confidence
    
    return {
      name: ingredient.name,
      category: ingredient.category || 'food',
      confidence: confidence,
      confidenceEmoji
    };
  });
  
  // Combine feedback from multiple sources if available
  const combinedFeedback = [
    ...(visionResult.feedback || []),
    ...(visionResult.positiveFoodFactors || []).map((item: string) => `✅ ${item}`),
    ...(visionResult.negativeFoodFactors || []).map((item: string) => `⚠️ ${item}`)
  ];
  
  // Create the standardized analysis result
  const result: AnalysisResult = {
    description: visionResult.description || `Analysis of meal for ${formatGoalName(healthGoal)}`,
    nutrients,
    feedback: combinedFeedback,
    suggestions: visionResult.suggestions || [],
    detailedIngredients,
    goalScore: {
      overall: visionResult.goalImpactScore || 5,
      specific: {}
    },
    goalName: formatGoalName(healthGoal),
    modelInfo: {
      model: "gpt-4o",
      usedFallback: false,
      ocrExtracted: false
    },
    source: 'gpt-4o',
    _meta: {
      debugTrace: `Analyzed directly with GPT-4o Vision${visionResult.imageChallenges ? '. Image challenges: ' + visionResult.imageChallenges.join(', ') : ''}`
    }
  };
  
  return result;
}

/**
 * Simple POST handler for the /api/analyzeImage endpoint
 * Tries Nutritionix first, falls back to GPT if Nutritionix fails
 * Implements caching with a 1-hour TTL
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log('[analyzeImage] handler start');
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  // Validate critical API credentials first to fail fast
  const credentialValidation = validateApiCredentials();
  if (!credentialValidation.valid) {
    console.error(`[${requestId}] API credential validation failed: ${credentialValidation.error}`);
    
    // Create a clear error response with detailed information
    const errorResponse: AnalysisResponse = {
      success: false,
      fallback: true,
      requestId,
      message: `API credential error: ${credentialValidation.error || "Unknown credential error"}`,
      imageUrl: null,
      elapsedTime: Date.now() - startTime,
      result: createUniversalErrorFallback("api_credential_error"),
      error: credentialValidation.error || "Unknown credential error",
      diagnostics: {
        validationErrors: credentialValidation.details,
        timestamp: new Date().toISOString()
      }
    };
    
    return NextResponse.json(errorResponse, { status: 500 });
  }
  
  // Set global timeout for the entire request
  const GLOBAL_TIMEOUT_MS = 30000; // 30 seconds max for the entire request
  let globalTimeoutId: NodeJS.Timeout | null = null;
  
  // Function to validate essential API credentials
  function validateApiCredentials(): { valid: boolean; error?: string; details: Record<string, string> } {
    interface ValidationObject {
      googleVisionValid: boolean;
      nutritionixValid: boolean;
      openaiValid: boolean;
      details: Record<string, string>;
    }
    
    const validation: ValidationObject = {
      googleVisionValid: true, // Always set to true since we're not using Google Vision
      nutritionixValid: false,
      openaiValid: false,
      details: {}
    };
    
    // Check OpenAI API key - CRITICAL, must be valid
    if (!process.env.OPENAI_API_KEY) {
      console.error(`OpenAI API key not found in environment variables`);
      validation.details.openai = "Missing OpenAI API key";
    } else if (process.env.OPENAI_API_KEY.length < 20) {
      console.error(`OpenAI API key is too short: ${process.env.OPENAI_API_KEY.length} characters`);
      validation.details.openai = "OpenAI API key appears invalid (too short)";
    } else {
      console.log(`OpenAI API key found - length: ${process.env.OPENAI_API_KEY.length} chars, starting with: ${process.env.OPENAI_API_KEY.substring(0, 7)}...`);
      validation.openaiValid = true;
    }
    
    // Check Nutritionix API credentials (kept for backward compatibility but not critical)
    if (!process.env.NUTRITIONIX_APP_ID || !process.env.NUTRITIONIX_API_KEY) {
      validation.details.nutritionix = "Missing Nutritionix credentials";
    } else if (process.env.NUTRITIONIX_APP_ID.length < 5 || process.env.NUTRITIONIX_API_KEY.length < 10) {
      validation.details.nutritionix = "Nutritionix credentials appear invalid (too short)";
    } else {
      validation.nutritionixValid = true;
    }
    
    // Nutritionix is no longer required since we're using GPT-4o exclusively
    validation.googleVisionValid = true;
    validation.details.googleVision = "Google Vision not required - using GPT-4o exclusively";
    
    // Determine overall validity - only OpenAI API key is required
    const valid = validation.openaiValid;
    
    let error: string | undefined;
    if (!valid) {
      const missingServices = [];
      if (!validation.openaiValid) missingServices.push("OpenAI");
      
      error = `Missing or invalid OpenAI API key is required for GPT-4o Vision analysis`;
      console.error(`API validation failed: ${error}`);
      
      // Log environment variables status (securely)
      console.log("Environment variables status:");
      console.log(`- USE_GPT4_VISION: ${process.env.USE_GPT4_VISION || 'not set'}`);
      console.log(`- OPENAI_MODEL: ${process.env.OPENAI_MODEL || 'not set'}`);
      console.log(`- USE_OCR_EXTRACTION: ${process.env.USE_OCR_EXTRACTION || 'not set'}`);
    } else {
      console.log(`API validation passed. OpenAI API key is valid.`);
    }
    
    return {
      valid,
      error,
      details: validation.details
    };
  }
  
  // Create timeout promise for the entire request
  const timeoutPromise = new Promise<NextResponse>((_, reject) => {
    globalTimeoutId = setTimeout(() => {
      console.error(`[${requestId}] Request timed out after ${GLOBAL_TIMEOUT_MS}ms`);
      
      // Create a consistent timeout response
      const timeoutResponse: AnalysisResponse = {
        success: false,
        fallback: true,
        requestId,
        message: `Analysis timed out after ${GLOBAL_TIMEOUT_MS}ms`,
        imageUrl: null,
        elapsedTime: GLOBAL_TIMEOUT_MS,
        result: createUniversalErrorFallback("request_timeout"),
        error: "Analysis request timed out",
        diagnostics: {
          timeoutReason: "global_timeout",
          timeoutMs: GLOBAL_TIMEOUT_MS
        }
      };
      
      // Log the final timeout fallback structure
      console.log(`⏱️ [${requestId}] Final timeout response structure:`, {
        result_present: Boolean(timeoutResponse.result),
        result_description: timeoutResponse.result?.description,
        nutrients_count: timeoutResponse.result?.nutrients?.length || 0,
        feedback_count: timeoutResponse.result?.feedback?.length || 0
      });

      reject(NextResponse.json(timeoutResponse, { status: 408 }));
    }, GLOBAL_TIMEOUT_MS);
  });
  
  // Create the main processing promise
  const processingPromise = (async (): Promise<NextResponse> => {
    try {
      // Extract image and health goal from request
      let formData: FormData | null = null;
      let imageBase64: string = '';
      let healthGoal: string = 'general health';
      let userId: string | null = null;
      
      const contentType = request.headers.get('content-type') || '';
      console.log(`[analyzeImage] Content-Type: ${contentType}`);
      
      // Handle multipart/form-data (from forms)
      if (contentType.includes('multipart/form-data')) {
        formData = await request.formData();
        console.log(`[analyzeImage] Form data keys:`, Array.from(formData.keys()));
        
        // Get health goal
        const healthGoalRaw = formData.get('healthGoal')?.toString();
        if (healthGoalRaw) {
          healthGoal = healthGoalRaw;
        }
        
        // Get user ID if provided
        const userIdRaw = formData.get('userId')?.toString();
        if (userIdRaw) {
          userId = userIdRaw;
        }
        
        // Extract base64 from image file
        const imageFile = formData.get('image');
        if (imageFile instanceof File) {
          try {
            imageBase64 = await extractBase64Image(imageFile, requestId);
            console.log(`[analyzeImage] Extracted base64 image (${imageBase64.length} chars)`);
          } catch (extractError) {
            console.error(`[analyzeImage] Failed to extract base64 from image:`, extractError);
            throw new Error('Failed to process image');
          }
        } else {
          throw new Error('No image file provided');
        }
      } 
      // Handle JSON
      else if (contentType.includes('application/json')) {
        const jsonData = await request.json();
        console.log(`[analyzeImage] JSON data keys:`, Object.keys(jsonData));
        
        if (jsonData.healthGoal) {
          healthGoal = jsonData.healthGoal;
        }
        
        if (jsonData.userId) {
          userId = jsonData.userId;
        }
        
        if (jsonData.image || jsonData.base64Image) {
          imageBase64 = jsonData.image || jsonData.base64Image;
          console.log(`[analyzeImage] Got base64 image from JSON (${imageBase64.length} chars)`);
        } else {
          throw new Error('No image data provided in JSON');
        }
      } else {
        console.error(`[analyzeImage] Unsupported content type: ${contentType}`);
        throw new Error(`Unsupported content type: ${contentType}`);
      }
      
      // Check if the provided image is valid
      if (!imageBase64 || imageBase64.length < 100) {
        console.error(`[analyzeImage] Invalid or missing image data`);
        throw new Error('Invalid or missing image data');
      }
      
      // Create a unique cache key based on image and health goal
      const cacheKey = createMD5Hash(`${imageBase64.substring(0, 1000)}:${healthGoal}`);
      const cachedResult = cache.get(cacheKey);
      
      if (cachedResult) {
        console.log(`[${requestId}] Cache hit, returning cached analysis`);
        
        // Ensure cached result is a valid AnalysisResult
        const validatedResult = ensureValidResponseStructure(cachedResult);
        
        // Prepare the response with cached result
        const elapsedTime = Date.now() - startTime;
        const cacheResponse: AnalysisResponse = {
          success: true,
          fallback: false,
          requestId,
          message: "Analysis loaded from cache",
          result: validatedResult,
          elapsedTime,
          error: null,
          imageUrl: null,
          diagnostics: {
            cached: true,
            cacheKey
          }
        };
        
        return NextResponse.json(cacheResponse);
      }
      
      // Check image quality
      const qualityCheck = assessImageQuality(imageBase64, requestId);
      if (!qualityCheck.isValid) {
        console.error(`[${requestId}] Image quality check failed: ${qualityCheck.reason}`);
        
        // Return a clear error response for invalid images
        const qualityErrorResponse: AnalysisResponse = {
          success: false,
          fallback: true,
          requestId,
          message: qualityCheck.warning || "The image couldn't be analyzed",
          imageUrl: null,
          elapsedTime: Date.now() - startTime,
          result: createUniversalFallbackResult("image_quality", {
            feedback: [qualityCheck.warning || "The image couldn't be analyzed"],
            suggestions: ["Try uploading a clearer photo of your food"]
          }),
          error: qualityCheck.reason || "Image quality too low",
          diagnostics: {
            qualityError: qualityCheck
          }
        };
        
        return NextResponse.json(qualityErrorResponse);
      }
      
      // Analyze the image with GPT-4 Vision or using OCR-based analysis
      let analysisResult: AnalysisResult;
      
      // Always use GPT-4o Vision regardless of env setting (forced to true)
      console.log(`[${requestId}] Using GPT-4o for direct image analysis`);
      
      try {
        // Create AbortController for managing timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.warn(`[${requestId}] GPT-4 Vision timeout reached (45s), aborting`);
          controller.abort();
        }, 45000);
        
        try {
          // Run vision analysis - sending raw base64 image directly to GPT-4o
          const visionResult = await analyzeWithGPT4Vision(imageBase64, healthGoal, requestId);
          
          // Clear timeout
          clearTimeout(timeoutId);
          
          // Convert to standard format
          analysisResult = convertVisionResultToAnalysisResult(visionResult, requestId, healthGoal);
          
          console.log(`[${requestId}] GPT-4 Vision analysis successful`);
          
          // Clear the timeout since we're returning early
          if (globalTimeoutId) clearTimeout(globalTimeoutId);
          
          // Prepare the final response
          const elapsedTime = Date.now() - startTime;
          console.log(`[analyzeImage] Completed GPT-4 Vision analysis in ${elapsedTime}ms`);
          
          // Cache the result for future requests
          cache.set(cacheKey, analysisResult);
          
          // Create the final response
          const response: AnalysisResponse = {
            success: true,
            fallback: false,
            requestId,
            message: "Analysis completed successfully with GPT-4o",
            result: analysisResult,
            elapsedTime,
            error: null,
            imageUrl: null,
            diagnostics: {
              visionConfidence: visionResult.confidence,
              modelUsed: "gpt-4o",
              processingTimeMs: elapsedTime
            }
          };
          
          return NextResponse.json(response);
        } catch (visionError: any) {
          // Clear timeout
          clearTimeout(timeoutId);
          
          // Create an error response if GPT-4o analysis fails
          console.error(`[${requestId}] GPT-4o Vision analysis failed:`, visionError.message);
          
          // Return a clear error response without falling back to OCR
          const errorResponse: AnalysisResponse = {
            success: false,
            fallback: true,
            requestId,
            message: "Image analysis failed. Please upload a clearer image.",
            result: createUniversalErrorFallback("vision_analysis_error"),
            elapsedTime: Date.now() - startTime,
            error: visionError.message,
            imageUrl: null,
            diagnostics: {
              error: visionError.message,
              errorType: "gpt4o_vision_error"
            }
          };
          
          return NextResponse.json(errorResponse);
        }
      } catch (visionSetupError: any) {
        console.error(`[${requestId}] Error setting up GPT-4 Vision analysis:`, visionSetupError.message);
        
        // Return a clear error response without falling back to OCR
        const setupErrorResponse: AnalysisResponse = {
          success: false,
          fallback: true,
          requestId,
          message: "Failed to set up image analysis. Please try again.",
          result: createUniversalErrorFallback("vision_setup_error"),
          elapsedTime: Date.now() - startTime,
          error: visionSetupError.message,
          imageUrl: null,
          diagnostics: {
            error: visionSetupError.message,
            errorType: "gpt4o_setup_error"
          }
        };
        
        return NextResponse.json(setupErrorResponse);
      }
    } catch (error: any) {
      console.error(`[${requestId}] Processing error:`, error);
      
      // Create a universal error response
      const errorResponse: AnalysisResponse = {
        success: false,
        fallback: true,
        requestId,
        message: error.message || "An error occurred during analysis",
        result: createUniversalErrorFallback("processing_error"),
        elapsedTime: Date.now() - startTime,
        error: error.message,
        imageUrl: null,
        diagnostics: {
          errorType: error.name,
          errorMessage: error.message,
          errorStack: error.stack,
          timestamp: new Date().toISOString()
        }
      };
      
      return NextResponse.json(errorResponse, { status: 500 });
    }
  });
  
  // Race the processing against the global timeout
  try {
    return await Promise.race([processingPromise(), timeoutPromise]);
  } catch (raceError: any) {
    if (globalTimeoutId) clearTimeout(globalTimeoutId);
    
    // If the error came from our timeout promise, it's already a NextResponse
    if (raceError instanceof NextResponse) {
      return raceError;
    }
    
    // Otherwise create an error response
    console.error(`[${requestId}] Racing error:`, raceError);
    
    const raceErrorResponse: AnalysisResponse = {
      success: false,
      fallback: true,
      requestId,
      message: raceError.message || "An error occurred during analysis",
      result: createUniversalErrorFallback("race_condition_error"),
      elapsedTime: Date.now() - startTime,
      error: raceError.message,
      imageUrl: null,
      diagnostics: {
        errorType: raceError.name,
        errorMessage: raceError.message,
        errorStack: raceError.stack,
        timestamp: new Date().toISOString()
      }
    };
    
    return NextResponse.json(raceErrorResponse, { status: 500 });
  }
}

// Helper function to format goal name
function formatGoalName(healthGoal: string): string {
  if (!healthGoal) return 'General Health';
  
  const goal = healthGoal.toLowerCase();
  
  if (goal.includes('weight loss') || goal.includes('lose weight')) {
    return 'Weight Loss';
  } else if (goal.includes('muscle') || goal.includes('strength')) {
    return 'Build Muscle';
  } else if (goal.includes('keto') || goal.includes('low carb')) {
    return 'Low Carb';
  } else if (goal.includes('heart') || goal.includes('blood pressure')) {
    return 'Heart Health';
  } else if (goal.includes('diabetes') || goal.includes('blood sugar')) {
    return 'Blood Sugar Management';
  } else {
    // Capitalize first letter of each word
    return healthGoal
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
}

// Function to ensure valid response structure
function ensureValidResponseStructure(result: any): AnalysisResult {
  const requestId = crypto.randomUUID().substring(0, 8);
  
  // Debug log at the start of validation
  console.log(`[${requestId}] VALIDATING_RESPONSE_STRUCTURE: Starting validation check`);
  
  if (!result) {
    console.error(`[${requestId}] CRITICAL: Result is null or undefined, creating emergency fallback`);
    return createFallbackResponse("Missing result object", null, requestId);
  }

  // Debug validation steps
  console.log(`[${requestId}] VALIDATION_CHECK:`, JSON.stringify({
    has_description: typeof result.description === 'string',
    has_nutrients: Array.isArray(result.nutrients),
    has_feedback: Array.isArray(result.feedback),
    has_suggestions: Array.isArray(result.suggestions),
    has_detailedIngredients: Array.isArray(result.detailedIngredients),
    has_goalScore: !!result.goalScore,
    has_modelInfo: !!result.modelInfo,
    has_lowConfidence: typeof result.lowConfidence === 'boolean',
    has_fallback: typeof result.fallback === 'boolean',
    has_source: typeof result.source === 'string',
    has_meta: !!result._meta
  }));

  // Create a validated result with all required fields
  const validatedResult: AnalysisResult = {
    description: typeof result.description === 'string' ? result.description : "Could not analyze this meal properly.",
    nutrients: Array.isArray(result.nutrients) && result.nutrients.length > 0 
      ? result.nutrients 
      : [
          { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
          { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
          { name: 'Carbohydrates', value: 0, unit: 'g', isHighlight: true },
          { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
        ],
    feedback: Array.isArray(result.feedback) && result.feedback.length > 0
      ? result.feedback
      : ["Unable to analyze the image."],
    suggestions: Array.isArray(result.suggestions) && result.suggestions.length > 0
      ? result.suggestions
      : ["Try a clearer photo with more lighting."],
    detailedIngredients: Array.isArray(result.detailedIngredients)
      ? result.detailedIngredients
      : [],
    goalScore: result.goalScore && typeof result.goalScore === 'object'
      ? result.goalScore
      : { overall: 0, specific: {} },
    modelInfo: result.modelInfo && typeof result.modelInfo === 'object'
      ? result.modelInfo
      : {
          model: "error_fallback",
          usedFallback: true,
          ocrExtracted: false
        },
    lowConfidence: typeof result.lowConfidence === 'boolean' ? result.lowConfidence : true,
    fallback: typeof result.fallback === 'boolean' ? result.fallback : true,
    source: typeof result.source === 'string' ? result.source : "error_fallback",
    _meta: result._meta && typeof result._meta === 'object'
      ? result._meta
      : {
          debugTrace: "Created by ensureValidResponseStructure"
        }
  };

  // Debug the final validated structure
  console.log(`[${requestId}] FINAL_VALIDATED_STRUCTURE:`, JSON.stringify({
    description_type: typeof validatedResult.description,
    nutrients_length: validatedResult.nutrients?.length || 0,
    feedback_length: validatedResult.feedback?.length || 0,
    suggestions_length: validatedResult.suggestions?.length || 0,
    source: validatedResult.source,
    lowConfidence: validatedResult.lowConfidence,
    fallback: validatedResult.fallback,
    has_meta: !!validatedResult._meta
  }));
  
  // Final critical check to ensure we have all required fields
  if (!validatedResult.description || typeof validatedResult.description !== 'string') {
    console.error(`[${requestId}] CRITICAL: Missing description after validation, forcing default`);
    validatedResult.description = "Could not analyze this meal properly.";
  }
  
  if (!Array.isArray(validatedResult.nutrients) || validatedResult.nutrients.length === 0) {
    console.error(`[${requestId}] CRITICAL: Missing nutrients after validation, forcing defaults`);
    validatedResult.nutrients = [
      { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
      { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
      { name: 'Carbs', value: 0, unit: 'g', isHighlight: true },
      { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
    ];
  }
  
  console.log(`✅ [Returning validated structure]`, {
    has_description: !!validatedResult.description,
    description_length: validatedResult.description?.length || 0,
    nutrients_count: validatedResult.nutrients?.length || 0,
    source: validatedResult.source,
    has_meta: !!validatedResult._meta
  });

  return validatedResult;
}

/**
 * Ensures critical fields are present in the analysis result
 * This is the last line of defense before storage
 */
function ensureCriticalFields(result: any): any {
  if (!result) {
    console.error('CRITICAL: Result is null or undefined before save');
    return createUniversalErrorFallback("ensure_critical_null");
  }
  
  // Use our dedicated analysis validator
  if (!isValidAnalysis(result)) {
    console.error('CRITICAL: Analysis validation failed before save, using universal fallback but preserving partial data');
    // Use createUniversalFallbackResult which accepts partial data
    return createUniversalFallbackResult("invalid_analysis", result);
  }
  
  // Valid analysis, but still ensure structure consistency
  const normalized = normalizeAnalysisResult(result);
  
  // Final validation check - more lenient to allow partial data
  // Only require nutrients array OR description to be present
  const hasNutrients = Array.isArray(normalized.nutrients) && normalized.nutrients.length > 0;
  const hasDescription = !!normalized.description;
  
  if (!hasNutrients && !hasDescription) {
    console.error('CRITICAL: Normalized result still missing both description and nutrients, using guaranteed fallback with partial data');
    // Use createUniversalFallbackResult which accepts partial data
    return createUniversalFallbackResult("post_normalization_invalid", normalized);
  }
  
  // Log a warning if we're proceeding with partial data
  if (!hasDescription) console.warn('Proceeding with normalized result missing description but nutrients present');
  if (!hasNutrients) console.warn('Proceeding with normalized result missing nutrients but description present');
  
  console.info("[Test] Fallback result with partial data accepted ✅");
  return normalized;
}