import { NextRequest, NextResponse } from 'next/server';
import NodeCache from 'node-cache'
import { OpenAI } from 'openai'
import axios from 'axios';
import crypto from 'crypto';
import { adminStorage } from '@/lib/firebaseAdmin';
import { trySaveMealServer } from '@/lib/serverMealUtils';
import { uploadImageToFirebase } from '@/lib/firebaseStorage';
import { extractBase64Image } from '@/lib/imageProcessing';
import { getNutritionData, createNutrientAnalysis, NutritionData } from '@/lib/nutritionixApi';
import { callGptNutritionFallback } from '@/lib/gptNutrition';
import { createEmptyFallbackAnalysis } from '@/lib/analyzeImageWithOCR';
import { runOCR, OCRResult } from '@/lib/runOCR';
import { analyzeMealTextOnly, MealAnalysisResult } from '@/lib/analyzeMealTextOnly';
import { API_CONFIG } from '@/lib/constants';
import { createAnalysisDiagnostics, checkOCRConfig, checkNutritionixCredentials } from '@/lib/diagnostics';

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
    nutrients: [],
    feedback: ["We couldn't process your image. Please try again with a clearer photo of your meal."],
    suggestions: ["Try taking the photo in better lighting", "Make sure your meal is clearly visible"],
    detailedIngredients: [],
    goalScore: {
      overall: 0,
      specific: {} as Record<string, number>,
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
  
  // Set up Nutritionix promise
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
      } else {
        // Other errors
        console.error(`[analyzeImage] Nutritionix API unexpected error: ${err.message}`);
        throw new Error('NUTRITIONIX_UNEXPECTED_ERROR');
      }
      throw err; // Propagate other errors
    });
  
  // GPT fallback promise
  const gptPromise = callGptNutritionFallback(text)
    .then(result => {
      console.log(`[analyzeImage] Successfully fetched data from GPT fallback in ${Date.now() - startTime}ms`);
      return result;
    })
    .catch(err => {
      console.error(`[analyzeImage] GPT fallback also failed: ${err.message}`);
      throw err;
    });
  
  let result: NutritionData;
  let source = 'unknown';
  
  try {
    // Try Nutritionix first with a 5-second timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('NUTRITIONIX_TIMEOUT')), 5000);
    });
    
    try {
      // Race Nutritionix against timeout
      result = await Promise.race([nutritionixPromise, timeoutPromise]);
      source = 'nutritionix';
    } catch (nutritionixError: any) {
      // If Nutritionix fails or times out, use GPT
      console.log(`[analyzeImage] Nutritionix failed (${nutritionixError.message}), falling back to GPT`);
      result = await gptPromise;
      source = 'gpt';
    }
    
    console.log(`[analyzeImage] Using nutrition data from: ${source}`);
  } catch (e: any) {
    // Both Nutritionix and GPT failed
    console.error(`[analyzeImage] All nutrition data sources failed: ${e.message}`);
    
    // Create minimal data structure to avoid breaking code
    result = {
      nutrients: [
        { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
        { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
        { name: 'Carbohydrates', value: 0, unit: 'g', isHighlight: true },
        { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
      ],
      foods: [],
      raw: { error: e.message }
    };
    source = 'error_fallback';
  }
  
  // Add source property if not already present
  if (!('source' in result)) {
    (result as any).source = source;
  }
  
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
  
  try {
    // Extract image and health goal from request
    let formData: FormData | null = null;
    let imageBase64: string = '';
    let healthGoal: string = 'general health';
    
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
      
      // Extract base64 from image file
      const imageFile = formData.get('image');
      if (imageFile instanceof File) {
        imageBase64 = await extractBase64Image(imageFile, requestId);
        console.log(`[analyzeImage] Extracted base64 image (${imageBase64.length} chars)`);
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
      return NextResponse.json({ 
        success: true, 
        data: cachedResult,
        cached: true
      });
    }
    
    console.log(`[analyzeImage] Cache miss for ${cacheKey}, processing...`);
    
    // Extract text from image with OCR
    console.log('[analyzeImage] Running OCR to extract text from image');
    const ocrResult = await runOCR(imageBase64, requestId);
    const extractedText = ocrResult.text;
    
    console.log(`[analyzeImage] OCR extracted text: "${extractedText.substring(0, 100)}${extractedText.length > 100 ? '...' : ''}"`);
    
    let result: any = null;
    
    try {
      // Try Nutritionix first
      console.log('[analyzeImage] calling Nutritionix');
      const nutritionixResult = await getNutritionData(extractedText, requestId);
      
      if (nutritionixResult.success && nutritionixResult.data) {
        console.log('[analyzeImage] Nutritionix success');
        result = {
          source: 'nutritionix',
          nutrients: nutritionixResult.data.nutrients,
          text: extractedText,
          healthGoal,
          requestId
        };
      } else {
        throw new Error('Nutritionix returned no data');
      }
    } catch (error: any) {
      // Nutritionix failed, fall back to GPT
      console.log(`[analyzeImage] Nutritionix failed, falling back to GPT: ${error.message}`);
      
      try {
        // Call GPT for nutrition analysis
        const prompt = `Provide nutritional analysis for this meal description: "${extractedText}". Return as JSON with fields: calories, protein, carbs, fat, fiber, sugar, sodium, and cholesterol. Also classify if this meal is good for a "${healthGoal}" health goal on a scale of 1-10.`;
        
        const gpt = await oai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.5,
          response_format: { type: 'json_object' }
        });
        
        console.log('[analyzeImage] GPT success');
        const gptContent = gpt.choices[0]?.message?.content || '{}';
        
        result = {
          source: 'gpt',
          gptResponse: JSON.parse(gptContent),
          text: extractedText,
          healthGoal,
          requestId
        };
      } catch (gptError: any) {
        throw new Error(`Both Nutritionix and GPT failed: ${error.message}, ${gptError.message}`);
      }
    }
    
    // Cache the result
    cache.set(cacheKey, result);
    console.log(`[analyzeImage] Cached result for ${cacheKey}`);
    
    console.log('[analyzeImage] returning SUCCESS');
    return NextResponse.json({
      success: true,
      data: result,
      cached: false
    });
    
  } catch (error) {
    console.error('[analyzeImage] ERROR:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId
    }, { status: 500 });
  }
}

// Original POST handler (commented out)
/* 
export async function POST(request: NextRequest): Promise<NextResponse> {
  // ... original implementation ...
}
*/

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