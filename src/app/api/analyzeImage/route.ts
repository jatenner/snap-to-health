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
}

// Mock implementation for backward compatibility during migration
function createFallbackResponse(reason: string, partialResult: any, reqId: string = 'unknown'): any {
  return {
    description: "Unable to analyze the image at this time.",
    nutrients: [
      { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
      { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
      { name: 'Carbohydrates', value: 0, unit: 'g', isHighlight: true },
      { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
    ],
    feedback: ["We couldn't process your image. Please try again with a clearer photo of your meal."],
    suggestions: ["Try taking the photo in better lighting", "Make sure your meal is clearly visible"],
    detailedIngredients: [
      { name: "Unknown", category: "food", confidence: 0, confidenceEmoji: "❓" }
    ],
    goalScore: {
      overall: 0,
      specific: {} as Record<string, number>,
    },
    modelInfo: {
      model: "error_fallback",
      usedFallback: true,
      ocrExtracted: false
    },
    metadata: {
      requestId: reqId,
      modelUsed: "text_extraction_fallback",
      usedFallbackModel: true,
      processingTime: 0,
      confidence: 0,
      error: reason,
      imageQuality: "unknown"
    }
  };
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
    } catch (nutritionixError: any) {
      // If Nutritionix fails or times out, use GPT immediately
      console.log(`[analyzeImage] Nutritionix failed (${nutritionixError.message}), falling back to GPT`);
      result = await gptPromise();
      source = 'gpt';
      console.log(`[analyzeImage] Successfully used GPT fallback data in ${Date.now() - startTime}ms`);
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
  }
  
  // Add source property to track which provider was used
  (result as any).source = source;
  
  // Cache the result regardless of source
  cache.set(key, result);
  console.log(`[analyzeImage] Cached nutrition data from ${source} (TTL: 1 hour)`);
  
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
        }
      };
      
      resolve(NextResponse.json({
        success: false,
        fallback: true,
        message: "Meal analysis timed out or failed. Please try again.",
        requestId,
        error: "Global timeout reached",
        result: fallbackResult,
        elapsedTime: Date.now() - startTime
      }, { status: 408 }));
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
      const imageHash = crypto.createHash('md5').update(imageBase64).digest('hex');
      const cacheKey = `${healthGoal}_${imageHash}`;
      
      // Check if we have a cached result
      if (cache.has(cacheKey)) {
        console.log(`[analyzeImage] Cache hit for ${cacheKey}`);
        const cachedResult = cache.get(cacheKey);
        
        // Clear the timeout since we're returning early
        if (globalTimeoutId) clearTimeout(globalTimeoutId);
        
        return NextResponse.json({ 
          success: true, 
          data: cachedResult,
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
      
      return NextResponse.json({
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
      });
      
    } catch (error: any) {
      // Log the error details
      console.error(`[analyzeImage] ERROR:`, error);
      
      // Calculate elapsed time
      const elapsedTime = Date.now() - startTime;
      
      // Clear the timeout since we're handling the error
      if (globalTimeoutId) clearTimeout(globalTimeoutId);
      
      // Create a minimal valid result structure even for error responses
      const fallbackResult: AnalysisResult = {
        description: "Unable to analyze this meal. Please try again with a clearer image.",
        nutrients: [
          { name: "Calories", value: 0, unit: "kcal", isHighlight: true },
          { name: "Protein", value: 0, unit: "g", isHighlight: true },
          { name: "Carbohydrates", value: 0, unit: "g", isHighlight: true },
          { name: "Fat", value: 0, unit: "g", isHighlight: true }
        ],
        feedback: ["We couldn't analyze this image properly."],
        suggestions: ["Try taking a clearer photo with good lighting."],
        detailedIngredients: [
          { name: "Unknown", category: "food", confidence: 0, confidenceEmoji: "❓" }
        ],
        goalScore: { overall: 0, specific: {} },
        modelInfo: {
          model: "error_fallback",
          usedFallback: true,
          ocrExtracted: false
        }
      };
      
      // Return structured error response
      return NextResponse.json({
        success: false,
        fallback: true,
        requestId,
        message: "Failed to analyze image: " + (error.message || "Unknown error"),
        result: fallbackResult,
        imageUrl: null,
        error: error.message || "Unknown error occurred during analysis",
        elapsedTime,
        diagnostics: {
          errorType: error.name || "Unknown",
          errorMessage: error.message || "No message",
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
          processingTimeMs: elapsedTime
        }
      }, { status: 500 });
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