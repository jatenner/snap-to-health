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
import { runOCR, OCRResult, runFoodDetection, detectFoodLabels } from '@/lib/runOCR';
import { analyzeMealTextOnly, MealAnalysisResult } from '@/lib/analyzeMealTextOnly';
import { API_CONFIG } from '@/lib/constants';
import { createAnalysisDiagnostics, checkOCRConfig, checkNutritionixCredentials } from '@/lib/diagnostics';
import { GPT_MODEL } from '@/lib/constants';
import { saveMealToFirestore } from '@/lib/mealUtils';
import { isValidAnalysis, normalizeAnalysisResult } from '@/lib/utils/analysisValidator';
import { containsFoodRelatedTerms, isNutritionLabel } from '@/lib/utils/foodDetection';

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

interface ExtendedNutritionData extends NutritionData {
  source: string;
  noFoodDetected?: boolean;
  _meta?: {
    ocrText?: string;
    foodTerms?: string[];
    isNutritionLabel?: boolean;
    foodConfidence?: number;
    debugTrace?: string;
  };
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
 * Fetch nutrition data from Nutritionix API with GPT fallback
 * Enhanced with food text validation to prevent hallucinated results
 */
async function fetchNutrition(
  text: string,
  requestId: string
): Promise<ExtendedNutritionData & { noFoodDetected?: boolean }> {
  console.log(`[${requestId}] fetchNutrition: Starting. Text: ${text.substring(0, 50)}...`);
  
  try {
    // First, check if the text contains enough food-related terms
    const foodTermCheck = containsFoodRelatedTerms(text);
    const isNutritionLabelText = isNutritionLabel(text);
    
    // Log food term detection results
    console.log(`[${requestId}] Food term detection: isValid=${foodTermCheck.isValid}, terms=${foodTermCheck.foodTermCount}, confidence=${foodTermCheck.confidence.toFixed(2)}`);
    console.log(`[${requestId}] Is nutrition label: ${isNutritionLabelText}`);
    
    // If it's a nutrition label or contains enough food terms, continue with processing
    if (foodTermCheck.isValid || isNutritionLabelText) {
      console.log(`[${requestId}] fetchNutrition: Trying Nutritionix API`);
      
      // Try Nutritionix API first
      const nutritionixData = await getNutritionData(text, requestId);
      
      if (nutritionixData.success && nutritionixData.data) {
        // Add meta debug info to track OCR text and food terms
        const enhancedData: ExtendedNutritionData = {
          ...nutritionixData.data,
          source: 'nutritionix',
          _meta: {
            ocrText: text,
            foodTerms: foodTermCheck.foodTerms,
            isNutritionLabel: isNutritionLabelText,
            foodConfidence: foodTermCheck.confidence,
            debugTrace: 'Used Nutritionix API successfully'
          }
        };
        
        return enhancedData;
      } else {
        console.warn(`[${requestId}] fetchNutrition: Nutritionix failed: ${nutritionixData.error}. Using GPT fallback`);
        
        // If Nutritionix fails, fall back to GPT only if we have valid food terms
        const gptFallback = await callGptNutritionFallback(text, requestId);
        
        // Add meta debug info
        const enhancedGptData = {
          ...gptFallback,
          _meta: {
            ocrText: text,
            foodTerms: foodTermCheck.foodTerms,
            isNutritionLabel: isNutritionLabelText,
            foodConfidence: foodTermCheck.confidence,
            debugTrace: 'Used GPT fallback after Nutritionix failure'
          }
        };
        
        // Validate GPT fallback data
        return validateNutritionData(enhancedGptData, requestId);
      }
    } else {
      // Not enough food-related terms detected, avoid hallucination
      console.warn(`[${requestId}] fetchNutrition: Text doesn't contain enough food terms. Skipping analysis.`);
      
      // Return a "no food detected" response instead of hallucinated results
      return {
        nutrients: [
          { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
          { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
          { name: 'Carbohydrates', value: 0, unit: 'g', isHighlight: true },
          { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
        ],
        foods: [],
        raw: {
          description: "No food detected in this image",
          feedback: ["We couldn't detect any food-related text in this image."],
          suggestions: ["Try uploading a photo that clearly shows food or contains food-related text."],
          goalScore: { overall: 0, specific: {} }
        },
        source: "no_food_detected",
        noFoodDetected: true,
        _meta: {
          ocrText: text,
          foodTerms: foodTermCheck.foodTerms, 
          isNutritionLabel: isNutritionLabelText,
          foodConfidence: foodTermCheck.confidence,
          debugTrace: 'No valid food terms detected in OCR text'
        }
      };
    }
  } catch (error: any) {
    console.error(`[${requestId}] fetchNutrition: Both sources failed: ${error.message}`);
    
    // Return validated fallback nutrition data
    const fallbackData = createFallbackNutritionData(requestId);
    
    // Add meta debug info
    return {
      ...fallbackData,
      _meta: {
        ocrText: text,
        debugTrace: `Error in fetchNutrition: ${error.message}`
      }
    };
  }
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
 * Return format string based on a specific health goal
 */
function getGoalSpecificPrompt(healthGoal: string): string {
  const goalLower = healthGoal.toLowerCase();
  
  if (goalLower.includes('weight loss') || goalLower.includes('lose weight')) {
    return `For weight loss, analyze calories and macronutrient balance. Identify high-calorie components, hidden sugars, and refined carbs. Highlight fiber sources and protein that promote satiety.`;
  }
  
  if (goalLower.includes('muscle') || goalLower.includes('strength') || goalLower.includes('build muscle')) {
    return `For muscle building, focus on protein quality and quantity. Identify complete proteins, leucine content, and distribution of protein sources. Analyze carb quality for glycogen replenishment and overall caloric adequacy.`;
  }
  
  if (goalLower.includes('energy') || goalLower.includes('fatigue')) {
    return `For energy improvement, identify complex carbs, B vitamins, iron, and magnesium sources. Note glycemic impact, fiber content for sustained energy, and potential causes of energy crashes.`;
  }
  
  if (goalLower.includes('heart') || goalLower.includes('cholesterol') || goalLower.includes('blood pressure')) {
    return `For heart health, analyze sodium content, saturated fat, trans fats, and cholesterol. Identify omega-3 sources, potassium, fiber (particularly soluble), and antioxidants that support cardiovascular function.`;
  }
  
  if (goalLower.includes('diabetes') || goalLower.includes('blood sugar') || goalLower.includes('insulin')) {
    return `For blood sugar management, focus on glycemic impact, fiber content, and carb quality. Note protein adequacy for slowing glucose absorption and identify hidden sugars or refined carbs that may spike blood glucose.`;
  }
  
  // Default prompt for general health
  return `For general health, provide a balanced analysis of all macronutrients and key micronutrients. Highlight both strengths and potential improvements for overall nutritional quality.`;
}

/**
 * Function to analyze the image with GPT-4 Vision
 */
export async function analyzeWithGPT4Vision(base64Image: string, healthGoal: string, requestId: string) {
  console.time(`⏱️ [${requestId}] analyzeWithGPT4Vision`);
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  
  if (!OPENAI_API_KEY) {
    console.timeEnd(`⏱️ [${requestId}] analyzeWithGPT4Vision`);
    throw new Error('OpenAI API key is not configured');
  }

  // Try with primary prompt first, then fallback to simpler prompt if needed
  let attempt = 1;
  let lastError: Error | null = null;
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
          
          // If no enrichment needed or this is the second attempt, return the analysis as is
          console.log(`[${requestId}] GPT-4 Vision analysis completed in ${(endTime - startTime) / 1000}s (without enrichment)`);
          console.timeEnd(`⏱️ [${requestId}] analyzeWithGPT4Vision`);
          return {
            ...analysisJson,
            reasoningLogs
          };
        } catch (jsonError: unknown) {
          console.error(`[${requestId}] Failed to parse JSON from OpenAI response:`, jsonError);
          console.error(`[${requestId}] Raw response text: ${analysisText.substring(0, 200)}...`);
          
          // Store this error but try again if it's our first attempt
          lastError = jsonError instanceof Error ? jsonError : new Error(String(jsonError));
          if (attempt === 1) {
            attempt++;
            continue;
          } else {
            throw new Error(`Failed to parse analysis JSON: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
          }
        }
      } catch (fetchError: any) {
        // Clear the timeout to prevent potential memory leaks
        clearTimeout(timeoutId);
        
        if (fetchError.name === 'AbortError') {
          console.error(`[${requestId}] Request aborted due to timeout: ${fetchError.message}`);
          lastError = new Error('Analysis request timed out');
        } else {
          console.error(`[${requestId}] Fetch error during OpenAI API call:`, fetchError);
          lastError = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
        }
        
        // Try again with a simplified prompt if this is the first attempt
        if (attempt === 1) {
          attempt++;
          continue;
        } else {
          throw new Error(`Failed to complete analysis after ${attempt} attempts: ${lastError.message}`);
        }
      }
    } catch (attemptError) {
      console.error(`[${requestId}] Error during analysis attempt ${attempt}:`, attemptError);
      
      // Store the error and try again if it's our first attempt
      lastError = attemptError;
      if (attempt === 1) {
        attempt++;
        continue;
      } else {
        throw new Error(`Failed to analyze image after ${attempt} attempts: ${lastError.message}`);
      }
    }
  }
  
  // If we reach here, all attempts failed. Throw the last error.
  console.timeEnd(`⏱️ [${requestId}] analyzeWithGPT4Vision`);
  throw lastError || new Error('Failed to analyze image with GPT-4 Vision');
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
      model: "gpt-4-vision",
      usedFallback: false,
      ocrExtracted: false
    },
    source: `gpt4-vision${visionResult.imageChallenges ? '-with-challenges' : ''}`,
    _meta: {
      ocrConfidence: visionResult.confidence,
      debugTrace: visionResult.imageChallenges ? `Image challenges: ${visionResult.imageChallenges.join(', ')}` : undefined
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
      googleVisionValid: false,
      nutritionixValid: false,
      openaiValid: false,
      details: {}
    };
    
    // Check OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      validation.details.openai = "Missing OpenAI API key";
    } else if (process.env.OPENAI_API_KEY.length < 20) {
      validation.details.openai = "OpenAI API key appears invalid (too short)";
    } else {
      validation.openaiValid = true;
    }
    
    // Check Nutritionix API credentials
    if (!process.env.NUTRITIONIX_APP_ID || !process.env.NUTRITIONIX_API_KEY) {
      validation.details.nutritionix = "Missing Nutritionix credentials";
    } else if (process.env.NUTRITIONIX_APP_ID.length < 5 || process.env.NUTRITIONIX_API_KEY.length < 10) {
      validation.details.nutritionix = "Nutritionix credentials appear invalid (too short)";
    } else {
      validation.nutritionixValid = true;
    }
    
    // Check Google Vision API credentials
    const useOcr = process.env.USE_OCR_EXTRACTION === 'true';
    if (useOcr) {
      const hasBase64Creds = !!process.env.GOOGLE_VISION_PRIVATE_KEY_BASE64 && 
                         process.env.GOOGLE_VISION_PRIVATE_KEY_BASE64.length > 100;
      const hasFileCreds = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
      
      if (!hasBase64Creds && !hasFileCreds) {
        validation.details.googleVision = "Missing Google Vision API credentials";
      } else {
        validation.googleVisionValid = true;
      }
    } else {
      // OCR is disabled, so Vision credentials aren't critical
      validation.googleVisionValid = true;
      validation.details.googleVision = "OCR extraction disabled, skipping validation";
    }
    
    // Determine overall validity and error message
    const valid = validation.nutritionixValid && 
                (validation.openaiValid || validation.googleVisionValid);
    
    let error: string | undefined;
    if (!valid) {
      const missingServices = [];
      if (!validation.nutritionixValid) missingServices.push("Nutritionix");
      if (!validation.openaiValid) missingServices.push("OpenAI");
      if (!validation.googleVisionValid) missingServices.push("Google Vision");
      
      error = `Missing or invalid API credentials for: ${missingServices.join(", ")}`;
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
      
      // Check if we should use GPT-4 Vision
      const useGpt4Vision = process.env.USE_GPT4_VISION === 'true';
      console.log(`[${requestId}] USE_GPT4_VISION flag: ${useGpt4Vision ? 'enabled' : 'disabled'}`);
      
      // Analysis result variable used throughout the function
      let analysisResult: AnalysisResult | null = null;
      
      if (useGpt4Vision) {
        try {
          // Use GPT-4 Vision for direct image analysis
          console.log(`[${requestId}] Using GPT-4 Vision for image analysis`);
          
          // Add explicit timeout for vision analysis
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            console.warn(`[${requestId}] GPT-4 Vision timeout reached (45s), aborting`);
            controller.abort();
          }, 45000);
          
          try {
            // Run vision analysis
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
              message: "Analysis completed successfully with GPT-4 Vision",
              result: analysisResult,
              elapsedTime,
              error: null,
              imageUrl: null,
              diagnostics: {
                visionConfidence: visionResult.confidence,
                modelUsed: "gpt-4-vision",
                processingTimeMs: elapsedTime
              }
            };
            
            return NextResponse.json(response);
          } catch (visionError: any) {
            // Clear timeout
            clearTimeout(timeoutId);
            
            // Log the error and fall back to OCR-based analysis
            console.error(`[${requestId}] GPT-4 Vision analysis failed, falling back to OCR:`, visionError.message);
            console.log(`[${requestId}] Falling back to OCR-based analysis...`);
            // Continue with OCR-based analysis below
          }
        } catch (visionSetupError: any) {
          console.error(`[${requestId}] Error setting up GPT-4 Vision analysis:`, visionSetupError.message);
          console.log(`[${requestId}] Falling back to OCR-based analysis...`);
          // Continue with OCR-based analysis below
        }
      }
      
      // Run food detection with error handling and timeout
      console.log(`[${requestId}] Running food detection on image...`);
      let foodDetectionResult;
      let labelDetectionMetadata = {
        usedLabelDetection: false,
        detectedLabel: null as string | null,
        labelConfidence: 0,
        labelMatchCandidates: [] as Array<{label: string, score: number}>
      };
      
      try {
        // Add explicit timeout for food detection to avoid hanging requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.warn(`[${requestId}] Food detection timeout reached (10s), aborting`);
          controller.abort();
        }, 10000);

        // Run food detection with the specified timeout
        foodDetectionResult = await Promise.race([
          runFoodDetection(imageBase64, requestId),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('FOOD_DETECTION_TIMEOUT')), 10000)
          )
        ]);
        clearTimeout(timeoutId);
      } catch (detectionError: any) {
        // Handle detection timeout or other errors
        console.error(`[${requestId}] Food detection error:`, detectionError.message);
        foodDetectionResult = {
          success: false,
          text: "",
          confidence: 0,
          foodLabels: [],
          topFoodLabel: null,
          detectionMethod: 'fallback' as 'fallback',
          processingTimeMs: 0,
          error: detectionError.message
        };
      }
      
      // Extract information from food detection result
      let extractedText = foodDetectionResult.text || "";
      const detectedFoodLabels = foodDetectionResult.foodLabels || [];
      const topFoodLabel = foodDetectionResult.topFoodLabel;
      const detectionMethod = foodDetectionResult.detectionMethod;
      
      // Set metadata for the response
      labelDetectionMetadata = {
        usedLabelDetection: detectionMethod === 'label',
        detectedLabel: topFoodLabel?.label || null,
        labelConfidence: topFoodLabel?.score || 0,
        labelMatchCandidates: detectedFoodLabels
      };
      
      // Debug logs for food detection output
      console.log(`[${requestId}] Food detection complete: method=${detectionMethod}, confidence=${foodDetectionResult.confidence}`);
      if (detectionMethod === 'label') {
        console.log(`[${requestId}] Using high-confidence label: ${topFoodLabel?.label} (${(topFoodLabel?.score || 0) * 100}%)`);
      } else {
        console.log(`[${requestId}] Extracted text (${extractedText.length} chars): ${extractedText.substring(0, 100)}`);
      }
      
      // Process the detected food information
      let nutritionData: ExtendedNutritionData;
      let analysis: any = { 
        success: false, 
        feedback: ["Unable to analyze this image."], 
        suggestions: ["Try uploading a photo of food."] 
      };
      
      if (extractedText.length > 0 && foodDetectionResult.success) {
        // Special handling for high-confidence labels detected by Vision API
        if (detectionMethod === 'label' && topFoodLabel && topFoodLabel.score > 0.8) {
          console.log(`[${requestId}] Using direct label analysis for detected food: ${topFoodLabel.label}`);
          
          // Call Nutritionix directly with the detected food label
          const nutritionixData = await getNutritionData(topFoodLabel.label, requestId);
          
          if (nutritionixData.success && nutritionixData.data) {
            // Add meta debug info to track label detection data
            nutritionData = {
              ...nutritionixData.data,
              source: 'nutritionix',
              _meta: {
                ocrText: extractedText,
                foodTerms: [topFoodLabel.label],
                foodConfidence: topFoodLabel.score,
                debugTrace: `Used direct label detection: ${topFoodLabel.label} (confidence: ${(topFoodLabel.score * 100).toFixed(1)}%)`
              }
            };
          } else {
            console.warn(`[${requestId}] Label-based Nutritionix lookup failed for "${topFoodLabel.label}". Using GPT fallback`);
            
            // Fall back to GPT using the detected label
            const gptFallback = await callGptNutritionFallback(topFoodLabel.label, requestId);
            
            // Add meta debug info
            nutritionData = {
              ...gptFallback,
              source: 'gpt_label_fallback',
              _meta: {
                ocrText: extractedText,
                foodTerms: [topFoodLabel.label],
                foodConfidence: topFoodLabel.score,
                debugTrace: `Used GPT fallback after label-based Nutritionix failure for "${topFoodLabel.label}"`
              }
            };
            
            // Validate GPT fallback data
            nutritionData = validateNutritionData(nutritionData, requestId);
          }
        }
        // Regular OCR-based text analysis
        else {
          // Get nutrition data from the extracted text
          nutritionData = await fetchNutrition(extractedText, requestId);
        }
        
        // Check if no food was detected in the OCR text
        if (nutritionData.noFoodDetected) {
          console.warn(`[${requestId}] No food detected in OCR text, returning no-food response`);
          
          // Create a special no-food response that the frontend can handle
          const noFoodResult: AnalysisResult = {
            description: "No food detected in this image",
            nutrients: [
              { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
              { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
              { name: 'Carbohydrates', value: 0, unit: 'g', isHighlight: true },
              { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
            ],
            feedback: ["We couldn't identify any food in this image."],
            suggestions: ["Try uploading a clearer photo of food."],
            detailedIngredients: [],
            goalScore: { overall: 0, specific: {} },
            modelInfo: {
              model: "ocr",
              usedFallback: false,
              ocrExtracted: true
            },
            _meta: nutritionData._meta || {
              ocrText: extractedText,
              debugTrace: "No food detected in OCR text"
            },
            no_result: true // Special flag to indicate no valid result
          };
          
          // Clear the timeout since we're returning early
          if (globalTimeoutId) clearTimeout(globalTimeoutId);
          
          // Create the no-food response
          const noFoodResponse: AnalysisResponse = {
            success: true, // Still successful from API perspective
            fallback: true,
            requestId,
            message: "No food detected in the image",
            result: noFoodResult,
            elapsedTime: Date.now() - startTime,
            error: null,
            imageUrl: null,
            diagnostics: {
              ocrConfidence: foodDetectionResult.confidence,
              ocrText: extractedText,
              textLength: extractedText.length,
              processingTimeMs: Date.now() - startTime,
              noFoodDetected: true
            }
          };
          
          return NextResponse.json(noFoodResponse);
        }
        
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
        // If OCR failed or returned no text, create a special no-text response
        console.warn(`[${requestId}] OCR failed or returned no text, creating no-text response`);
        
        const noTextResult: AnalysisResult = {
          description: "No text could be extracted from this image",
          nutrients: [
            { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
            { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
            { name: 'Carbohydrates', value: 0, unit: 'g', isHighlight: true },
            { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
          ],
          feedback: ["We couldn't detect any text in the image."],
          suggestions: ["Try uploading a photo that clearly shows food or its label."],
          detailedIngredients: [],
          goalScore: { overall: 0, specific: {} },
          modelInfo: {
            model: "ocr_failed",
            usedFallback: true,
            ocrExtracted: false
          },
          _meta: {
            ocrText: "",
            debugTrace: "OCR failed or returned no text"
          },
          no_result: true // Special flag to indicate no valid result
        };
        
        // Clear the timeout since we're returning early
        if (globalTimeoutId) clearTimeout(globalTimeoutId);
        
        // Create the no-text response
        const noTextResponse: AnalysisResponse = {
          success: true, // Still successful from API perspective
          fallback: true,
          requestId,
          message: "No text could be extracted from the image",
          result: noTextResult,
          elapsedTime: Date.now() - startTime,
          error: null,
          imageUrl: null,
          diagnostics: {
            ocrConfidence: foodDetectionResult.confidence,
            textLength: 0,
            processingTimeMs: Date.now() - startTime,
            ocrFailed: true
          }
        };
        
        return NextResponse.json(noTextResponse);
      }
      
      // Create analysis from the nutrition data
      analysisResult = {
        description: nutritionData.raw?.description || "Could not analyze this meal properly.",
        nutrients: nutritionData.nutrients || [
          { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
          { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
          { name: 'Carbohydrates', value: 0, unit: 'g', isHighlight: true },
          { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
        ],
        feedback: (nutritionData.raw?.feedback || analysis.feedback) as string[],
        suggestions: (nutritionData.raw?.suggestions || analysis.suggestions) as string[],
        detailedIngredients: nutritionData.foods?.map(food => ({
          name: food.food_name,
          category: 'food',
          confidence: 0.8,
          confidenceEmoji: '✅'
        })) || [],
        goalScore: {
          overall: nutritionData.raw?.goalScore?.overall || 0,
          specific: nutritionData.raw?.goalScore?.specific || {}
        },
        goalName: formatGoalName(healthGoal),
        modelInfo: {
          model: nutritionData.source || "fallback",
          usedFallback: nutritionData.raw?.fallback || false,
          ocrExtracted: !!extractedText,
          usedLabelDetection: labelDetectionMetadata.usedLabelDetection,
          detectedLabel: labelDetectionMetadata.detectedLabel,
          labelConfidence: labelDetectionMetadata.labelConfidence
        },
        lowConfidence: nutritionData.raw?.fallback || false,
        fallback: nutritionData.raw?.fallback || false,
        source: nutritionData.source || "fallback",
        _meta: {
          ocrText: extractedText,
          ocrConfidence: foodDetectionResult.confidence,
          usedLabelDetection: labelDetectionMetadata.usedLabelDetection,
          detectedLabel: labelDetectionMetadata.detectedLabel,
          labelConfidence: labelDetectionMetadata.labelConfidence,
          ...nutritionData._meta
        }
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
        message: "Analysis completed successfully" + (foodDetectionResult.error ? " (with text extraction fallback)" : ""),
        result: validatedResult,
        elapsedTime,
        error: null,
        imageUrl: null,
        diagnostics: {
          ocrConfidence: foodDetectionResult.confidence,
          ocrText: extractedText,
          usedFallback: (nutritionData as any).source !== 'nutritionix',
          source: (nutritionData as any).source,
          textLength: extractedText.length,
          noFoodDetected: nutritionData.noFoodDetected || false,
          foodTerms: nutritionData._meta?.foodTerms || [],
          labelDetection: labelDetectionMetadata.usedLabelDetection,
          detectedLabel: labelDetectionMetadata.detectedLabel,
          labelConfidence: labelDetectionMetadata.labelConfidence,
          labelMatchCandidates: labelDetectionMetadata.labelMatchCandidates,
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
      if (!response.result || typeof response.result !== 'object') {
        console.warn(`[${requestId}] Invalid response structure detected, applying universal fallback`);
        response.result = createUniversalFallbackResult("invalid_structure", response.result || {});
      } else {
        // Ensure we have a fully valid structure even if some parts might be missing
        const normalizedResult = normalizeAnalysisResult(response.result);
        response.result = normalizedResult;
        
        // Log the success of accepting partial results
        console.info("[Test] Fallback result accepted ✅");
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
      if (!errorResponse.result || typeof errorResponse.result !== 'object') {
        console.warn(`[${requestId}] Invalid error response structure detected, applying universal fallback`);
        errorResponse.result = createUniversalFallbackResult("error_response_invalid", errorResponse.result || {});
      } else {
        // Normalize the result to ensure all fields exist
        errorResponse.result = normalizeAnalysisResult(errorResponse.result);
        console.info("[Test] Fallback error result accepted ✅");
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