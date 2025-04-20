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
  
  // Create a hardcoded fallback response that matches expected structure
  const fallbackResponse: AnalysisResult = {
    description: "Could not analyze meal.",
    nutrients: [
      { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
      { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
      { name: 'Carbs', value: 0, unit: 'g', isHighlight: true },
      { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
    ],
    feedback: ["No nutritional data was found."],
    suggestions: ["Try a clearer image with more visible food."],
    detailedIngredients: [],
    goalScore: { 
      overall: 0, 
      specific: {} 
    },
    modelInfo: {
      model: "error_fallback",
      usedFallback: true,
      ocrExtracted: false
    },
    lowConfidence: true,
    fallback: true,
    source: "error_fallback"
  };
  
  console.debug(`[${requestId}] Fallback response structure check:
    - Description: ${fallbackResponse.description ? 'exists' : 'missing'}
    - Nutrients count: ${fallbackResponse.nutrients?.length || 0}
    - Feedback: ${fallbackResponse.feedback?.length || 0} items
    - Suggestions: ${fallbackResponse.suggestions?.length || 0} items
    - Model info: ${fallbackResponse.modelInfo ? 'exists' : 'missing'}
    - Source: ${fallbackResponse.source || 'missing'}`);
    
  // Additional stringent validation to ensure no undefined values
  if (!fallbackResponse.description) fallbackResponse.description = "Could not analyze meal.";
  if (!Array.isArray(fallbackResponse.nutrients) || fallbackResponse.nutrients.length === 0) {
    fallbackResponse.nutrients = [
      { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true }
    ];
  }
  if (!Array.isArray(fallbackResponse.feedback) || fallbackResponse.feedback.length === 0) {
    fallbackResponse.feedback = ["No nutritional data was found."];
  }
  if (!Array.isArray(fallbackResponse.suggestions) || fallbackResponse.suggestions.length === 0) {
    fallbackResponse.suggestions = ["Try a clearer image with more visible food."];
  }
  if (!Array.isArray(fallbackResponse.detailedIngredients)) {
    fallbackResponse.detailedIngredients = [];
  }
  
  console.log(`✅ [Returning fallback response]`, {
    description: fallbackResponse.description,
    nutrients_count: fallbackResponse.nutrients.length,
    feedback_count: fallbackResponse.feedback.length,
    suggestions_count: fallbackResponse.suggestions.length,
    source: fallbackResponse.source
  });
  
  return fallbackResponse;
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
  
  // Create promise to handle global timeout
  const timeoutPromise = new Promise<NextResponse>((resolve) => {
    globalTimeoutId = setTimeout(() => {
      console.error(`[analyzeImage] Global timeout reached after ${GLOBAL_TIMEOUT_MS}ms`);
      
      // Create a valid fallback result structure for timeout
      const fallbackResult: AnalysisResult = {
        description: "Analysis timed out. Please try again.",
        nutrients: [
          { name: "Calories", value: 0, unit: "kcal", isHighlight: true },
          { name: "Protein", value: 0, unit: "g", isHighlight: true },
          { name: "Carbohydrates", value: 0, unit: "g", isHighlight: true },
          { name: "Fat", value: 0, unit: "g", isHighlight: true }
        ],
        feedback: ["The analysis took too long to complete."],
        suggestions: ["Try again with a clearer image", "Ensure you have a stable internet connection"],
        detailedIngredients: [
          { name: "Unknown", category: "food", confidence: 0, confidenceEmoji: "❓" }
        ],
        goalScore: { overall: 0, specific: {} },
        modelInfo: {
          model: "timeout_fallback",
          usedFallback: true,
          ocrExtracted: false
        },
        lowConfidence: true,
        fallback: true,
        source: "timeout_fallback"
      };
      
      // Debug the FINAL timeout fallback structure
      console.log("✅ [Returning timeout fallback]", {
        description: fallbackResult.description,
        nutrients_count: fallbackResult.nutrients.length,
        feedback_count: fallbackResult.feedback.length,
        suggestions_count: fallbackResult.suggestions.length,
        source: fallbackResult.source
      });
      
      const timeoutResponse: AnalysisResponse = {
        success: false,
        fallback: true,
        message: "Meal analysis timed out or failed. Please try again.",
        requestId,
        error: "Global timeout reached",
        result: fallbackResult,
        elapsedTime: Date.now() - startTime,
        imageUrl: null,
        diagnostics: {
          error: "Global timeout reached",
          timeoutMs: GLOBAL_TIMEOUT_MS
        },
        timing: {
          total: Date.now() - startTime,
          components: {}
        }
      };
      
      // Final validation check for timeout response
      console.log("Final timeout result:", timeoutResponse.result);
      if (!timeoutResponse.result || 
          !timeoutResponse.result.description || 
          typeof timeoutResponse.result.description !== 'string' ||
          !Array.isArray(timeoutResponse.result.nutrients) || 
          timeoutResponse.result.nutrients.length === 0 ||
          !Array.isArray(timeoutResponse.result.feedback) ||
          !Array.isArray(timeoutResponse.result.suggestions)) {
        console.warn(`[${requestId}] CRITICAL: Timeout response has invalid structure, applying universal fallback`);
        timeoutResponse.result = createUniversalErrorFallback();
        console.log("💥 [UNIVERSAL FALLBACK APPLIED TO TIMEOUT]", {
          description: timeoutResponse.result.description,
          nutrients_count: timeoutResponse.result.nutrients.length
        });
      }
      
      // Final stringent check to ensure each nutrient has required properties
      if (timeoutResponse.result && Array.isArray(timeoutResponse.result.nutrients)) {
        for (let i = 0; i < timeoutResponse.result.nutrients.length; i++) {
          const nutrient = timeoutResponse.result.nutrients[i];
          if (!nutrient || 
              !nutrient.name || 
              (nutrient.value === undefined) || 
              !nutrient.unit) {
            console.warn(`[${requestId}] CRITICAL: Nutrient at index ${i} in timeout has invalid structure, fixing...`);
            timeoutResponse.result.nutrients[i] = { 
              name: nutrient?.name || 'Calories', 
              value: nutrient?.value ?? 0, 
              unit: nutrient?.unit || 'kcal',
              isHighlight: nutrient?.isHighlight || true 
            };
          }
        }
      }
      
      // Triple validation check - apply emergency hardcoded fallback if still invalid
      if (
        !timeoutResponse.result || 
        !timeoutResponse.result.description || 
        !Array.isArray(timeoutResponse.result.nutrients) || 
        timeoutResponse.result.nutrients.length === 0
      ) {
        console.error("🚨 [TIMEOUT PATH] EMERGENCY FALLBACK REQUIRED");
        timeoutResponse.result = {
          description: "Could not analyze meal.",
          nutrients: [{ name: "Calories", value: 0, unit: "kcal", isHighlight: true }],
          feedback: ["No nutritional data was found."],
          suggestions: ["Try a clearer image with more visible food."],
          detailedIngredients: [],
          source: "error_fallback",
          fallback: true,
          lowConfidence: true,
          goalScore: { overall: 0, specific: {} },
          modelInfo: {
            model: "emergency_timeout_fallback",
            usedFallback: true,
            ocrExtracted: false
          }
        };
      }
      
      // One final log of the actual timeout response object being sent
      console.log(`💥 [FINAL TIMEOUT RESPONSE SENT TO CLIENT]`, JSON.stringify({
        success: timeoutResponse.success,
        has_result: !!timeoutResponse.result,
        result_description: !!timeoutResponse.result?.description,
        result_description_type: typeof timeoutResponse.result?.description,
        result_nutrients_count: timeoutResponse.result?.nutrients?.length || 0,
        result_feedback_count: timeoutResponse.result?.feedback?.length || 0,
        result_suggestions_count: timeoutResponse.result?.suggestions?.length || 0
      }, null, 2));
      
      // Final validation before returning the timeout response
      if (
        !timeoutResponse.result?.description ||
        !Array.isArray(timeoutResponse.result?.nutrients) ||
        timeoutResponse.result.nutrients.length === 0
      ) {
        console.warn(`[${requestId}] 💥 Final fallback triggered before timeout response`);
        timeoutResponse.result = {
          description: "Could not analyze this meal.",
          nutrients: [{ name: "Calories", value: 0, unit: "kcal", isHighlight: true }],
          feedback: ["Unable to analyze meal content."],
          suggestions: ["Try uploading a clearer image."],
          detailedIngredients: [],
          goalScore: { overall: 0, specific: {} },
          fallback: true,
          lowConfidence: true,
          source: "error_fallback"
        };
      }
      
      resolve(NextResponse.json(timeoutResponse));
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
        
        // Clear the timeout since we're returning early
        if (globalTimeoutId) clearTimeout(globalTimeoutId);
        
        // Final validation to enforce required fields exist
        if (
          !validCachedResult?.description ||
          !Array.isArray(validCachedResult?.nutrients) ||
          validCachedResult.nutrients.length === 0 ||
          !Array.isArray(validCachedResult?.feedback) ||
          !Array.isArray(validCachedResult?.suggestions) ||
          !Array.isArray(validCachedResult?.detailedIngredients)
        ) {
          console.warn(`[${requestId}] 💥 Final fallback triggered before cached response`);
          validCachedResult = createUniversalErrorFallback("cached-result-validation-failure");
        }
        
        // Log a debug message with the validated structure
        console.log(`[${requestId}] Validated cached result:`, {
          has_description: !!validCachedResult.description,
          nutrients_length: validCachedResult.nutrients?.length,
          feedback_length: validCachedResult.feedback?.length,
          suggestions_length: validCachedResult.suggestions?.length,
          detailedIngredients_length: validCachedResult.detailedIngredients?.length,
          has_goalScore: !!validCachedResult.goalScore
        });
        
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
          // Try to save the meal to Firestore (with a 5-second timeout)
          const savePromise = saveMealToFirestore(userId, imageBase64, validatedResult);
          const saveTimeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('SAVE_TIMEOUT')), 5000);
          });
          
          savedMealId = await Promise.race([savePromise, saveTimeoutPromise]);
          console.log(`[analyzeImage] Saved meal to Firestore with ID: ${savedMealId}`);
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
          !response.result.description || 
          !Array.isArray(response.result.nutrients) || 
          response.result.nutrients.length === 0) {
        console.warn(`[${requestId}] Invalid response structure detected, applying universal fallback`);
        response.result = createUniversalErrorFallback("final-validation-fix-main-success");
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
      
      const errorResponse: AnalysisResponse = {
        success: false,
        fallback: true,
        requestId,
        message: errorMessage,
        imageUrl: null,
        elapsedTime: Date.now() - startTime,
        result: createUniversalErrorFallback("catch-block-server-error"),
        error: errorMessage,
        diagnostics
      };
      
      // Add final validation right before returning the errorResponse
      console.log(`[${requestId}] Final error response validation to ensure valid structure`);
      
      // Validate the result structure 
      if (!errorResponse.result || 
          !errorResponse.result.description || 
          !Array.isArray(errorResponse.result.nutrients) || 
          errorResponse.result.nutrients.length === 0) {
        console.warn(`[${requestId}] Invalid error response structure detected, applying universal fallback`);
        errorResponse.result = createUniversalErrorFallback("final-validation-fix-error-response");
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
      
      // Final validation to enforce required fields exist
      if (
        !errorResponse.result?.description ||
        !Array.isArray(errorResponse.result?.nutrients) ||
        errorResponse.result.nutrients.length === 0
      ) {
        console.warn(`[${requestId}] 💥 Final fallback triggered before error response`);
        errorResponse.result = {
          description: "Could not analyze this meal.",
          nutrients: [{ name: "Calories", value: 0, unit: "kcal", isHighlight: true }],
          feedback: ["Unable to analyze meal content."],
          suggestions: ["Try uploading a clearer image."],
          detailedIngredients: [],
          goalScore: { overall: 0, specific: {} },
          fallback: true,
          lowConfidence: true,
          source: "error_fallback"
        };
      }
      
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

// First, add an additional validation function:
/**
 * Ensures critical fields are present in the analysis result
 * This is the last line of defense before storage
 */
function ensureCriticalFields(result: any): any {
  if (!result) {
    console.error('Analysis result is null or undefined, returning emergency fallback');
    return createUniversalErrorFallback("null-result-before-save");
  }
  
  // Create a copy to avoid mutating the original
  const validResult = { ...result };
  
  // Absolutely ensure description exists
  if (!validResult.description || typeof validResult.description !== 'string' || validResult.description.trim() === '') {
    console.error('CRITICAL: Missing description in analysis result before save, fixing...');
    validResult.description = "Could not analyze this meal properly.";
  }
  
  // Absolutely ensure nutrients exists as a non-empty array
  if (!Array.isArray(validResult.nutrients) || validResult.nutrients.length === 0) {
    console.error('CRITICAL: Missing nutrients array in analysis result before save, fixing...');
    validResult.nutrients = [
      { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
      { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
      { name: 'Carbohydrates', value: 0, unit: 'g', isHighlight: true },
      { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
    ];
  }
  
  // Ensure each nutrient has the required properties
  if (Array.isArray(validResult.nutrients)) {
    for (let i = 0; i < validResult.nutrients.length; i++) {
      const nutrient = validResult.nutrients[i];
      if (!nutrient || typeof nutrient !== 'object') {
        console.error(`CRITICAL: Invalid nutrient at index ${i}, fixing...`);
        validResult.nutrients[i] = { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true };
        continue;
      }
      
      if (!nutrient.name) {
        console.error(`CRITICAL: Missing name for nutrient at index ${i}, fixing...`);
        nutrient.name = `Nutrient ${i + 1}`;
      }
      
      if (nutrient.value === undefined) {
        console.error(`CRITICAL: Missing value for nutrient at index ${i}, fixing...`);
        nutrient.value = 0;
      }
      
      if (!nutrient.unit) {
        console.error(`CRITICAL: Missing unit for nutrient at index ${i}, fixing...`);
        nutrient.unit = 'g';
      }
      
      if (nutrient.isHighlight === undefined) {
        nutrient.isHighlight = false;
      }
    }
  }
  
  // Ensure feedback exists as an array
  if (!Array.isArray(validResult.feedback) || validResult.feedback.length === 0) {
    console.error('CRITICAL: Missing feedback in analysis result before save, fixing...');
    validResult.feedback = ["Unable to analyze the image."];
  }
  
  // Ensure suggestions exists as an array
  if (!Array.isArray(validResult.suggestions) || validResult.suggestions.length === 0) {
    console.error('CRITICAL: Missing suggestions in analysis result before save, fixing...');
    validResult.suggestions = ["Try a clearer photo with more lighting."];
  }
  
  // Ensure detailedIngredients exists as an array
  if (!Array.isArray(validResult.detailedIngredients)) {
    console.error('CRITICAL: Missing detailedIngredients in analysis result before save, fixing...');
    validResult.detailedIngredients = [];
  }
  
  // Ensure goalScore exists
  if (!validResult.goalScore || typeof validResult.goalScore !== 'object') {
    console.error('CRITICAL: Missing goalScore in analysis result before save, fixing...');
    validResult.goalScore = { overall: 0, specific: {} };
  }
  
  // Log the final structure for debugging
  console.log('Final validated structure before save:', {
    has_description: !!validResult.description,
    description_length: validResult.description?.length || 0,
    nutrients_count: validResult.nutrients?.length || 0,
    feedback_count: validResult.feedback?.length || 0,
    suggestions_count: validResult.suggestions?.length || 0
  });
  
  return validResult;
}

// Now find the code where meals are saved and add the validation
// Look for trySaveMealServer or saveMealToFirestore function calls
// Add this before the save:

// For example, find code like:
if (userId) {
  try {
    console.log(`[analyzeImage] Saving analysis to Firestore for user ${userId}`);
    
    // Add validation right before the save
    if (result) {
      const validatedResultForSave = ensureCriticalFields(result);
      
      // Save with a timeout to prevent blocking
      const savePromise = trySaveMealServer({
        userId,
        imageUrl,
        analysis: validatedResultForSave, // Use the validated result
        requestId
      });
      
      // Rest of the save code...
    }
    
    // ... existing code ...
  } catch (error) {
    // ... existing code ...
  }
}