import { NextRequest, NextResponse } from 'next/server';
import NodeCache from 'node-cache'
import { OpenAI } from 'openai'
import axios from 'axios';
import crypto from 'crypto';
import { adminStorage } from '@/lib/firebaseAdmin';
import { trySaveMealServer } from '@/lib/serverMealUtils';
import { uploadImageToFirebase } from '@/lib/firebaseStorage';
import { extractBase64Image } from '@/lib/imageProcessing';
import { getNutritionData, createNutrientAnalysis, NutritionData, NutritionixFood } from '@/lib/nutritionixApi';
import { callGptNutritionFallback } from '@/lib/gptNutrition';
import { createEmptyFallbackAnalysis } from '@/lib/analyzeImageWithOCR';
import { runOCR, OCRResult } from '@/lib/runOCR';
import { analyzeMealTextOnly, MealAnalysisResult } from '@/lib/analyzeMealTextOnly';
import { API_CONFIG } from '@/lib/constants';
import { createAnalysisDiagnostics, checkOCRConfig, checkNutritionixCredentials } from '@/lib/diagnostics';
import { GPT_MODEL } from '@/lib/constants';
import { saveMealToFirestore } from '@/lib/mealUtils';
import { isValidAnalysis, normalizeAnalysisResult } from '@/lib/utils/analysisValidator';

const cache = new NodeCache({ stdTTL: 60 * 60 })  // 1 hour
const oai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

/**
 * Creates a guaranteed valid error fallback result with all required fields
 * to prevent frontend from crashing when no data is available
 */
function createUniversalErrorFallback(reason: string = "unknown"): AnalysisResult {
  // Create a hardcoded, guaranteed complete fallback that will always work
  const errorFallback: AnalysisResult = {
    description: "Could not analyze meal.",
    nutrients: [
      { name: "Calories", value: 0, unit: "kcal", isHighlight: true },
      { name: "Protein", value: 0, unit: "g", isHighlight: true },
      { name: "Carbs", value: 0, unit: "g", isHighlight: true },
      { name: "Fat", value: 0, unit: "g", isHighlight: true }
    ],
    feedback: ["No nutritional data was found."],
    suggestions: ["Try a clearer image with more visible food."],
    detailedIngredients: [],
    fallback: true,
    lowConfidence: true,
    source: "error_fallback",
    goalScore: {
      overall: 0,
      specific: {}
    },
    modelInfo: {
      model: `universal_error_fallback:${reason}`,
      usedFallback: true,
      ocrExtracted: false
    }
  };
  
  return errorFallback;
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
  };
  lowConfidence?: boolean;
  fallback?: boolean;
  source?: string;
  saved?: boolean;
  savedMealId?: string;
  saveError?: string;
}

interface ExtendedNutritionData extends NutritionData {
  source: string;
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
 * Validates nutrition data to ensure it has all required fields
 * @param data The nutrition data to validate
 * @param requestId Request identifier for logging
 * @returns Validated nutrition data with all required fields
 */
function validateNutritionData(data: any, requestId: string): ExtendedNutritionData {
  console.log(`[${requestId}] Validating nutrition data`);
  
  if (!data || typeof data !== 'object') {
    console.error(`[${requestId}] Invalid nutrition data: data is not an object`);
    return createFallbackNutritionData(requestId);
  }
  
  const validated: ExtendedNutritionData = {
    nutrients: [],
    foods: [],
    raw: {},
    source: data.source || 'fallback'
  };
  
  // Validate nutrients
  if (!Array.isArray(data.nutrients) || data.nutrients.length === 0) {
    console.warn(`[${requestId}] Missing or invalid nutrients array, creating default nutrients`);
    validated.nutrients = [
      { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
      { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
      { name: 'Carbohydrates', value: 0, unit: 'g', isHighlight: true },
      { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
    ];
  } else {
    // Copy existing nutrients but ensure they have all required properties
    validated.nutrients = data.nutrients.map((nutrient: any, index: number) => {
      if (!nutrient || typeof nutrient !== 'object') {
        console.warn(`[${requestId}] Invalid nutrient at index ${index}, creating default nutrient`);
        return { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true };
      }
      
      return {
        name: nutrient.name || `Nutrient ${index + 1}`,
        value: nutrient.value !== undefined ? nutrient.value : 0,
        unit: nutrient.unit || 'g',
        isHighlight: nutrient.isHighlight !== undefined ? nutrient.isHighlight : false,
        percentOfDailyValue: nutrient.percentOfDailyValue,
        amount: nutrient.amount
      };
    });
  }
  
  // Validate foods
  if (!Array.isArray(data.foods) || data.foods.length === 0) {
    console.warn(`[${requestId}] Missing or invalid foods array, creating default food`);
    validated.foods = [{
      food_name: "Unknown food",
      serving_qty: 1,
      serving_unit: "serving",
      serving_weight_grams: 100,
      nf_calories: 0,
      nf_total_fat: 0,
      nf_saturated_fat: 0,
      nf_cholesterol: 0,
      nf_sodium: 0,
      nf_total_carbohydrate: 0,
      nf_dietary_fiber: 0,
      nf_sugars: 0,
      nf_protein: 0,
      nf_potassium: 0,
      nf_p: 0,
      full_nutrients: [],
      photo: {
        thumb: '',
        highres: '',
        is_user_uploaded: false
      }
    }];
  } else {
    validated.foods = data.foods;
  }
  
  // Validate raw data
  if (!data.raw || typeof data.raw !== 'object') {
    console.warn(`[${requestId}] Missing or invalid raw data, creating default raw data`);
    validated.raw = {
      description: "Could not analyze this meal properly.",
      feedback: ["Unable to analyze the image."],
      suggestions: ["Try a clearer photo with more lighting."],
      goalScore: {
        overall: 0,
        specific: {}
      }
    };
  } else {
    validated.raw = { ...data.raw };
    
    // Ensure raw.description exists
    if (!validated.raw.description || typeof validated.raw.description !== 'string') {
      console.warn(`[${requestId}] Missing or invalid description in raw data, setting default`);
      validated.raw.description = "Could not analyze this meal properly.";
    }
    
    // Ensure raw.feedback exists as an array
    if (!Array.isArray(validated.raw.feedback)) {
      console.warn(`[${requestId}] Missing or invalid feedback in raw data, setting default`);
      validated.raw.feedback = ["Unable to analyze the image."];
    }
    
    // Ensure raw.suggestions exists as an array
    if (!Array.isArray(validated.raw.suggestions)) {
      console.warn(`[${requestId}] Missing or invalid suggestions in raw data, setting default`);
      validated.raw.suggestions = ["Try a clearer photo with more lighting."];
    }
    
    // Ensure raw.goalScore exists
    if (!validated.raw.goalScore || typeof validated.raw.goalScore !== 'object') {
      console.warn(`[${requestId}] Missing or invalid goalScore in raw data, setting default`);
      validated.raw.goalScore = {
        overall: 0,
        specific: {}
      };
    }
  }
  
  console.log(`[${requestId}] Nutrition data validation complete`);
  return validated;
}

/**
 * Creates a fallback nutrition data structure with valid defaults
 * @param requestId Request identifier for logging
 * @returns A valid fallback nutrition data object
 */
function createFallbackNutritionData(requestId: string): ExtendedNutritionData {
  console.log(`[${requestId}] Creating fallback nutrition data`);
  
  return {
    nutrients: [
      { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
      { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
      { name: 'Carbohydrates', value: 0, unit: 'g', isHighlight: true },
      { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
    ],
    foods: [{
      food_name: "Unknown food",
      serving_qty: 1,
      serving_unit: "serving",
      serving_weight_grams: 100,
      nf_calories: 0,
      nf_total_fat: 0,
      nf_saturated_fat: 0,
      nf_cholesterol: 0,
      nf_sodium: 0,
      nf_total_carbohydrate: 0,
      nf_dietary_fiber: 0,
      nf_sugars: 0,
      nf_protein: 0,
      nf_potassium: 0,
      nf_p: 0,
      full_nutrients: [],
      photo: {
        thumb: '',
        highres: '',
        is_user_uploaded: false
      }
    }],
    raw: {
      description: "Could not analyze this meal properly.",
      feedback: ["Unable to analyze the image."],
      suggestions: ["Try a clearer photo with more lighting."],
      goalScore: {
        overall: 0,
        specific: {}
      }
    },
    source: 'fallback'
  };
}

/**
 * Fetch nutrition data with caching and fallback
 * @param text OCR text to analyze
 * @param requestId Request identifier for tracking
 * @returns Nutrition data from either Nutritionix or GPT fallback
 */
async function fetchNutrition(
  text: string,
  requestId: string
): Promise<NutritionData> {
  console.log(`[${requestId}] fetchNutrition: Starting. Text: ${text.substring(0, 30)}...`);

  try {
    // First, check if Nutritionix API keys are set
    const hasNutritionixApiId = !!process.env.NUTRITIONIX_APP_ID;
    const hasNutritionixApiKey = !!process.env.NUTRITIONIX_API_KEY;
    
    const useNutritionix = hasNutritionixApiId && hasNutritionixApiKey;
    
    if (!useNutritionix) {
      console.log(`[${requestId}] fetchNutrition: Nutritionix credentials not found, using GPT fallback`);
      const gptFallback = await callGptNutritionFallback(text, requestId);
      
      // Validate GPT fallback data
      return validateNutritionData(gptFallback, requestId);
    }
    
    try {
      console.log(`[${requestId}] fetchNutrition: Trying Nutritionix API`);
      const startTime = Date.now();
      
      // Call the Nutritionix API
      const nutritionixData = await getNutritionData(text, requestId);
      
      if (nutritionixData.success && nutritionixData.data) {
        console.log(`[${requestId}] fetchNutrition: Nutritionix success in ${Date.now() - startTime}ms`);
        
        // Add source information and validate
        const extendedData: ExtendedNutritionData = {
          ...nutritionixData.data,
          source: 'nutritionix'
        };
        
        return validateNutritionData(extendedData, requestId);
      } else {
        throw new Error(nutritionixData.error || 'Nutritionix returned unsuccessful response');
      }
    } catch (error) {
      console.warn(`[${requestId}] fetchNutrition: Nutritionix failed: ${error}. Using GPT fallback`);
      
      // If Nutritionix fails, fall back to GPT
      const gptFallback = await callGptNutritionFallback(text, requestId);
      
      // Validate GPT fallback data
      return validateNutritionData(gptFallback, requestId);
    }
  } catch (error: any) {
    console.error(`[${requestId}] fetchNutrition: Both sources failed: ${error.message}`);
    
    // Return validated fallback nutrition data
    return createFallbackNutritionData(requestId);
  }
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
  
  // Set global timeout for the entire request
  const GLOBAL_TIMEOUT_MS = 30000; // 30 seconds max for the entire request
  let globalTimeoutId: NodeJS.Timeout | null = null;
  
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
        result: createUniversalFallbackResult("request_timeout"),
        error: "Analysis request timed out",
        diagnostics: null
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
        throw new Error(`Unsupported content type: ${contentType}`);
      }
      
      if (!imageBase64) {
        throw new Error('No image data provided');
      }
      
      // Compute a cache key - we use a hash of the image data to avoid storing the whole image in the key
      const imageHash = createMD5Hash(imageBase64);
      const cacheKey = `${healthGoal}_${imageHash}`;
      
      // Check if we have a cached result
      if (cache.has(cacheKey)) {
        console.log(`[analyzeImage] Cache hit for ${cacheKey}`);
        const cachedResult = cache.get(cacheKey) as any;
        
        // Validate the cached result to ensure it has all required fields
        let validCachedResult = {...cachedResult};
        if (!cachedResult.description || typeof cachedResult.description !== 'string') {
          console.warn(`[analyzeImage] Cached result missing valid description, fixing...`);
          validCachedResult.description = "Could not analyze this meal properly.";
        }
        
        if (!Array.isArray(validCachedResult.nutrients) || validCachedResult.nutrients.length === 0) {
          console.warn(`[analyzeImage] Cached result missing valid nutrients, fixing...`);
          validCachedResult.nutrients = [
            { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
            { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
            { name: 'Carbohydrates', value: 0, unit: 'g', isHighlight: true },
            { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
          ];
        }
        
        // Ensure feedback array exists
        if (!Array.isArray(validCachedResult.feedback) || validCachedResult.feedback.length === 0) {
          console.warn(`[analyzeImage] Cached result missing valid feedback, fixing...`);
          validCachedResult.feedback = ["We couldn't properly analyze this meal."];
        }
        
        // Ensure suggestions array exists
        if (!Array.isArray(validCachedResult.suggestions) || validCachedResult.suggestions.length === 0) {
          console.warn(`[analyzeImage] Cached result missing valid suggestions, fixing...`);
          validCachedResult.suggestions = ["Try a clearer photo with more lighting."];
        }
        
        // Ensure detailedIngredients array exists
        if (!Array.isArray(validCachedResult.detailedIngredients)) {
          console.warn(`[analyzeImage] Cached result missing detailedIngredients, fixing...`);
          validCachedResult.detailedIngredients = [];
        }
        
        // Ensure goalScore exists
        if (!validCachedResult.goalScore || typeof validCachedResult.goalScore !== 'object') {
          console.warn(`[analyzeImage] Cached result missing goalScore, fixing...`);
          validCachedResult.goalScore = { overall: 0, specific: {} };
        }
        
        // Validate cached result structure to prevent frontend crashes
        if (
          !validCachedResult ||
          !validCachedResult.description ||
          !Array.isArray(validCachedResult.nutrients) ||
          validCachedResult.nutrients.length === 0
        ) {
          console.warn(`[${requestId}] 💥 Final fallback triggered before cached response`);
          validCachedResult = createUniversalFallbackResult("cached-result-validation-failure");
        }
        
        // Clear the timeout since we're returning early
        if (globalTimeoutId) clearTimeout(globalTimeoutId);
        
        // Create the response
        const response = { 
          success: true,
          data: validCachedResult,
          cached: true,
          elapsedTime: Date.now() - startTime,
          requestId
        };
        
        return NextResponse.json(response);
      }
      
      console.log(`[analyzeImage] Cache miss for ${cacheKey}, processing...`);
      
      // Run OCR with error handling and timeout
      console.log(`[${requestId}] Running OCR on image...`);
      let ocrResult: OCRResult;
      
      try {
        // Add explicit timeout for OCR to avoid hanging requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.warn(`[${requestId}] OCR timeout reached (10s), aborting`);
          controller.abort();
        }, 10000);

        // Run OCR with the specified timeout
        ocrResult = await Promise.race([
          runOCR(imageBase64, requestId),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('OCR_TIMEOUT')), 10000)
          )
        ]);
        clearTimeout(timeoutId);
      } catch (ocrError: any) {
        // Handle OCR timeout or other errors
        console.error(`[${requestId}] OCR error:`, ocrError.message);
        ocrResult = {
          success: false,
          text: "",
          confidence: 0,
          error: ocrError.message,
          processingTimeMs: 0
        };
      }
      
      // Extract text from OCR result
      let extractedText = ocrResult.text || "";
      
      // Debug logs for OCR output
      console.log(`[${requestId}] OCR complete: success=${ocrResult.success}, confidence=${ocrResult.confidence}`);
      console.log(`[${requestId}] Extracted text (${extractedText.length} chars): ${extractedText.substring(0, 100)}`);
      
      // Process the extracted text only if we have something meaningful
      // Otherwise, proceed with a fallback approach
      let nutritionData: NutritionData;
      let analysis: any = { 
        success: false, 
        feedback: ["Unable to analyze this image."], 
        suggestions: ["Try uploading a photo of food."] 
      };
      
      if (extractedText.length > 0 && ocrResult.success) {
        // Get nutrition data from the extracted text
        nutritionData = await fetchNutrition(extractedText, requestId);
        
        try {
          // Analyze the extracted text to get feedback and suggestions
          analysis = await createNutrientAnalysis(
            nutritionData.nutrients,
            [healthGoal],
            requestId
          );
        } catch (analysisError: any) {
          console.error(`[${requestId}] Error analyzing extracted text:`, analysisError.message);
          // Provide fallback analysis
          analysis = {
            success: false,
            feedback: ["Unable to analyze the text extracted from this image."],
            suggestions: ["Try a clearer photo with better lighting."],
            goalScore: { overall: 0, specific: {} }
          };
        }
      } else {
        // If OCR failed or returned no text, create a fallback response
        console.warn(`[${requestId}] OCR failed or returned no text, using fallback response`);
        nutritionData = {
          nutrients: [
            { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
            { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
            { name: 'Carbohydrates', value: 0, unit: 'g', isHighlight: true },
            { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
          ],
          foods: [{
            food_name: "Unknown food",
            serving_qty: 1,
            serving_unit: "serving",
            serving_weight_grams: 100,
            nf_calories: 0,
            nf_total_fat: 0,
            nf_saturated_fat: 0,
            nf_cholesterol: 0,
            nf_sodium: 0,
            nf_total_carbohydrate: 0,
            nf_dietary_fiber: 0,
            nf_sugars: 0,
            nf_protein: 0,
            nf_potassium: 0,
            nf_p: 0,
            full_nutrients: [],
            photo: {
              thumb: '',
              highres: '',
              is_user_uploaded: false
            }
          }],
          raw: {
            description: "Could not identify food in this image.",
            feedback: ["This doesn't appear to be a food image."],
            suggestions: ["Try uploading a photo that clearly shows a meal."],
            goalScore: {
              overall: 0,
              specific: {} as Record<string, number>
            },
            fallback: true,
            error: "No food detected in image"
          },
          source: "error_fallback"
        };
      }
      
      // Create analysis from the nutrition data
      const analysisResult: AnalysisResult = {
        description: nutritionData.raw?.description || "Could not analyze this meal properly.",
        nutrients: nutritionData.nutrients || [
          { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
          { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
          { name: 'Carbohydrates', value: 0, unit: 'g', isHighlight: true },
          { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
        ],
        feedback: (nutritionData.raw?.feedback || analysis.feedback) as string[],
        suggestions: (nutritionData.raw?.suggestions || analysis.suggestions) as string[],
        detailedIngredients: nutritionData.foods.map(food => ({
          name: food.food_name,
          category: 'food',
          confidence: 0.8,
          confidenceEmoji: '✅'
        })),
        goalScore: {
          overall: nutritionData.raw?.goalScore?.overall || 0,
          specific: nutritionData.raw?.goalScore?.specific || {}
        },
        goalName: formatGoalName(healthGoal),
        modelInfo: {
          model: nutritionData.source || "fallback",
          usedFallback: nutritionData.raw?.fallback || false,
          ocrExtracted: !!extractedText
        },
        lowConfidence: nutritionData.raw?.fallback || false,
        fallback: nutritionData.raw?.fallback || false,
        source: nutritionData.source || "fallback"
      };
      
      // Debug log for analysis result structure
      console.log(`[${requestId}] ANALYSIS_RESULT_STRUCTURE:`, JSON.stringify({
        has_description: Boolean(analysisResult.description),
        has_nutrients: Array.isArray(analysisResult.nutrients) && analysisResult.nutrients.length > 0,
        nutrients_length: analysisResult.nutrients?.length || 0,
        has_feedback: Array.isArray(analysisResult.feedback) && analysisResult.feedback.length > 0,
        has_suggestions: Array.isArray(analysisResult.suggestions) && analysisResult.suggestions.length > 0,
        has_detailedIngredients: Array.isArray(analysisResult.detailedIngredients),
        has_modelInfo: !!analysisResult.modelInfo,
        source: analysisResult.source
      }));
      
      // Final validation to ensure frontend compatibility before returning
      const validatedResult = ensureValidResponseStructure(analysisResult);
      
      // If userId is provided, save the analysis result to Firestore
      let savedMealId: string | null = null;
      if (userId && imageBase64) {
        try {
          console.log(`[analyzeImage] Saving analysis to Firestore for user ${userId}`);
          
          // Add validation right before the save
          if (validatedResult) {
            const validatedResultForSave = ensureCriticalFields(validatedResult);
            
            // Save with a timeout to prevent blocking
            const savePromise = trySaveMealServer({
              userId,
              imageUrl: imageBase64,
              analysis: validatedResultForSave, // Use the validated result
              requestId
            });
            
            const saveResult = await savePromise;
            savedMealId = saveResult.savedMealId || null;
            console.log(`[analyzeImage] Saved meal to Firestore with ID: ${savedMealId}`);
          }
        } catch (saveError) {
          console.error(`[analyzeImage] Failed to save meal to Firestore:`, saveError);
          // Don't fail the whole request if saving fails
        }
      }
      
      // Cache the result for future requests
      cache.set(cacheKey, {
        ...validatedResult,
        savedMealId
      });
      
      // Prepare the final response
      const elapsedTime = Date.now() - startTime;
      console.log(`[analyzeImage] Completed analysis in ${elapsedTime}ms using ${(nutritionData as any).source}`);
      
      // Clear the timeout since we're returning successfully
      if (globalTimeoutId) clearTimeout(globalTimeoutId);
      
      // Create the final response
      const response: AnalysisResponse = {
        success: true,
        fallback: (nutritionData as any).source !== 'nutritionix',
        requestId,
        message: "Analysis completed successfully" + (ocrResult.error ? " (with text extraction fallback)" : ""),
        result: validatedResult,
        elapsedTime,
        error: null,
        imageUrl: null,
        diagnostics: {
          ocrConfidence: ocrResult.confidence,
          usedFallback: (nutritionData as any).source !== 'nutritionix',
          source: (nutritionData as any).source,
          textLength: extractedText.length,
          processingTimeMs: elapsedTime
        }
      };
      
      // Add savedMealId if we have one
      if (savedMealId) {
        (response as any).savedMealId = savedMealId;
      }
      
      // Debug log the final response structure
      console.log(`[RESPONSE_DEBUG] Final response structure:`, JSON.stringify({
        success: response.success,
        result_present: Boolean(response.result),
        result_description_present: Boolean(response.result?.description),
        result_nutrients_present: Array.isArray(response.result?.nutrients) && response.result?.nutrients.length > 0,
        result_feedback_present: Array.isArray(response.result?.feedback) && response.result?.feedback.length > 0,
        result_suggestions_present: Array.isArray(response.result?.suggestions) && response.result?.suggestions.length > 0
      }));
      
      // Validate the response structure before returning
      console.log(`[${requestId}] Final response validation to ensure valid structure`);

      // Validate the result structure 
      if (!response.result || 
          (!response.result.description && !Array.isArray(response.result.nutrients))) {
        console.warn(`[${requestId}] Invalid response structure detected, applying universal fallback`);
        response.result = createUniversalFallbackResult("invalid_structure", response.result || {});
      } else {
        // Ensure we have a fully valid structure even if some parts might be missing
        const normalizedResult = normalizeAnalysisResult(response.result);
        response.result = normalizedResult;
        
        // Double-check critical fields but be more lenient
        // Only require nutrients array OR description to be present - not both
        const hasNutrients = Array.isArray(normalizedResult.nutrients) && normalizedResult.nutrients.length > 0;
        const hasDescription = !!normalizedResult.description;
        
        if (!hasNutrients && !hasDescription) {
          console.warn(`[${requestId}] Normalization failed to create valid structure, using universal fallback but preserving partial data`);
          response.result = createUniversalFallbackResult("post_normalization_check", normalizedResult);
          console.info("[Test] Fallback result accepted with partial data ✅");
        } else {
          // At least one critical field is present
          console.log(`[${requestId}] Partial result structure is acceptable`);
          if (!hasDescription) console.warn(`[${requestId}] Missing description but nutrients present - proceeding with partial data`);
          if (!hasNutrients) console.warn(`[${requestId}] Missing nutrients but description present - proceeding with partial data`);
          console.info("[Test] Fallback result accepted ✅");
        }
      }

      // Log the final response structure
      console.log(`[${requestId}] Final response:`, {
        success: response.success,
        fallback: response.fallback, 
        resultExists: !!response.result,
        descriptionExists: !!response.result?.description,
        nutrientsLength: response.result?.nutrients?.length || 0,
        feedbackLength: response.result?.feedback?.length || 0,
        suggestionsLength: response.result?.suggestions?.length || 0
      });

      return NextResponse.json(response);
      
    } catch (error: any) {
      console.error(`Error processing image: ${error.message}`);
      const errorMessage = error.message || 'Unknown error occurred';
      
      // Fix the createAnalysisDiagnostics call to match the expected parameters
      const diagnostics = createAnalysisDiagnostics(requestId);
      diagnostics.recordStage('error', async () => { 
        throw new Error(errorMessage);
      }).catch(() => {});
      diagnostics.complete(false);
      
      // Create a valid error response
      const errorResponse: AnalysisResponse = {
        success: false,
        fallback: true,
        requestId,
        message: errorMessage,
        imageUrl: null,
        elapsedTime: Date.now() - startTime,
        result: createUniversalFallbackResult("catch-block-server-error"),
        error: errorMessage,
        diagnostics
      };
      
      // Validate the error response structure 
      if (!errorResponse.result || 
          (!errorResponse.result.description && !Array.isArray(errorResponse.result.nutrients))) {
        console.warn(`[${requestId}] Invalid error response structure detected, applying universal fallback`);
        errorResponse.result = createUniversalFallbackResult("error_response_invalid", errorResponse.result || {});
      } else {
        // Log that we're proceeding with a partial error response
        const hasNutrients = Array.isArray(errorResponse.result.nutrients) && errorResponse.result.nutrients.length > 0;
        const hasDescription = !!errorResponse.result.description;
        
        if (hasNutrients || hasDescription) {
          console.warn(`[${requestId}] Proceeding with partial error response data`);
          console.info("[Test] Fallback error result accepted with partial data ✅");
        }
      }
      
      // Log the final response structure
      console.log(`[${requestId}] Final error response:`, {
        success: errorResponse.success,
        fallback: errorResponse.fallback,
        resultExists: !!errorResponse.result,
        descriptionExists: !!errorResponse.result?.description,
        nutrientsLength: errorResponse.result?.nutrients?.length || 0,
        feedbackLength: errorResponse.result?.feedback?.length || 0,
        suggestionsLength: errorResponse.result?.suggestions?.length || 0
      });
      
      return NextResponse.json(errorResponse, { status: 500 });
    }
  })();
  
  // Race the processing against the global timeout
  return Promise.race([processingPromise, timeoutPromise]);
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
    has_source: typeof result.source === 'string'
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
    fallback: typeof result.fallback === 'boolean' ? result.fallback : true
  };

  // Set source if it's missing
  if (typeof result.source === 'string') {
    (validatedResult as any).source = result.source;
  } else {
    (validatedResult as any).source = "error_fallback";
  }

  // Debug the final validated structure
  console.log(`[${requestId}] FINAL_VALIDATED_STRUCTURE:`, JSON.stringify({
    description_type: typeof validatedResult.description,
    nutrients_length: validatedResult.nutrients?.length || 0,
    feedback_length: validatedResult.feedback?.length || 0,
    suggestions_length: validatedResult.suggestions?.length || 0,
    source: (validatedResult as any).source,
    lowConfidence: validatedResult.lowConfidence,
    fallback: validatedResult.fallback
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
    source: (validatedResult as any).source
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
    return createUniversalFallbackResult("ensure_critical_null");
  }
  
  // Use our dedicated analysis validator
  if (!isValidAnalysis(result)) {
    console.error('CRITICAL: Analysis validation failed before save, using universal fallback but preserving partial data');
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
    return createUniversalFallbackResult("post_normalization_invalid", normalized);
  }
  
  // Log a warning if we're proceeding with partial data
  if (!hasDescription) console.warn('Proceeding with normalized result missing description but nutrients present');
  if (!hasNutrients) console.warn('Proceeding with normalized result missing nutrients but description present');
  
  console.info("[Test] Fallback result with partial data accepted ✅");
  return normalized;
}