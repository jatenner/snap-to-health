/**
 * This file contains stub implementations of analysis functions
 * to allow the app to compile and unblock the Vercel build.
 */

import OpenAI from 'openai';
import crypto from 'crypto';

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

// Helper function to validate OPENAI API Key format
const validateOpenAIApiKey = (apiKey: string): boolean => {
  return (
    apiKey.startsWith('sk-') &&
    apiKey.length > 20
  );
};

/**
 * Create an empty fallback analysis when no GPT result is available
 */
function createEmptyFallbackAnalysis(): any {
  return {
    description: "Unable to analyze the image. Our AI analysis system encountered an issue.",
    nutrients: {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sugar: 0,
      sodium: 0
    },
    feedback: [
      "We couldn't analyze your meal image at this time.",
      "Please try again or contact support if the issue persists."
    ],
    suggestions: [
      "Try uploading a clearer image of your meal",
      "Ensure the image shows the food items clearly"
    ],
    warnings: [
      "This is a fallback analysis due to a system error"
    ],
    goalScore: 0,
    scoreExplanation: "No score available due to analysis failure",
    detailedIngredients: []
  };
}

/**
 * Check if a model is available for the OpenAI API key
 * @param openai Initialized OpenAI client
 * @param modelId Model ID to check (e.g., "gpt-4-vision-preview")
 * @param requestId Request ID for logging
 * @returns Object with availability status and fallback model if needed
 */
export async function checkModelAvailability(
  openai: OpenAI,
  modelId: string,
  requestId: string
): Promise<{ available: boolean; fallbackModel?: string; error?: string }> {
  try {
    console.log(`🔍 [${requestId}] Checking availability of model: ${modelId}`);
    
    // Try to retrieve the model to see if it's available to this API key
    await openai.models.retrieve(modelId);
    
    console.log(`✅ [${requestId}] Model ${modelId} is available`);
    return { available: true };
  } catch (error: any) {
    // Check the specific error to determine if it's a permissions issue
    const errorMessage = error?.message || 'Unknown error';
    const statusCode = error?.status || error?.statusCode || null;
    
    console.error(`❌ [${requestId}] Model availability check failed: ${errorMessage} (Status: ${statusCode})`);
    
    // Determine if this is a permissions issue (401/403) or if the model doesn't exist (404)
    let fallbackModel: string | undefined = undefined;
    let errorDetail = errorMessage;
    
    if (statusCode === 401 || statusCode === 403 || 
        errorMessage.includes('permission') || 
        errorMessage.includes('unauthorized') || 
        errorMessage.includes('access')) {
      fallbackModel = 'gpt-3.5-turbo';
      errorDetail = `No access to ${modelId} (permission denied). Using ${fallbackModel} as fallback.`;
    } else if (statusCode === 404 || errorMessage.includes('not found')) {
      fallbackModel = 'gpt-3.5-turbo';
      errorDetail = `Model ${modelId} not found. Using ${fallbackModel} as fallback.`;
    } else {
      // For other errors, still try to use the fallback model
      fallbackModel = 'gpt-3.5-turbo';
      errorDetail = `Error checking model: ${errorMessage}. Using ${fallbackModel} as fallback.`;
    }
    
    console.warn(`⚠️ [${requestId}] ${errorDetail}`);
    return { available: false, fallbackModel, error: errorDetail };
  }
}

/**
 * Analyze an image with GPT-4-Vision model, with fallback to GPT-3.5-Turbo if needed
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
}> {
  console.log(`📸 [${requestId}] Starting image analysis with GPT4V...`);
  console.log(`📊 [${requestId}] Goals: ${healthGoals.join(', ')}`);
  console.log(`🍽️ [${requestId}] Preferences: ${dietaryPreferences.join(', ')}`);
  console.log(`🖼️ [${requestId}] Image size: ~${Math.round(base64Image.length / 1024)}KB`);
  
  // Check if USE_GPT4_VISION is explicitly set (defaulting to true if not set)
  const forceGPT4V = process.env.USE_GPT4_VISION !== 'false';
  console.log(`⚙️ [${requestId}] GPT-4-Vision Mode: ${forceGPT4V ? 'FORCED' : 'FALLBACK ALLOWED'}`);
  
  // Check for the OpenAI API key
  const openAIApiKey = process.env.OPENAI_API_KEY;
  
  // Validate the API key
  if (!openAIApiKey || !validateOpenAIApiKey(openAIApiKey)) {
    const error = `Invalid or missing OpenAI API key format`;
    console.error(`❌ [${requestId}] ${error}`);
    return {
      analysis: createEmptyFallbackAnalysis(),
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
    const preferredModel = 'gpt-4-vision-preview';
    let modelToUse = preferredModel;
    let usedFallbackModel = false;
    
    // Handle model selection based on USE_GPT4_VISION flag
    if (forceGPT4V) {
      // If GPT-4-Vision is forced, check availability but don't fallback
      const modelCheck = await checkModelAvailability(openai, preferredModel, requestId);
      
      if (!modelCheck.available) {
        // If force mode is on but model isn't available, fail rather than fallback
        const error = `GPT-4-Vision is forced (USE_GPT4_VISION=true) but ${preferredModel} is not available: ${modelCheck.error}`;
        console.error(`❌ [${requestId}] ${error}`);
        
        return {
          analysis: createEmptyFallbackAnalysis(),
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
      const modelCheck = await checkModelAvailability(openai, preferredModel, requestId);
      
      if (!modelCheck.available && modelCheck.fallbackModel) {
        modelToUse = modelCheck.fallbackModel;
        usedFallbackModel = true;
        console.warn(`⚠️ [${requestId}] Using fallback model: ${modelToUse} (USE_GPT4_VISION=false)`);
      }
    }
    
    // Construct the system prompt
    const systemPrompt = `You are an expert nutritionist AI that analyzes meal images and provides detailed nutritional information and health advice.

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
      "calories": number (estimated kcal)
    },
    ...more ingredients
  ]
}

User Health Goals: ${healthGoals.join(', ')}
Dietary Preferences/Restrictions: ${dietaryPreferences.join(', ')}

NOTE: Be accurate but conservative with nutrient estimates. If you don't see food clearly, say so. RETURN ONLY VALID JSON. All numeric values should be numbers, not strings.
${usedFallbackModel ? '\nNOTE: This analysis is being performed by a fallback model with limited capabilities.' : ''}`;
    
    // Format the image URL correctly
    const formattedImage = base64Image.startsWith('data:image') 
      ? base64Image 
      : `data:image/jpeg;base64,${base64Image}`;

    // Make the OpenAI API request
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
              text: 'Analyze this meal image and provide nutritional information and health advice in JSON format.'
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
      max_tokens: 2000,
      temperature: 0.2,
      response_format: { type: 'json_object' }
    });
    
    console.log(`✅ [${requestId}] OpenAI API response received, model: ${modelToUse}, tokens: ${response.usage?.total_tokens || 'unknown'}`);
    
    // Extract the response content
    const responseContent = response.choices[0]?.message?.content || '';
    
    // Log a truncated version of the response (to avoid massive logs)
    const truncatedResponse = responseContent.length > 500 
      ? `${responseContent.substring(0, 500)}... (truncated)`
      : responseContent;
    console.log(`📋 [${requestId}] GPT Response: ${truncatedResponse}`);
    
    // Try to parse the JSON response
    let parsedResponse: Record<string, any>;
    try {
      parsedResponse = JSON.parse(responseContent);
      
      // Verify we have the required fields
      const requiredKeys = ['description', 'nutrients', 'feedback', 'suggestions', 'detailedIngredients'];
      const missingKeys = requiredKeys.filter(key => !parsedResponse[key]);
      
      if (missingKeys.length > 0) {
        console.error(`⚠️ [${requestId}] Missing required keys in GPT response: ${missingKeys.join(', ')}`);
        
        // We'll still return the partial response, but mark as not fully successful
        return {
          analysis: parsedResponse,
          success: false,
          error: `Incomplete analysis result: missing ${missingKeys.join(', ')}`,
          modelUsed: modelToUse,
          usedFallbackModel,
          forceGPT4V
        };
      }
      
      return {
        analysis: parsedResponse,
        success: true,
        modelUsed: modelToUse,
        usedFallbackModel,
        forceGPT4V
      };
    } catch (parseError) {
      console.error(`❌ [${requestId}] Failed to parse GPT response as JSON: ${(parseError as Error).message}`);
      
      // If we can't parse the JSON, return an empty analysis
      return {
        analysis: createEmptyFallbackAnalysis(),
        success: false,
        error: `Failed to parse response: ${(parseError as Error).message}`,
        modelUsed: modelToUse,
        usedFallbackModel,
        forceGPT4V
      };
    }
  } catch (error: any) {
    const errorMessage = error?.message || 'Unknown error';
    console.error(`❌ [${requestId}] GPT4V analysis failed: ${errorMessage}`);
    
    return {
      analysis: createEmptyFallbackAnalysis(),
      success: false,
      error: errorMessage,
      modelUsed: 'error',
      usedFallbackModel: false,
      forceGPT4V
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
  const requiredFields = [
    'description', 
    'nutrients', 
    'feedback', 
    'suggestions', 
    'detailedIngredients'
  ];
  
  for (const field of requiredFields) {
    if (!analysis[field]) {
      console.warn(`Analysis validation failed: missing '${field}'`);
      return false;
    }
  }
  
  // Check nutrients structure
  const requiredNutrients = [
    'calories', 'protein', 'carbs', 'fat'
  ];
  
  if (analysis.nutrients) {
    for (const nutrient of requiredNutrients) {
      if (typeof analysis.nutrients[nutrient] !== 'number') {
        console.warn(`Analysis validation failed: missing or invalid nutrient '${nutrient}'`);
        return false;
      }
    }
  }
  
  // Ensure arrays are present
  const requiredArrays = ['feedback', 'suggestions', 'detailedIngredients'];
  for (const arrayField of requiredArrays) {
    if (!Array.isArray(analysis[arrayField])) {
      console.warn(`Analysis validation failed: '${arrayField}' is not an array`);
      return false;
    }
  }
  
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
  const fallback = createEmptyFallbackAnalysis();
  
  // Add the reason to the fallback analysis
  fallback.warnings = [`Analysis failed: ${reason}`];
  
  // If we have partial data, try to incorporate valid parts
  if (partialAnalysis) {
    if (partialAnalysis.description && typeof partialAnalysis.description === 'string') {
      fallback.description = partialAnalysis.description;
    }
    
    // Try to salvage any valid detailed ingredients
    if (Array.isArray(partialAnalysis.detailedIngredients) && 
        partialAnalysis.detailedIngredients.length > 0) {
      fallback.detailedIngredients = partialAnalysis.detailedIngredients;
    }
    
    // Try to salvage any valid feedback
    if (Array.isArray(partialAnalysis.feedback) && 
        partialAnalysis.feedback.length > 0) {
      fallback.feedback = [...fallback.feedback, ...partialAnalysis.feedback];
    }
  }
  
  return fallback;
}

/**
 * Create an emergency fallback response for unexpected errors
 */
export function createEmergencyFallbackResponse(): any {
  return createEmptyFallbackAnalysis();
}