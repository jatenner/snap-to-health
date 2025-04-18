/**
 * This file contains stub implementations of analysis functions
 * to allow the app to compile and unblock the Vercel build.
 */

import OpenAI from 'openai';
import crypto from 'crypto';
import { GPT_MODEL, GPT_VISION_MODEL, FALLBACK_MODELS, API_CONFIG } from './constants';

// Initialize OpenAI client
let openai: OpenAI | null = null;
let openAIInitializationError: Error | null = null;

if (!process.env.OPENAI_API_KEY) {
  const errorMsg = "CRITICAL ERROR: OPENAI_API_KEY environment variable is not set.";
  console.error(`❌ ${errorMsg}`);
  openAIInitializationError = new Error(errorMsg);
} else {
  try {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    console.log("✅ OpenAI client initialized successfully.");
  } catch (error: any) {
    const errorMsg = `Failed to initialize OpenAI client: ${error?.message || 'Unknown error'}`;
    console.error(`❌ ${errorMsg}`);
    openAIInitializationError = new Error(errorMsg);
  }
}

/**
 * Validates OpenAI API key format
 */
function validateOpenAIApiKey(apiKey: string | undefined): boolean {
  if (!apiKey) return false;
  
  // Check for various OpenAI API key formats:
  // 1. Project API keys: sk-proj-{projectId}_{random string}
  // 2. Organization API keys: sk-org-{orgId}_{random string}
  // 3. Standard API keys: sk-{random string}
  return (
    apiKey.startsWith('sk-proj-') || 
    apiKey.startsWith('sk-org-') || 
    /^sk-[A-Za-z0-9]{48,}$/.test(apiKey)
  );
}

/**
 * Enhanced API key validation that tests both format and authentication
 */
export async function validateAndTestAPIKey(apiKey: string | undefined, requestId: string): Promise<{
  valid: boolean;
  error?: string;
  isAuthError?: boolean;
}> {
  // First check format
  if (!apiKey || !validateOpenAIApiKey(apiKey)) {
    return { 
      valid: false, 
      error: 'Invalid API key format',
      isAuthError: true
    };
  }
  
  try {
    // Test key with a minimal API call
    const openai = new OpenAI({ apiKey });
    
    // Just list models as a simple authentication test
    await openai.models.list();
    
    return { valid: true };
  } catch (error: any) {
    const statusCode = error?.status || error?.statusCode;
    const isAuthError = statusCode === 401;
    const errorMsg = error?.message || 'Unknown API error';
    
    console.error(`❌ API key validation failed: ${errorMsg}`);
    
    return {
      valid: false,
      error: errorMsg,
      isAuthError: isAuthError
    };
  }
}

/**
 * Check if a model is available for the current OpenAI API key
 * Returns availability status, fallback model, and error message
 */
export async function checkModelAvailability(
  modelToCheck: string,
  requestId?: string
): Promise<{ available: boolean; fallbackModel: string | null; error: string | null }> {
  const id = requestId || crypto.randomUUID();
  console.log(`🔍 [${id}] Checking availability for model: ${modelToCheck}`);
  
  // First, validate the API key format
  const openAIApiKey = process.env.OPENAI_API_KEY;
  if (!openAIApiKey) {
    console.error(`❌ [${id}] OpenAI API key is not set in environment variables`);
    return {
      available: false,
      fallbackModel: null,
      error: 'OpenAI API key is not set'
    };
  }
  
  // Project API keys are longer and have different format
  // Modern key format: sk-proj-{projectId}_{random string}
  const isValidKeyFormat = 
    openAIApiKey.startsWith('sk-proj-') || 
    openAIApiKey.startsWith('sk-org-') || 
    /^sk-[A-Za-z0-9]{48,}$/.test(openAIApiKey);
    
  if (!isValidKeyFormat) {
    console.error(`❌ [${id}] OpenAI API key has invalid format`);
    return {
      available: false,
      fallbackModel: null,
      error: 'Invalid API key format'
    };
  }
  
  try {
    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: openAIApiKey
    });
    
    // Check available models
    console.log(`🔍 [${id}] Retrieving model list to verify ${modelToCheck} availability...`);
    const modelList = await openai.models.list();
    
    // Check if the requested model is available
    const isModelAvailable = modelList.data.some(model => model.id === modelToCheck);
    if (isModelAvailable) {
      console.log(`✅ [${id}] Model ${modelToCheck} is available`);
      return { available: true, fallbackModel: null, error: null };
    }
    
    // Find the first available fallback model
    console.log(`⚠️ [${id}] Model ${modelToCheck} not available, checking fallbacks...`);
    for (const fallbackModel of FALLBACK_MODELS) {
      if (modelList.data.some(model => model.id === fallbackModel)) {
        console.log(`🔄 [${id}] Using fallback model: ${fallbackModel}`);
        return { 
          available: false, 
          fallbackModel: fallbackModel,
          error: `Model ${modelToCheck} not available, using ${fallbackModel} instead`
        };
      }
    }
    
    // No fallback model available
    console.error(`❌ [${id}] No suitable models available`);
    return {
      available: false,
      fallbackModel: null,
      error: 'No suitable models available for analysis'
    };
  } catch (error: any) {
    // Handle specific API key errors
    if (error.message?.includes('401') || 
        error.message?.includes('Incorrect API key') ||
        error.message?.includes('invalid_api_key')) {
      console.error(`🔑 [${id}] API key authentication failed: ${error.message}`);
      return {
        available: false,
        fallbackModel: null,
        error: 'API key authentication failed: Invalid API key or permissions'
      };
    }
    
    // Rate limit errors
    if (error.message?.includes('429') || 
        error.message?.includes('rate limit')) {
      console.error(`⏱️ [${id}] Rate limit exceeded: ${error.message}`);
      return {
        available: false,
        fallbackModel: null,
        error: 'Rate limit exceeded, please try again later'
      };
    }
    
    // Network or other errors
    console.error(`❌ [${id}] Error checking model availability: ${error.message}`);
    return {
      available: false,
      fallbackModel: null,
      error: `Error checking model availability: ${error.message}`
    };
  }
}

/**
 * Define types for analysis results
 */
interface GoalScore {
  overall: number;
  specific: Record<string, number>;
}

interface AnalysisFallback {
  success: boolean;
  description: string;
  nutrients: any[];
  feedback: string;
  suggestions: string[];
  detailedIngredients: any[];
  healthScore: number;
  goalScore: GoalScore;
  metadata: {
    requestId: string;
    model: string | null;
    usedFallback: boolean;
    processingTime: number;
    error: string;
  };
}

/**
 * Create an empty fallback analysis when models are unavailable
 */
export function createEmptyFallbackAnalysis(
  requestId: string, 
  error: string
): AnalysisFallback {
  return {
    success: false,
    description: "We couldn't analyze your image due to API service issues.",
    nutrients: [],
    feedback: "Our image analysis service is currently experiencing technical difficulties. Please try again later.",
    suggestions: ["Try again later", "Check if your image is clear and contains food items"],
    detailedIngredients: [],
    healthScore: 0,
    goalScore: {
      overall: 0,
      specific: {}
    },
    metadata: {
      requestId,
      model: null,
      usedFallback: true,
      processingTime: 0,
      error
    }
  };
}

/**
 * Analyze an image with GPT-4o model (with vision capabilities), with fallback to GPT-3.5-Turbo if needed
 * @param base64Image Base64 encoded image to analyze
 * @param healthGoals User's health goals to consider
 * @param dietaryPreferences User's dietary preferences (allergies, avoidances)
 * @param requestId Unique ID for this request
 * @returns Analysis result and metadata including model used and fallback status
 */
export async function analyzeImageWithGPT4V(
  base64Image: string,
  healthGoals: string[],
  dietaryPreferences: string[],
  requestId: string
): Promise<{
  analysis: any;
  success: boolean;
  error?: string;
  modelUsed: string;
  usedFallbackModel: boolean;
  forceGPT4V: boolean;
  rawResponse?: string;
}> {
  console.log(`📸 [${requestId}] Starting image analysis with GPT-4o...`);
  console.log(`📊 [${requestId}] Goals: ${healthGoals.join(', ')}`);
  console.log(`🍽️ [${requestId}] Preferences: ${dietaryPreferences.join(', ')}`);
  console.log(`🖼️ [${requestId}] Image size: ~${Math.round(base64Image.length / 1024)}KB`);
  
  // Check if USE_GPT4_VISION is explicitly set (defaulting to true if not set)
  const forceGPT4V = process.env.USE_GPT4_VISION !== 'false';
  console.log(`⚙️ [${requestId}] Advanced Model Mode: ${forceGPT4V ? 'FORCED' : 'FALLBACK ALLOWED'}`);
  
  // Check for the OpenAI API key
  const openAIApiKey = process.env.OPENAI_API_KEY;
  
  // Validate the API key
  if (!openAIApiKey || !validateOpenAIApiKey(openAIApiKey)) {
    const error = `Invalid or missing OpenAI API key format`;
    console.error(`❌ [${requestId}] ${error}`);
    return {
      analysis: createEmptyFallbackAnalysis(requestId, error),
      success: false,
      error,
      modelUsed: 'none',
      usedFallbackModel: false,
      forceGPT4V
    };
  }
  
  try {
    // Initialize the OpenAI client
    const openai = new OpenAI({
      apiKey: openAIApiKey
    });
    
    console.log(`🔗 [${requestId}] OpenAI client initialized successfully`);
    
    // Default model and backup option
    const preferredModel = GPT_VISION_MODEL; // Using GPT_VISION_MODEL constant (gpt-4o)
    let modelToUse = preferredModel;
    let usedFallbackModel = false;
    
    // Handle model selection based on USE_GPT4_VISION flag
    if (forceGPT4V) {
      // If GPT-4o is forced, check availability but don't fallback
      const modelCheck = await checkModelAvailability(preferredModel, requestId);
      
      if (!modelCheck.available) {
        // If force mode is on but model isn't available, fail rather than fallback
        const error = `Advanced model is forced (USE_GPT4_VISION=true) but ${preferredModel} is not available: ${modelCheck.error}`;
        console.error(`❌ [${requestId}] ${error}`);
        
        return {
          analysis: createEmptyFallbackAnalysis(requestId, error),
          success: false,
          error,
          modelUsed: 'error',
          usedFallbackModel: false,
          forceGPT4V
        };
      }
      
      console.log(`✅ [${requestId}] Using forced ${preferredModel} model`);
    } else {
      // If fallbacks are allowed, check availability and use fallback if needed
      const modelCheck = await checkModelAvailability(preferredModel, requestId);
      
      if (!modelCheck.available && modelCheck.fallbackModel) {
        modelToUse = modelCheck.fallbackModel;
        usedFallbackModel = true;
        console.warn(`⚠️ [${requestId}] Using fallback model: ${modelToUse} (USE_GPT4_VISION=false)`);
      }
    }
    
    // Construct the system prompt
    const systemPrompt = `You are an expert nutritionist AI that analyzes meal images and provides detailed nutritional information and health advice. You must provide a BEST EFFORT ANALYSIS even with unclear, partial, or ambiguous images.

GOAL: Analyze the food in the image and return a JSON object with the following structure:
{
  "description": "Detailed description of the meal and its components",
  "nutrients": {
    "calories": number (kcal),
    "protein": number (grams),
    "carbs": number (grams),
    "fat": number (grams),
    "fiber": number (grams),
    "sugar": number (grams),
    "sodium": number (mg)
  },
  "feedback": ["List of health feedback points about the meal"],
  "suggestions": ["List of suggestions to improve the meal's nutritional value"],
  "warnings": ["List of potential health concerns if applicable, or empty array"],
  "goalScore": number (0-100 representing how well this meal fits with the user's health goals),
  "scoreExplanation": "Brief explanation of the goal score",
  "detailedIngredients": [
    {
      "name": "Name of ingredient",
      "estimatedAmount": "Portion estimate (e.g., '1 cup', '2 oz')",
      "calories": number (estimated kcal),
      "confidence": number (0-100 representing your confidence in this identification)
    },
    ...more ingredients
  ],
  "confidence": number (0-100 representing your overall confidence in this analysis),
  "reasoningLogs": ["List your step-by-step reasoning about what you can see in the image"]
}

IMPORTANT INSTRUCTIONS FOR UNCLEAR IMAGES:
- If the image is unclear, blurry, poorly lit, or only shows part of the food, MAKE YOUR BEST GUESS
- Use your knowledge of food appearance, textures, colors, and shapes to make educated guesses
- If you see even a small portion of food (like a corner of a banana), use that to inform your analysis
- Explain your reasoning and uncertainty in the description field
- Assign lower confidence scores to indicate uncertainty, but ALWAYS provide a complete analysis
- Add specific reasoning in the reasoningLogs array about what you can identify and how certain you are
- NEVER refuse to analyze an image - provide your best guess with appropriate confidence levels

User Health Goals: ${healthGoals.join(', ')}
Dietary Preferences/Restrictions: ${dietaryPreferences.join(', ')}

NOTE: Always return valid JSON with ALL fields. For uncertain values, provide estimates and indicate lower confidence.
${usedFallbackModel ? '\nNOTE: This analysis is being performed by a fallback model with limited capabilities.' : ''}`;
    
    // Format the image URL correctly
    const formattedImage = base64Image.startsWith('data:image') 
      ? base64Image 
      : `data:image/jpeg;base64,${base64Image}`;

    // Make the OpenAI API request
    console.log(`⏳ [${requestId}] Sending request to OpenAI API with model: ${modelToUse}`);
    const response = await openai.chat.completions.create({
      model: modelToUse,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyze this meal image and provide nutritional information and health advice in JSON format. Even if the image is unclear, partial, or difficult to identify, please make your best educated guess and provide a complete analysis with appropriate confidence levels.'
            },
            {
              type: 'image_url',
              image_url: {
                url: formattedImage,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 3000,
      temperature: 0.2,
      response_format: { type: 'json_object' }
    });
    
    console.log(`✅ [${requestId}] OpenAI API response received, model: ${modelToUse}, tokens: ${response.usage?.total_tokens || 'unknown'}`);
    
    // Extract the response content
    const responseContent = response.choices[0]?.message?.content || '';
    
    // Always log the full response (for debugging)
    console.log(`📋 [${requestId}] FULL GPT Response: ${responseContent}`);
    
    // Try to parse the JSON response
    let parsedResponse: Record<string, any>;
    try {
      parsedResponse = JSON.parse(responseContent);
      
      // Verify we have the required fields, but be more lenient
      const requiredKeys = ['description', 'nutrients'];
      const recommendedKeys = ['feedback', 'suggestions', 'detailedIngredients'];
      const missingRequiredKeys = requiredKeys.filter(key => !parsedResponse[key]);
      const missingRecommendedKeys = recommendedKeys.filter(key => !parsedResponse[key]);
      
      // Add minimum default values for any missing required fields
      if (missingRequiredKeys.length > 0) {
        console.warn(`⚠️ [${requestId}] Missing required keys in GPT response: ${missingRequiredKeys.join(', ')}`);
        
        // Add default values for missing required fields
        if (!parsedResponse.description) {
          parsedResponse.description = "Food item (details unclear from image)";
        }
        
        if (!parsedResponse.nutrients) {
          parsedResponse.nutrients = {
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            fiber: 0,
            sugar: 0
          };
        }
      }
      
      // Add default values for missing recommended fields
      if (missingRecommendedKeys.length > 0) {
        console.warn(`ℹ️ [${requestId}] Missing recommended keys in GPT response: ${missingRecommendedKeys.join(', ')}`);
        
        if (!parsedResponse.feedback) {
          parsedResponse.feedback = ["Unable to provide detailed feedback based on the image"];
        }
        
        if (!parsedResponse.suggestions) {
          parsedResponse.suggestions = ["Consider providing a clearer image for more specific suggestions"];
        }
        
        if (!parsedResponse.detailedIngredients) {
          parsedResponse.detailedIngredients = [{
            name: "Unidentified food item",
            estimatedAmount: "unknown",
            calories: 0,
            confidence: 0
          }];
        }
      }
      
      // Also check for nutrient value structure, but fill in missing values
      if (parsedResponse.nutrients) {
        const requiredNutrients = ['calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar'];
        const missingNutrients = requiredNutrients.filter(
          nutrient => typeof parsedResponse.nutrients[nutrient] !== 'number'
        );
        
        if (missingNutrients.length > 0) {
          console.warn(`⚠️ [${requestId}] Filling in missing or invalid nutrient values: ${missingNutrients.join(', ')}`);
          
          // Fill in missing nutrient values with zeros
          missingNutrients.forEach(nutrient => {
            parsedResponse.nutrients[nutrient] = 0;
          });
          
          // Mark as low confidence if we had to fill in nutrients
          parsedResponse.lowConfidence = true;
        }
      }
      
      // Add confidence indicator if not present
      if (typeof parsedResponse.confidence !== 'number') {
        // Default to medium confidence
        parsedResponse.confidence = 50;
      }
      
      // Add reasoningLogs if not present
      if (!Array.isArray(parsedResponse.reasoningLogs)) {
        parsedResponse.reasoningLogs = ["No reasoning logs provided by model"];
      }
      
      // Return the analysis, considering it successful if we have minimum required data
      const isMinimallyComplete = parsedResponse.description && parsedResponse.nutrients;
      
      return {
        analysis: parsedResponse,
        success: isMinimallyComplete,
        error: isMinimallyComplete ? undefined : "Incomplete analysis result even after repairs",
        modelUsed: modelToUse,
        usedFallbackModel,
        forceGPT4V,
        rawResponse: responseContent
      };
    } catch (parseError) {
      console.error(`❌ [${requestId}] Failed to parse GPT response as JSON: ${(parseError as Error).message}`);
      console.error(`❌ [${requestId}] Raw non-JSON response: ${responseContent}`);
      
      // If we can't parse the JSON, return an empty analysis
      return {
        analysis: createEmptyFallbackAnalysis(requestId, `Failed to parse response: ${(parseError as Error).message}`),
        success: false,
        error: `Failed to parse response: ${(parseError as Error).message}`,
        modelUsed: modelToUse,
        usedFallbackModel,
        forceGPT4V,
        rawResponse: responseContent
      };
    }
  } catch (error: any) {
    const errorMessage = error?.message || 'Unknown error';
    const statusCode = error?.status || error?.statusCode || 'unknown';
    console.error(`❌ [${requestId}] GPT4o analysis failed (Status: ${statusCode}): ${errorMessage}`);
    
    // Log detailed API error information if available
    if (error?.response) {
      console.error(`❌ [${requestId}] API Error Details:`, JSON.stringify(error.response, null, 2));
    }
    
    return {
      analysis: createEmptyFallbackAnalysis(requestId, errorMessage),
      success: false,
      error: errorMessage,
      modelUsed: 'error',
      usedFallbackModel: false,
      forceGPT4V,
      rawResponse: JSON.stringify(error)
    };
  }
}

/**
 * Stub implementation to check if an analysis needs confidence enrichment
 */
export function needsConfidenceEnrichment(analysis: any): boolean {
  // console.log("[Stub] needsConfidenceEnrichment called");
  return false;
}

/**
 * Stub implementation to enrich analysis results
 */
export async function enrichAnalysisResult(
  originalResult: any,
  healthGoals: string[],
  dietaryPreferences: string[],
  requestId: string
): Promise<any> {
  // console.log("[Stub] enrichAnalysisResult called");
  return originalResult;
}

/**
 * Validate that a GPT analysis result has all required fields
 * @param analysis Analysis result to validate
 * @returns Boolean indicating if the analysis is valid
 */
export function validateGptAnalysisResult(analysis: any): boolean {
  if (!analysis) return false;
  
  // Check for required top-level fields
  // We only require description and nutrients as absolute minimum now
  const criticalFields = ['description', 'nutrients'];
  const recommendedFields = ['feedback', 'suggestions', 'detailedIngredients'];
  
  // Verify critical fields exist
  for (const field of criticalFields) {
    if (!analysis[field]) {
      console.warn(`Analysis validation failed: missing critical field '${field}'`);
      return false;
    }
  }
  
  // Log warnings for recommended fields but don't fail validation
  for (const field of recommendedFields) {
    if (!analysis[field]) {
      console.warn(`Analysis missing recommended field '${field}', but continuing with validation`);
    }
  }
  
  // Ensure minimum nutrients structure - only require calories at minimum
  if (analysis.nutrients) {
    if (typeof analysis.nutrients.calories !== 'number' && 
        typeof analysis.nutrients.calories !== 'string') {
      console.warn(`Analysis validation warning: missing or invalid 'calories' in nutrients`);
      // Don't fail here, just warn
    }
  }
  
  // More lenient array validation - as long as they exist, even if empty
  const arrayFields = ['feedback', 'suggestions', 'detailedIngredients'].filter(f => analysis[f] !== undefined);
  for (const arrayField of arrayFields) {
    if (!Array.isArray(analysis[arrayField])) {
      console.warn(`Analysis warning: '${arrayField}' exists but is not an array`);
      // Don't fail validation, just log the warning
    }
  }
  
  // As long as we have description and some form of nutrients, consider it valid
  return true;
}

/**
 * Create a fallback response for when GPT analysis fails
 * @param reason Reason for creating fallback
 * @param partialAnalysis Any partial analysis data that might be available
 * @returns Structured fallback analysis
 */
export function createFallbackResponse(
  reason: string,
  partialAnalysis: any = null
): any {
  const fallback = createEmptyFallbackAnalysis(reason, reason);
  
  // Add error metadata for debugging
  fallback.metadata = {
    requestId: reason,
    model: null,
    usedFallback: true,
    processingTime: 0,
    error: reason
  };
  
  // If we have partial data, try to incorporate valid parts
  if (partialAnalysis) {
    // Description
    if (partialAnalysis.description && typeof partialAnalysis.description === 'string') {
      fallback.description = partialAnalysis.description;
    }
    
    // Try to salvage any valid nutrients
    if (partialAnalysis.nutrients && typeof partialAnalysis.nutrients === 'object') {
      const nutrientsObj: Record<string, number> = {};
      const validNutrients = ['calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'sodium'];
      
      validNutrients.forEach(nutrient => {
        if (typeof partialAnalysis.nutrients[nutrient] === 'number') {
          nutrientsObj[nutrient] = partialAnalysis.nutrients[nutrient];
        }
      });
      
      fallback.nutrients = Object.entries(nutrientsObj).map(([name, value]) => ({
        name,
        value,
        unit: name === 'calories' ? 'kcal' : 'g',
        isHighlight: false
      }));
    }
    
    // Try to salvage any valid detailed ingredients
    if (Array.isArray(partialAnalysis.detailedIngredients) && 
        partialAnalysis.detailedIngredients.length > 0) {
      fallback.detailedIngredients = partialAnalysis.detailedIngredients;
    }
    
    // Try to salvage any valid feedback
    if (Array.isArray(partialAnalysis.feedback) && 
        partialAnalysis.feedback.length > 0) {
      // Convert string array to single string
      fallback.feedback = partialAnalysis.feedback.join(". ");
    }
    
    // Try to salvage any valid suggestions
    if (Array.isArray(partialAnalysis.suggestions) && 
        partialAnalysis.suggestions.length > 0) {
      // Convert array of strings to array with single string
      fallback.suggestions = partialAnalysis.suggestions;
    }
  }
  
  return fallback;
}

/**
 * Create an emergency fallback response for unexpected errors
 */
export function createEmergencyFallbackResponse(): any {
  return createEmptyFallbackAnalysis(crypto.randomUUID(), 'Emergency fallback');
}