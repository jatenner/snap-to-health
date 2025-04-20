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
}

// Mock implementation for backward compatibility during migration
function createFallbackResponse(reason: string, partialResult: any, reqId: string = 'unknown'): any {
  console.log(`[${reqId}] Creating fallback response due to: ${reason}`);
  
  // Always include these fields to ensure frontend compatibility
  const fallbackResponse = {
    description: "Could not analyze this meal properly.",
    nutrients: [
      { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
      { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
      { name: 'Carbohydrates', value: 0, unit: 'g', isHighlight: true },
      { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
    ],
    feedback: ["Unable to analyze the image."],
    suggestions: ["Try a clearer photo with more lighting."],
    detailedIngredients: [],
    goalScore: {
      overall: 0,
      specific: {} as Record<string, number>,
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
  
  // Ensure the response structure is valid
  const validatedResponse = ensureValidResponseStructure(fallbackResponse);
  
  // Debug log the fallback structure
  console.log(`[${reqId}] FALLBACK_RESPONSE_STRUCTURE:`, JSON.stringify({
    has_description: Boolean(validatedResponse.description),
    description_type: typeof validatedResponse.description,
    has_nutrients: Array.isArray(validatedResponse.nutrients) && validatedResponse.nutrients.length > 0,
    nutrients_length: validatedResponse.nutrients?.length || 0,
    has_feedback: Array.isArray(validatedResponse.feedback) && validatedResponse.feedback.length > 0,
    has_suggestions: Array.isArray(validatedResponse.suggestions) && validatedResponse.suggestions.length > 0,
    has_detailedIngredients: Array.isArray(validatedResponse.detailedIngredients)
  }));
  
  // Debug the FINAL structure being returned
  console.log("FINAL FALLBACK", validatedResponse);
  
  return validatedResponse;
}

// Function to create an MD5 hash
function createMD5Hash(data: string): string {
  return crypto.createHash('md5').update(data).digest('hex');
}

/**
 * Fetch nutrition data with caching and fallback
 * @param text OCR text to analyze
 * @param requestId Request identifier for tracking
 * @returns Nutrition data from either Nutritionix or GPT fallback
 */
async function fetchNutrition(text: string, requestId: string): Promise<NutritionData> {
  console.log(`[analyzeImage] OCR text: ${text}`);
  const startTime = Date.now();
  
  // Create a cache key from the text
  const key = text.trim().toLowerCase();
  
  // Check cache first
  if (cache.has(key)) {
    const cachedData = cache.get<NutritionData>(key);
    console.log(`[analyzeImage] Using cached nutrition data for text (cached ${Date.now() - (cache.getTtl(key) || 0) - startTime}ms ago)`);
    
    // Debug log the cached data structure
    console.log(`[NUTRITION_DEBUG] Cached data structure:`, JSON.stringify({
      has_nutrients: Array.isArray(cachedData?.nutrients) && cachedData?.nutrients.length > 0,
      has_foods: Array.isArray(cachedData?.foods) && cachedData?.foods.length > 0,
      has_raw: Boolean(cachedData?.raw),
      has_raw_description: Boolean(cachedData?.raw?.description),
      nutrients_length: cachedData?.nutrients?.length || 0,
      foods_length: cachedData?.foods?.length || 0,
      source: (cachedData as any)?.source
    }));
    
    return cachedData!;
  }
  
  // Set timeout values
  const NUTRITIONIX_TIMEOUT_MS = 7000; // 7 seconds timeout for Nutritionix
  const GPT_TIMEOUT_MS = 10000; // 10 seconds timeout for GPT

  // Set up Nutritionix promise with explicit timeout
  const nutritionixPromise = getNutritionData(text, requestId)
    .then(result => {
      if (!result.success || !result.data) {
        throw new Error('NUTRITIONIX_FAILED');
      }
      console.log(`[analyzeImage] Successfully fetched data from Nutritionix API in ${Date.now() - startTime}ms`);
      // Add source tag to identify which provider we used
      return { ...result.data, source: 'nutritionix' };
    })
    .catch(err => {
      // Handle various error types
      if (err.response) {
        // Server responded with error status code
        const status = err.response.status;
        console.error(`[analyzeImage] Nutritionix API failed with status ${status}: ${err.response.data?.message || 'No message'}`);
        if ([400, 401, 403, 429, 500, 502, 503, 504].includes(status)) {
          throw new Error(`NUTRITIONIX_FAILED_${status}`);
        }
      } else if (err.request) {
        // Request made but no response received (timeout, network error)
        console.error(`[analyzeImage] Nutritionix API request failed (no response): ${err.message}`);
        throw new Error('NUTRITIONIX_NETWORK_ERROR');
      } else if (err.message === 'NUTRITIONIX_FAILED') {
        // Our own error from above
        throw err;
      } else if (err.message.includes('timeout')) {
        // Explicit timeout handling
        console.error(`[analyzeImage] Nutritionix API timed out after ${NUTRITIONIX_TIMEOUT_MS}ms`);
        throw new Error('NUTRITIONIX_TIMEOUT');
      } else {
        // Other errors
        console.error(`[analyzeImage] Nutritionix API unexpected error: ${err.message}`);
        throw new Error('NUTRITIONIX_UNEXPECTED_ERROR');
      }
      throw err; // Propagate other errors
    });
  
  // GPT fallback promise with explicit timeout
  const gptPromise = async () => {
    try {
      // Apply timeout control for GPT fallback
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), GPT_TIMEOUT_MS);
      
      // Call GPT fallback with abort signal
      const result = await Promise.race([
        callGptNutritionFallback(text, requestId),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('GPT_TIMEOUT')), GPT_TIMEOUT_MS)
        )
      ]);
      
      clearTimeout(timeoutId);
      console.log(`[analyzeImage] Successfully fetched data from GPT fallback in ${Date.now() - startTime}ms`);
      return result;
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message === 'GPT_TIMEOUT') {
        console.error(`[analyzeImage] GPT fallback timed out after ${GPT_TIMEOUT_MS}ms`);
        throw new Error('GPT_TIMEOUT');
      }
      console.error(`[analyzeImage] GPT fallback failed: ${error.message}`);
      throw error;
    }
  };
  
  let result: NutritionData;
  let source = 'unknown';
  
  try {
    // Create a timeout promise for Nutritionix
    const nutritionixTimeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('NUTRITIONIX_TIMEOUT')), NUTRITIONIX_TIMEOUT_MS);
    });
    
    try {
      // Race Nutritionix against timeout
      result = await Promise.race([nutritionixPromise, nutritionixTimeoutPromise]);
      source = 'nutritionix';
      console.log(`[analyzeImage] Successfully used Nutritionix API data in ${Date.now() - startTime}ms`);
      
      // Debug log the nutritionix result structure
      console.log(`[NUTRITION_DEBUG] Nutritionix result structure:`, JSON.stringify({
        has_nutrients: Array.isArray(result?.nutrients) && result?.nutrients.length > 0,
        has_foods: Array.isArray(result?.foods) && result?.foods.length > 0,
        has_raw: Boolean(result?.raw),
        has_raw_description: Boolean(result?.raw?.description),
        nutrients_length: result?.nutrients?.length || 0,
        foods_length: result?.foods?.length || 0
      }));
    } catch (nutritionixError: any) {
      // If Nutritionix fails or times out, use GPT immediately
      console.log(`[analyzeImage] Nutritionix failed (${nutritionixError.message}), falling back to GPT`);
      result = await gptPromise();
      source = 'gpt';
      console.log(`[analyzeImage] Successfully used GPT fallback data in ${Date.now() - startTime}ms`);
      
      // Debug log the GPT fallback result structure
      console.log(`[NUTRITION_DEBUG] GPT fallback result structure:`, JSON.stringify({
        has_nutrients: Array.isArray(result?.nutrients) && result?.nutrients.length > 0,
        has_foods: Array.isArray(result?.foods) && result?.foods.length > 0,
        has_raw: Boolean(result?.raw),
        has_raw_description: Boolean(result?.raw?.description),
        nutrients_length: result?.nutrients?.length || 0,
        foods_length: result?.foods?.length || 0
      }));
    }
  } catch (e: any) {
    // Both Nutritionix and GPT failed
    console.error(`[analyzeImage] All nutrition data sources failed: ${e.message}`);
    
    // Create a mock food item to ensure frontend compatibility
    const mockFood: NutritionixFood = {
      food_name: "Unknown meal",
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
    };
    
    // Create minimal data structure with all required fields to avoid breaking code
    result = {
      nutrients: [
        { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
        { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
        { name: 'Carbohydrates', value: 0, unit: 'g', isHighlight: true },
        { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
      ],
      foods: [mockFood],
      raw: { 
        description: "Unable to analyze this meal. Please try again.",
        feedback: ["We couldn't analyze your meal properly. Try again with a clearer photo."],
        suggestions: ["Make sure your meal is clearly visible in the image."],
        goalScore: { overall: 0, specific: {} },
        error: e.message,
        fallback: true
      }
    };
    source = 'error_fallback';
    
    // Debug log the error fallback result structure
    console.log(`[NUTRITION_DEBUG] Error fallback result structure:`, JSON.stringify({
      has_nutrients: Array.isArray(result?.nutrients) && result?.nutrients.length > 0,
      has_foods: Array.isArray(result?.foods) && result?.foods.length > 0,
      has_raw: Boolean(result?.raw),
      has_raw_description: Boolean(result?.raw?.description),
      nutrients_length: result?.nutrients?.length || 0,
      foods_length: result?.foods?.length || 0
    }));
  }
  
  // Add source property to track which provider was used
  (result as any).source = source;
  
  // Cache the result regardless of source
  cache.set(key, result);
  console.log(`[analyzeImage] Cached nutrition data from ${source} (TTL: 1 hour)`);
  
  // Final check to ensure result has all required fields
  if (!result.nutrients || !Array.isArray(result.nutrients) || result.nutrients.length === 0) {
    console.warn(`[analyzeImage] WARNING: Nutrition data has missing or empty nutrients array, adding defaults`);
    result.nutrients = [
      { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
      { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
      { name: 'Carbohydrates', value: 0, unit: 'g', isHighlight: true },
      { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
    ];
  }
  
  if (!result.foods || !Array.isArray(result.foods) || result.foods.length === 0) {
    console.warn(`[analyzeImage] WARNING: Nutrition data has missing or empty foods array, adding default food`);
    result.foods = [{
      food_name: "Unknown meal",
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
  }
  
  if (!result.raw || !result.raw.description) {
    console.warn(`[analyzeImage] WARNING: Nutrition data has missing raw.description, adding default`);
    result.raw = result.raw || {};
    result.raw.description = "Unable to analyze this meal. Please try again.";
  }
  
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
      console.log("FINAL TIMEOUT FALLBACK", fallbackResult);
      
      const timeoutResponse = {
        success: false,
        fallback: true,
        message: "Meal analysis timed out or failed. Please try again.",
        requestId,
        error: "Global timeout reached",
        result: fallbackResult,
        elapsedTime: Date.now() - startTime
      };
      
      // Final sanity check to ensure required fields are present in timeout response
      if (!timeoutResponse.result || !timeoutResponse.result.description || typeof timeoutResponse.result.description !== 'string') {
        console.error(`[analyzeImage] CRITICAL: Timeout response missing description, fixing...`);
        if (!timeoutResponse.result) {
          timeoutResponse.result = createFallbackResponse("Missing result object in timeout response", null, requestId);
        } else {
          timeoutResponse.result.description = "Could not analyze this meal properly.";
        }
      }
      
      if (!timeoutResponse.result || !Array.isArray(timeoutResponse.result.nutrients) || timeoutResponse.result.nutrients.length === 0) {
        console.error(`[analyzeImage] CRITICAL: Timeout response missing nutrients, fixing...`);
        if (!timeoutResponse.result) {
          timeoutResponse.result = createFallbackResponse("Missing result object in timeout response", null, requestId);
        } else {
          timeoutResponse.result.nutrients = [
            { name: "Calories", value: 0, unit: "kcal", isHighlight: true },
            { name: "Protein", value: 0, unit: "g", isHighlight: true },
            { name: "Carbohydrates", value: 0, unit: "g", isHighlight: true },
            { name: "Fat", value: 0, unit: "g", isHighlight: true }
          ];
        }
      }
      
      // Debug the FINAL TIMEOUT API response being returned to client
      console.log("FINAL TIMEOUT API RESPONSE", timeoutResponse);
      
      // Debug log the timeout response structure
      console.log(`[TIMEOUT_RESPONSE_DEBUG] Timeout response structure:`, JSON.stringify({
        success: timeoutResponse.success,
        result_present: Boolean(timeoutResponse.result),
        result_description_present: Boolean(timeoutResponse.result?.description),
        result_nutrients_present: Array.isArray(timeoutResponse.result?.nutrients) && timeoutResponse.result?.nutrients.length > 0,
        result_feedback_present: Array.isArray(timeoutResponse.result?.feedback) && timeoutResponse.result?.feedback.length > 0,
        result_suggestions_present: Array.isArray(timeoutResponse.result?.suggestions) && timeoutResponse.result?.suggestions.length > 0
      }));
      
      resolve(NextResponse.json(timeoutResponse, { status: 408 }));
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
        
        // Validate the cached result to ensure it has the required fields
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
        
        // Clear the timeout since we're returning early
        if (globalTimeoutId) clearTimeout(globalTimeoutId);
        
        return NextResponse.json({ 
          success: true, 
          data: validCachedResult,
          cached: true,
          elapsedTime: Date.now() - startTime,
          requestId
        });
      }
      
      console.log(`[analyzeImage] Cache miss for ${cacheKey}, processing...`);
      
      // Extract text from image with OCR (with 10-second timeout)
      console.log('[analyzeImage] Running OCR to extract text from image');
      let ocrResult;
      try {
        const OCR_TIMEOUT_MS = 5000; // 5 seconds for OCR
        const ocrPromise = runOCR(imageBase64, requestId);
        const ocrTimeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('OCR_TIMEOUT')), OCR_TIMEOUT_MS);
        });
        
        ocrResult = await Promise.race([ocrPromise, ocrTimeoutPromise]);
      } catch (ocrError) {
        console.error(`[analyzeImage] OCR failed or timed out:`, ocrError);
        // If OCR fails, create a generic food description for analysis
        ocrResult = {
          success: true,
          text: "A meal with protein, vegetables, and carbohydrates.",
          confidence: 0.5,
          processingTimeMs: 0,
          error: ocrError instanceof Error ? ocrError.message : 'Unknown OCR error'
        };
      }
      
      const extractedText = ocrResult.text;
      console.log(`[analyzeImage] OCR extracted text: "${extractedText.substring(0, 100)}${extractedText.length > 100 ? '...' : ''}"`);
      
      // Fetch nutrition data with integrated fallback
      const nutritionData = await fetchNutrition(extractedText, requestId);
      console.log(`[analyzeImage] using path: ${(nutritionData as any).source || 'unknown'}`);
      
      // Create analysis from the nutrition data
      const analysis = createNutrientAnalysis(
        nutritionData.nutrients, 
        [healthGoal], 
        requestId
      );
      
      // Create the final analysis result
      const analysisResult: AnalysisResult = {
        description: nutritionData.raw?.description || 
          `This meal contains ${extractedText}. It provides approximately ${Math.round(nutritionData.nutrients.find(n => n.name === 'calories')?.value as number || 0)} calories.`,
        nutrients: nutritionData.nutrients,
        feedback: analysis.feedback,
        suggestions: analysis.suggestions,
        detailedIngredients: nutritionData.foods.map(food => ({
          name: food.food_name,
          category: 'food',
          confidence: 0.8,
          confidenceEmoji: '✅'
        })),
        goalScore: analysis.goalScore,
        goalName: formatGoalName(healthGoal),
        modelInfo: {
          model: (nutritionData as any).source === 'gpt' ? GPT_MODEL : 'nutritionix',
          usedFallback: (nutritionData as any).source !== 'nutritionix',
          ocrExtracted: true
        }
      };
      
      // Debug log for analysis result structure
      console.log(`[ANALYSIS_DEBUG] Initial analysis result structure:`, JSON.stringify({
        has_description: Boolean(analysisResult.description),
        has_nutrients: Array.isArray(analysisResult.nutrients) && analysisResult.nutrients.length > 0,
        has_feedback: Array.isArray(analysisResult.feedback) && analysisResult.feedback.length > 0,
        has_suggestions: Array.isArray(analysisResult.suggestions) && analysisResult.suggestions.length > 0,
        has_detailedIngredients: Array.isArray(analysisResult.detailedIngredients) && analysisResult.detailedIngredients.length > 0,
        nutrients_length: analysisResult.nutrients?.length || 0,
        description_type: typeof analysisResult.description,
        raw_description: nutritionData.raw?.description ? 'present' : 'missing'
      }));
      
      // Validate the analysis result - ensure it has the required fields
      // Add fallbacks for any missing required fields to prevent storage errors
      if (!analysisResult.description || typeof analysisResult.description !== 'string') {
        console.warn(`[analyzeImage] Missing or invalid description in analysis result, using fallback`);
        analysisResult.description = "No description available. Please try again with a clearer image.";
      }
      
      if (!analysisResult.nutrients || !Array.isArray(analysisResult.nutrients) || analysisResult.nutrients.length === 0) {
        console.warn(`[analyzeImage] Missing or invalid nutrients in analysis result, using fallback`);
        analysisResult.nutrients = [
          { name: "Calories", value: 0, unit: "kcal", isHighlight: true },
          { name: "Protein", value: 0, unit: "g", isHighlight: true },
          { name: "Carbohydrates", value: 0, unit: "g", isHighlight: true },
          { name: "Fat", value: 0, unit: "g", isHighlight: true }
        ];
      }
      
      // Ensure feedback and suggestions exist
      if (!Array.isArray(analysisResult.feedback) || analysisResult.feedback.length === 0) {
        analysisResult.feedback = ["No specific feedback available for this meal."];
      }
      
      if (!Array.isArray(analysisResult.suggestions) || analysisResult.suggestions.length === 0) {
        analysisResult.suggestions = ["Try to include a variety of foods in your meals for balanced nutrition."];
      }
      
      // Debug log after validation
      console.log(`[ANALYSIS_DEBUG] Final validated analysis result structure:`, JSON.stringify({
        has_description: Boolean(analysisResult.description),
        has_nutrients: Array.isArray(analysisResult.nutrients) && analysisResult.nutrients.length > 0,
        has_feedback: Array.isArray(analysisResult.feedback) && analysisResult.feedback.length > 0,
        has_suggestions: Array.isArray(analysisResult.suggestions) && analysisResult.suggestions.length > 0,
        has_detailedIngredients: Array.isArray(analysisResult.detailedIngredients) && analysisResult.detailedIngredients.length > 0,
        nutrients_length: analysisResult.nutrients?.length || 0,
        description_type: typeof analysisResult.description
      }));
      
      // If userId is provided, save the analysis result to Firestore
      let savedMealId: string | null = null;
      if (userId && imageBase64) {
        try {
          // Try to save the meal to Firestore (with a 5-second timeout)
          const savePromise = saveMealToFirestore(userId, imageBase64, analysisResult);
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
        ...analysisResult,
        savedMealId
      });
      
      // Prepare the final response
      const elapsedTime = Date.now() - startTime;
      console.log(`[analyzeImage] Completed analysis in ${elapsedTime}ms using ${(nutritionData as any).source}`);
      
      // Clear the timeout since we're returning successfully
      if (globalTimeoutId) clearTimeout(globalTimeoutId);
      
      // Create the final response
      const response = {
        success: true,
        fallback: (nutritionData as any).source !== 'nutritionix',
        requestId,
        message: "Analysis completed successfully" + (ocrResult.error ? " (with text extraction fallback)" : ""),
        result: analysisResult,
        elapsedTime,
        savedMealId,
        error: null,
        diagnostics: {
          ocrConfidence: ocrResult.confidence,
          usedFallback: (nutritionData as any).source !== 'nutritionix',
          source: (nutritionData as any).source,
          textLength: extractedText.length,
          processingTimeMs: elapsedTime
        }
      };
      
      // Debug log the final response structure
      console.log(`[RESPONSE_DEBUG] Final response structure:`, JSON.stringify({
        success: response.success,
        result_present: Boolean(response.result),
        result_description_present: Boolean(response.result?.description),
        result_nutrients_present: Array.isArray(response.result?.nutrients) && response.result?.nutrients.length > 0,
        result_feedback_present: Array.isArray(response.result?.feedback) && response.result?.feedback.length > 0,
        result_suggestions_present: Array.isArray(response.result?.suggestions) && response.result?.suggestions.length > 0
      }));
      
      // Use our validation function to ensure the result structure is valid
      response.result = ensureValidResponseStructure(response.result);
      
      // Debug the FINAL API response being returned to client
      console.log("FINAL API RESPONSE", response);
      
      return NextResponse.json(response);
      
    } catch (error) {
      // Complete the diagnostics for error tracking
      const diagnostics = createAnalysisDiagnostics(requestId);
      diagnostics.complete(false);
      
      // Log the actual error for debugging
      console.error(`[${requestId}] Error processing image:`, error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        console.error(`[${requestId}] Error stack:`, error.stack);
      }
      
      // For timeout errors, create a more specific message
      const errorMessage = error instanceof Error && error.message.includes('timeout') 
        ? 'Analysis timed out. Please try again.'
        : 'There was an error analyzing your image.';
      
      // Create a consistent fallback response
      const fallbackResult = createFallbackResponse(
        `Error during analysis: ${errorMessage}`, 
        {}, 
        requestId
      );
      
      // Calculate elapsed time for metrics
      const elapsedMs = Date.now() - startTime;
      console.log(`[${requestId}] Request failed in ${elapsedMs}ms`);
      
      return NextResponse.json({
        success: false,
        message: errorMessage,
        result: fallbackResult,
        diagnostics: diagnostics.diagnostics
      });
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
  if (!result) {
    return createFallbackResponse("Missing result object", null, "structure_validation");
  }
  
  // Create a copy to avoid modifying original
  const validatedResult = { ...result };
  
  // Ensure description is valid
  if (!validatedResult.description || typeof validatedResult.description !== 'string') {
    validatedResult.description = "Could not analyze this meal properly.";
  }
  
  // Ensure nutrients is valid
  if (!Array.isArray(validatedResult.nutrients) || validatedResult.nutrients.length === 0) {
    validatedResult.nutrients = [
      { name: "Calories", value: 0, unit: "kcal", isHighlight: true },
      { name: "Protein", value: 0, unit: "g", isHighlight: true },
      { name: "Carbohydrates", value: 0, unit: "g", isHighlight: true },
      { name: "Fat", value: 0, unit: "g", isHighlight: true }
    ];
  }
  
  // Ensure feedback is valid
  if (!Array.isArray(validatedResult.feedback) || validatedResult.feedback.length === 0) {
    validatedResult.feedback = ["Unable to analyze the image."];
  }
  
  // Ensure suggestions is valid
  if (!Array.isArray(validatedResult.suggestions) || validatedResult.suggestions.length === 0) {
    validatedResult.suggestions = ["Try a clearer photo with more lighting."];
  }
  
  // Ensure detailedIngredients is valid
  if (!Array.isArray(validatedResult.detailedIngredients)) {
    validatedResult.detailedIngredients = [];
  }
  
  // Ensure goalScore is valid
  if (!validatedResult.goalScore || typeof validatedResult.goalScore !== 'object') {
    validatedResult.goalScore = { overall: 0, specific: {} };
  }
  
  // Set fallback flags
  validatedResult.lowConfidence = true;
  validatedResult.fallback = true;
  
  return validatedResult as AnalysisResult;
}