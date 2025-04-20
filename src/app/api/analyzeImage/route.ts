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
 * Creates a fallback response when analysis fails
 * @param message Message indicating why the fallback was triggered
 * @param error Error object or message
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
    description: "Could not analyze this meal properly.",
    nutrients: [
      { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
      { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
      { name: 'Carbs', value: 0, unit: 'g', isHighlight: true },
      { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
    ],
    feedback: ["Unable to analyze the image."],
    suggestions: ["Try a clearer photo with more lighting."],
    detailedIngredients: [],
    goalScore: { 
      overall: 5, 
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
  if (!fallbackResponse.description) fallbackResponse.description = "Could not analyze this meal properly.";
  if (!Array.isArray(fallbackResponse.nutrients) || fallbackResponse.nutrients.length === 0) {
    fallbackResponse.nutrients = [
      { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true }
    ];
  }
  if (!Array.isArray(fallbackResponse.feedback) || fallbackResponse.feedback.length === 0) {
    fallbackResponse.feedback = ["Unable to analyze the image."];
  }
  if (!Array.isArray(fallbackResponse.suggestions) || fallbackResponse.suggestions.length === 0) {
    fallbackResponse.suggestions = ["Try a clearer photo with more lighting."];
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
 * Fetch nutrition data with caching and fallback
 * @param text OCR text to analyze
 * @param requestId Request identifier for tracking
 * @returns Nutrition data from either Nutritionix or GPT fallback
 */
async function fetchNutrition(
  text: string,
  requestId: string
): Promise<NutritionData> {
  console.log(`[${requestId}] fetchNutrition: Starting. Text: ${text}`);
  
  try {
    // First, check if Nutritionix API keys are set
    const hasNutritionixApiId = !!process.env.NUTRITIONIX_APP_ID;
    const hasNutritionixApiKey = !!process.env.NUTRITIONIX_API_KEY;
    
    const useNutritionix = hasNutritionixApiId && hasNutritionixApiKey;
    
    if (!useNutritionix) {
      console.log(`[${requestId}] fetchNutrition: Nutritionix credentials not found, using GPT fallback`);
      const gptFallback = await callGptNutritionFallback(text, requestId);
      return gptFallback;
    }
    
    try {
      console.log(`[${requestId}] fetchNutrition: Trying Nutritionix API`);
      const startTime = Date.now();
      
      // Call the Nutritionix API
      const nutritionixData = await getNutritionData(text, requestId);
      
      if (nutritionixData.success && nutritionixData.data) {
        console.log(`[${requestId}] fetchNutrition: Nutritionix success in ${Date.now() - startTime}ms`);
        return nutritionixData.data;
      } else {
        throw new Error(nutritionixData.error || 'Nutritionix returned unsuccessful response');
      }
    } catch (error) {
      console.warn(`[${requestId}] fetchNutrition: Nutritionix failed: ${error}. Using GPT fallback`);
      
      // If Nutritionix fails, fall back to GPT
      const gptFallback = await callGptNutritionFallback(text, requestId);
      return gptFallback;
    }
  } catch (error) {
    console.error(`[${requestId}] fetchNutrition: Both sources failed: ${error}`);
    
    // Create a fallback response when both Nutritionix and GPT fail
    // This must match the NutritionData interface exactly
    const fallbackNutritionData: NutritionData = {
      nutrients: [
        { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
        { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
        { name: 'Carbs', value: 0, unit: 'g', isHighlight: true },
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
          overall: 5,
          specific: {} as Record<string, number>
        },
        fallback: true,
        error: "Both Nutritionix and GPT fallback failed"
      },
      source: "error_fallback"
    };
    
    // Debug log the structure
    console.log(`✅ [Returning emergency nutrition fallback]`, {
      nutrients_count: fallbackNutritionData.nutrients.length,
      foods_count: fallbackNutritionData.foods.length,
      has_description: !!fallbackNutritionData.raw?.description,
      has_feedback: Array.isArray(fallbackNutritionData.raw?.feedback),
      has_suggestions: Array.isArray(fallbackNutritionData.raw?.suggestions),
      source: fallbackNutritionData.source
    });
    
    return fallbackNutritionData;
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
          timeoutResponse.result = createFallbackResponse("Missing result object in timeout response", "Timeout error", requestId);
        } else {
          timeoutResponse.result.description = "Could not analyze this meal properly.";
        }
      }
      
      // Double-check nutrients array
      if (!Array.isArray(timeoutResponse.result.nutrients) || timeoutResponse.result.nutrients.length === 0) {
        console.error(`[analyzeImage] CRITICAL: Timeout response missing nutrients, fixing...`);
        timeoutResponse.result.nutrients = [
          { name: "Calories", value: 0, unit: "kcal", isHighlight: true },
          { name: "Protein", value: 0, unit: "g", isHighlight: true },
          { name: "Carbohydrates", value: 0, unit: "g", isHighlight: true },
          { name: "Fat", value: 0, unit: "g", isHighlight: true }
        ];
      }
      
      console.log("🚨 [TIMEOUT RESULT RETURNED TO FRONTEND]", {
        success: timeoutResponse.success,
        has_result: !!timeoutResponse.result,
        result_description: timeoutResponse.result?.description?.substring(0, 30),
        result_nutrients_count: timeoutResponse.result?.nutrients?.length || 0
      });
      
      // Final validation check for timeout response
      console.log("Final timeout result:", timeoutResponse.result);
      if (!timeoutResponse.result || !timeoutResponse.result.description || !Array.isArray(timeoutResponse.result.nutrients)) {
        console.warn(`[${requestId}] CRITICAL: Timeout response still has invalid structure, applying emergency fallback`);
        timeoutResponse.result = {
          description: "Could not analyze this meal properly.",
          nutrients: [{ name: "Calories", value: 0, unit: "kcal", isHighlight: true }],
          feedback: ["Analysis timed out."],
          suggestions: ["Try again with a clearer image."],
          detailedIngredients: [],
          source: "timeout_error_fallback",
          fallback: true,
          lowConfidence: true,
          goalScore: { overall: 0, specific: {} },
          modelInfo: {
            model: "emergency_timeout_fallback",
            usedFallback: true,
            ocrExtracted: false
          }
        };
        console.log("💥 [EMERGENCY FALLBACK APPLIED TO TIMEOUT]", {
          description: timeoutResponse.result.description,
          nutrients_count: timeoutResponse.result.nutrients.length
        });
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
      const response = {
        success: true,
        fallback: (nutritionData as any).source !== 'nutritionix',
        requestId,
        message: "Analysis completed successfully" + (ocrResult.error ? " (with text extraction fallback)" : ""),
        result: validatedResult,
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
      
      // Debug the FINAL API response being returned to client
      console.log("🚨 [ANALYSIS RESULT RETURNED TO FRONTEND]", {
        success: response.success,
        has_result: !!response.result,
        result_description: response.result?.description?.substring(0, 30),
        result_nutrients_count: response.result?.nutrients?.length || 0,
        result_feedback_count: response.result?.feedback?.length || 0,
        result_suggestions_count: response.result?.suggestions?.length || 0
      });
      
      // Final validation before returning to ensure a valid structure
      console.log("Final result:", response.result);
      if (!response.result || !response.result.description || !Array.isArray(response.result.nutrients)) {
        console.warn(`[${requestId}] CRITICAL: Response still has invalid structure at return point, applying emergency fallback`);
        response.result = {
          description: "Could not analyze this meal properly.",
          nutrients: [{ name: "Calories", value: 0, unit: "kcal", isHighlight: true }],
          feedback: ["Unable to analyze the image."],
          suggestions: ["Try a clearer photo with better lighting."],
          detailedIngredients: [],
          source: "error_fallback",
          fallback: true,
          lowConfidence: true,
          goalScore: { overall: 0, specific: {} },
          modelInfo: {
            model: "emergency_fallback",
            usedFallback: true,
            ocrExtracted: false
          }
        };
        response.fallback = true;
        response.message = "Analysis completed with emergency fallback";
        console.log("💥 [EMERGENCY FALLBACK APPLIED]", {
          description: response.result.description,
          nutrients_count: response.result.nutrients.length
        });
      }
      
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
        error as Error || "Unknown error", 
        requestId
      );
      
      // Calculate elapsed time for metrics
      const elapsedMs = Date.now() - startTime;
      console.log(`[${requestId}] Request failed in ${elapsedMs}ms`);
      
      // Create the error response
      const errorResponse = {
        success: false,
        message: errorMessage,
        result: fallbackResult,
        diagnostics: diagnostics.diagnostics
      };
      
      // Final validation check for error response
      console.log("Final error result:", errorResponse.result);
      if (!errorResponse.result || !errorResponse.result.description || !Array.isArray(errorResponse.result.nutrients)) {
        console.warn(`[${requestId}] CRITICAL: Error response has invalid structure, applying emergency fallback`);
        errorResponse.result = {
          description: "Could not analyze this meal properly.",
          nutrients: [{ name: "Calories", value: 0, unit: "kcal", isHighlight: true }],
          feedback: ["Unable to analyze the image."],
          suggestions: ["Try a clearer photo with better lighting."],
          detailedIngredients: [],
          source: "error_fallback",
          fallback: true,
          lowConfidence: true,
          goalScore: { overall: 0, specific: {} },
          modelInfo: {
            model: "emergency_fallback",
            usedFallback: true,
            ocrExtracted: false
          }
        };
        console.log("💥 [EMERGENCY FALLBACK APPLIED TO ERROR RESPONSE]", {
          description: errorResponse.result.description,
          nutrients_count: errorResponse.result.nutrients.length
        });
      }
      
      return NextResponse.json(errorResponse);
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