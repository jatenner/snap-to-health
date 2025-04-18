/**
 * This file contains stub implementations of analysis functions
 * to allow the app to compile and unblock the Vercel build.
 */

import OpenAI from 'openai';
import crypto from 'crypto';

// Interface definitions
interface Nutrient {
  name: string;
  value: string;
  unit: string;
  isHighlight: boolean;
  percentOfDailyValue?: number;
  amount?: number;
}

interface DetailedIngredient {
  name: string;
  category: string;
  confidence: number;
  confidenceEmoji?: string;
}

interface AnalysisResult {
  description?: string;
  nutrients?: Nutrient[];
  feedback?: string;
  suggestions?: string[];
  detailedIngredients?: DetailedIngredient[];
  goalScore: {
    overall: number;
    specific: Record<string, number>;
  };
  metadata: {
    requestId: string;
    modelUsed: string;
    usedFallbackModel: boolean;
    processingTime: number;
    confidence: number;
    error: string;
    imageQuality: string;
    isPartialResult?: boolean;
    extractedFromText?: boolean;
    generatedAt?: string;
    recoveryAttempted: boolean;
    partialFieldsExtracted?: string;
    fallback: boolean;
  };
}

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
export function createEmptyFallbackAnalysis(
  requestId: string = crypto.randomUUID(), 
  modelUsed: string = 'fallback', 
  errorMessage: string = 'Analysis failed'
): AnalysisResult {
  return {
    description: "Unable to analyze the image at this time.",
    nutrients: [
      { name: 'calories', value: '0', unit: 'kcal', isHighlight: true },
      { name: 'protein', value: '0', unit: 'g', isHighlight: true },
      { name: 'carbs', value: '0', unit: 'g', isHighlight: true },
      { name: 'fat', value: '0', unit: 'g', isHighlight: true }
    ],
    feedback: "We couldn't process your image. Please try again with a clearer photo of your meal.",
    suggestions: ["Try taking the photo in better lighting", "Make sure your meal is clearly visible"],
    detailedIngredients: [
      { name: "Unknown food item", category: "Unknown", confidence: 0 }
    ],
    goalScore: {
      overall: 0,
      specific: {} as Record<string, number>,
    },
    metadata: {
      requestId,
      modelUsed,
      usedFallbackModel: true,
      processingTime: 0,
      confidence: 0,
      error: errorMessage,
      imageQuality: "unknown",
      recoveryAttempted: true,
      generatedAt: new Date().toISOString(),
      fallback: true  // Explicit flag to indicate this is a fallback response
    }
  };
}

/**
 * Check if a model is available for the OpenAI API key
 * @param openai Initialized OpenAI client
 * @param modelId Model ID to check (e.g., "gpt-4o")
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
      fallbackModel = 'gpt-4-vision-preview';
      errorDetail = `No access to ${modelId} (permission denied). Using ${fallbackModel} as fallback.`;
    } else if (statusCode === 404 || errorMessage.includes('not found') || errorMessage.includes('deprecated')) {
      fallbackModel = 'gpt-4-vision-preview';
      errorDetail = `Model ${modelId} not found or deprecated. Using ${fallbackModel} as fallback.`;
    } else {
      // For other errors, still try to use the fallback model
      fallbackModel = 'gpt-4-vision-preview';
      errorDetail = `Error checking model: ${errorMessage}. Using ${fallbackModel} as fallback.`;
    }
    
    console.warn(`⚠️ [${requestId}] ${errorDetail}`);
    return { available: false, fallbackModel, error: errorDetail };
  }
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
  console.log(`📸 [${requestId}] Starting image analysis with GPT4o...`);
  console.log(`📊 [${requestId}] Goals: ${healthGoals.join(', ')}`);
  console.log(`🍽️ [${requestId}] Preferences: ${dietaryPreferences.join(', ')}`);
  console.log(`🖼️ [${requestId}] Image size: ~${Math.round(base64Image.length / 1024)}KB`);
  
  // Check if USE_GPT4_VISION is explicitly set (defaulting to true if not set)
  const forceGPT4V = process.env.USE_GPT4_VISION !== 'false';
  console.log(`⚙️ [${requestId}] GPT-4o Mode: ${forceGPT4V ? 'FORCED' : 'FALLBACK ALLOWED'}`);
  
  // Check for the OpenAI API key
  const openAIApiKey = process.env.OPENAI_API_KEY;
  
  // Validate the API key
  if (!openAIApiKey || !validateOpenAIApiKey(openAIApiKey)) {
    const error = `Invalid or missing OpenAI API key format`;
    console.error(`❌ [${requestId}] ${error}`);
    return {
      analysis: createEmptyFallbackAnalysis(requestId, 'none', error),
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
    const preferredModel = 'gpt-4o';
    let modelToUse = preferredModel;
    let usedFallbackModel = false;
    
    // Handle model selection based on USE_GPT4_VISION flag
    if (forceGPT4V) {
      // If GPT-4o is forced, check availability but don't fallback
      const modelCheck = await checkModelAvailability(openai, preferredModel, requestId);
      
      if (!modelCheck.available) {
        // If force mode is on but model isn't available, fail rather than fallback
        const error = `GPT-4o is forced (USE_GPT4_VISION=true) but ${preferredModel} is not available: ${modelCheck.error}`;
        console.error(`❌ [${requestId}] ${error}`);
        
        return {
          analysis: createEmptyFallbackAnalysis(requestId, 'error', error),
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

GOAL: Analyze the food in the image and return a JSON object with EXACTLY the following structure:
{
  "description": "Detailed description of the meal and its components",
  "nutrients": [
    {
      "name": "calories",
      "value": "500",
      "unit": "kcal", 
      "isHighlight": true
    },
    {
      "name": "protein",
      "value": "20",
      "unit": "g",
      "isHighlight": true
    },
    {
      "name": "carbs",
      "value": "40",
      "unit": "g",
      "isHighlight": false
    },
    {
      "name": "fat",
      "value": "10",
      "unit": "g",
      "isHighlight": false
    }
  ],
  "feedback": "Detailed feedback about the nutritional value of this meal",
  "suggestions": [
    "Suggestion 1 to improve nutritional value",
    "Suggestion 2 to improve nutritional value"
  ],
  "detailedIngredients": [
    {
      "name": "Ingredient name",
      "category": "Protein/Carb/Fat/Vegetable/Fruit",
      "confidence": 0.9
    }
  ],
  "goalScore": {
    "overall": 75,
    "specific": {
      "weightLoss": 60,
      "muscleBuilding": 80
    }
  }
}

CRITICAL REQUIREMENTS:
1. The "nutrients" field MUST be an ARRAY of objects, not an object
2. Each nutrient must have the fields: name, value (as string), unit, and isHighlight
3. "feedback" must be a string (not an array)
4. "suggestions" must be an array of strings
5. "detailedIngredients" must be an array of objects
6. "goalScore" must have both "overall" (number 0-100) and "specific" (object with string keys and number values)
7. STRICTLY follow this format - the application WILL FAIL if you don't

User Health Goals: ${healthGoals.join(', ')}
Dietary Preferences/Restrictions: ${dietaryPreferences.join(', ')}

Return ONLY the valid JSON object - DO NOT include markdown code blocks, explanations, or any other text.`;
    
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
      
      // Verify we have the required fields
      const requiredKeys = ['description', 'nutrients', 'feedback', 'suggestions', 'detailedIngredients', 'goalScore'];
      const missingKeys = requiredKeys.filter(key => !parsedResponse[key]);
      
      if (missingKeys.length > 0) {
        console.error(`⚠️ [${requestId}] Missing required keys in GPT response: ${missingKeys.join(', ')}`);
        
        // Create a fixed response that fills in missing fields
        const fallbackAnalysis = createPartialFallbackAnalysis(responseContent, requestId, modelToUse, false, parsedResponse);
        
        return {
          analysis: fallbackAnalysis,
          success: false, 
          error: `Incomplete analysis result: missing ${missingKeys.join(', ')}`,
          modelUsed: modelToUse,
          usedFallbackModel,
          forceGPT4V,
          rawResponse: responseContent
        };
      }
      
      // Ensure nutrients are in the correct array format
      if (parsedResponse.nutrients) {
        // If nutrients is an object (old format), convert to array format
        if (!Array.isArray(parsedResponse.nutrients) && typeof parsedResponse.nutrients === 'object') {
          console.log(`⚠️ [${requestId}] Converting nutrients from object to array format`);
          
          const nutrientsArray: Nutrient[] = [];
          const nutrientsObj = parsedResponse.nutrients;
          
          // Convert each nutrient key to an array item
          Object.keys(nutrientsObj).forEach(key => {
            if (nutrientsObj[key] !== null && nutrientsObj[key] !== undefined) {
              nutrientsArray.push({
                name: key,
                value: String(nutrientsObj[key]), // Ensure value is a string
                unit: key === 'calories' ? 'kcal' : key === 'sodium' ? 'mg' : 'g',
                isHighlight: ['calories', 'protein', 'carbs', 'fat'].includes(key)
              });
            }
          });
          
          // Replace the original nutrients object with the array
          parsedResponse.nutrients = nutrientsArray;
        }
        
        // Ensure values are strings
        if (Array.isArray(parsedResponse.nutrients)) {
          parsedResponse.nutrients = parsedResponse.nutrients.map(nutrient => ({
            ...nutrient,
            value: String(nutrient.value) // Ensure value is a string
          }));
        }
      }
      
      // Handle feedback as string or array
      if (Array.isArray(parsedResponse.feedback)) {
        console.log(`⚠️ [${requestId}] Converting feedback from array to string`);
        parsedResponse.feedback = parsedResponse.feedback.join('. ');
      }
      
      // Ensure goalScore has the right structure
      if (parsedResponse.goalScore) {
        if (typeof parsedResponse.goalScore === 'number') {
          // If goalScore is just a number, convert to the expected object structure
          console.log(`⚠️ [${requestId}] Converting goalScore from number to object`);
          const scoreValue = parsedResponse.goalScore;
          parsedResponse.goalScore = {
            overall: scoreValue,
            specific: {} as Record<string, number>
          };
        } else if (!parsedResponse.goalScore.specific) {
          // Ensure specific exists
          parsedResponse.goalScore.specific = {} as Record<string, number>;
        }
        
        // Add health goals as specific scores if missing
        if (Object.keys(parsedResponse.goalScore.specific).length === 0 && healthGoals.length > 0) {
          healthGoals.forEach(goal => {
            const normalizedGoal = goal.toLowerCase().replace(/\s+/g, '');
            parsedResponse.goalScore.specific[normalizedGoal] = parsedResponse.goalScore.overall || 50;
          });
        }
      } else {
        // Create default goalScore if missing
        parsedResponse.goalScore = {
          overall: 50,
          specific: {} as Record<string, number>
        };
      }
      
      return {
        analysis: parsedResponse,
        success: true,
        modelUsed: modelToUse,
        usedFallbackModel,
        forceGPT4V,
        rawResponse: responseContent
      };
    } catch (parseError) {
      console.error(`❌ [${requestId}] Failed to parse GPT response as JSON: ${(parseError as Error).message}`);
      console.error(`❌ [${requestId}] Raw non-JSON response: ${responseContent}`);
      
      // Attempt to extract JSON from the text
      try {
        console.log(`🔄 [${requestId}] Attempting to extract JSON from text response`);
        const extractedJson = extractJSONFromText(responseContent);
        
        if (extractedJson) {
          console.log(`✅ [${requestId}] Successfully extracted JSON from text response`);
          // Create a partial fallback using the extracted JSON
          const fallbackAnalysis = createPartialFallbackAnalysis(responseContent, requestId, modelToUse, true, extractedJson);
          
          return {
            analysis: fallbackAnalysis,
            success: false,
            error: `Extracted JSON from malformed response`,
            modelUsed: modelToUse,
            usedFallbackModel: true,
            forceGPT4V,
            rawResponse: responseContent
          };
        }
      } catch (extractError) {
        console.error(`❌ [${requestId}] Failed to extract JSON from text: ${(extractError as Error).message}`);
      }
      
      // If we can't parse the JSON, return an empty analysis
      return {
        analysis: createEmptyFallbackAnalysis(requestId, modelToUse, `Failed to parse response: ${(parseError as Error).message}`),
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
      analysis: createEmptyFallbackAnalysis(requestId, 'error', errorMessage),
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
 * Enrich an analysis result with additional data or defaults for any missing required fields
 * This function ensures all required fields exist with at least default values
 */
export function enrichAnalysisResult(analysis: any, shouldLog = true): any {
  if (!analysis) {
    console.warn('Cannot enrich null or undefined analysis');
    return null;
  }

  if (shouldLog) {
    console.log(`Enriching analysis result - input structure:`, 
      Object.keys(analysis).map(k => `${k}: ${typeof analysis[k]}`).join(', '));
  }

  // Create a safe copy to avoid mutating the original
  const enriched = { ...analysis };
  
  // Ensure metadata exists
  if (!enriched.metadata) {
    enriched.metadata = {};
  }
  
  // Add enrichment metadata
  enriched.metadata.enrichedAt = new Date().toISOString();
  enriched.metadata.wasEnriched = true;

  // Ensure description exists
  if (!enriched.description) {
    enriched.description = "This food appears to be a meal, but details couldn't be fully analyzed.";
    enriched.metadata.descriptionWasDefault = true;
  }

  // Handle nutrients in different formats and ensure they exist
  if (!enriched.nutrients) {
    // Create default nutrients if missing entirely
    enriched.nutrients = [
      { name: 'calories', value: 0, unit: 'kcal', isHighlight: true },
      { name: 'protein', value: 0, unit: 'g', isHighlight: true },
      { name: 'carbs', value: 0, unit: 'g', isHighlight: true },
      { name: 'fat', value: 0, unit: 'g', isHighlight: true }
    ];
    enriched.metadata.nutrientsWereDefault = true;
  } else if (typeof enriched.nutrients === 'object' && !Array.isArray(enriched.nutrients)) {
    // Convert object format to array format
    try {
      const nutrientsObj = enriched.nutrients;
      const nutrientsArray = [];
      
      // Process required nutrients
      const requiredNutrients = [
        { key: 'calories', unit: 'kcal' },
        { key: 'protein', unit: 'g' },
        { key: 'carbs', unit: 'g' },
        { key: 'fat', unit: 'g' }
      ];
      
      for (const { key, unit } of requiredNutrients) {
        let value = nutrientsObj[key];
        
        // Handle various value formats
        if (value === undefined || value === null) {
          value = 0;
        } else if (typeof value === 'string') {
          // Try to parse number from string, removing non-numeric characters
          const numericValue = parseFloat(value.replace(/[^\d.-]/g, ''));
          value = isNaN(numericValue) ? 0 : numericValue;
        } else if (typeof value !== 'number') {
          value = 0;
        }
        
        nutrientsArray.push({
          name: key,
          value,
          unit,
          isHighlight: true
        });
      }
      
      // Add any other nutrients found in the object
      for (const key in nutrientsObj) {
        if (!['calories', 'protein', 'carbs', 'fat'].includes(key)) {
          let value = nutrientsObj[key];
          
          // Skip non-numeric or null values
          if (value === null || value === undefined) continue;
          
          // Try to parse if string
          if (typeof value === 'string') {
            const numericValue = parseFloat(value.replace(/[^\d.-]/g, ''));
            if (isNaN(numericValue)) continue;
            value = numericValue;
          } else if (typeof value !== 'number') {
            continue;
          }
          
          nutrientsArray.push({
            name: key,
            value,
            unit: key.includes('calories') ? 'kcal' : 'g',
            isHighlight: false
          });
        }
      }
      
      enriched.nutrients = nutrientsArray;
      enriched.metadata.nutrientsWereConverted = true;
    } catch (error) {
      console.error('Error converting nutrients object to array:', error);
      // Fallback to default nutrients
      enriched.nutrients = [
        { name: 'calories', value: 0, unit: 'kcal', isHighlight: true },
        { name: 'protein', value: 0, unit: 'g', isHighlight: true },
        { name: 'carbs', value: 0, unit: 'g', isHighlight: true },
        { name: 'fat', value: 0, unit: 'g', isHighlight: true }
      ];
      enriched.metadata.nutrientsWereDefault = true;
    }
  } else if (Array.isArray(enriched.nutrients)) {
    // Ensure required nutrients exist in the array
    const requiredNutrients = ['calories', 'protein', 'carbs', 'fat'];
    const existingNutrients = new Set(
      enriched.nutrients
        .filter((n: any) => n && typeof n === 'object' && n.name)
        .map((n: any) => n.name.toLowerCase())
    );
    
    // Add missing nutrients with default values
    for (const nutrient of requiredNutrients) {
      if (!existingNutrients.has(nutrient)) {
        enriched.nutrients.push({
          name: nutrient,
          value: 0,
          unit: nutrient === 'calories' ? 'kcal' : 'g',
          isHighlight: true
        });
        
        if (!enriched.metadata.addedMissingNutrients) {
          enriched.metadata.addedMissingNutrients = [];
        }
        enriched.metadata.addedMissingNutrients.push(nutrient);
      }
    }
    
    // Ensure each nutrient has the correct structure
    enriched.nutrients = enriched.nutrients.map((nutrient: any) => {
      if (!nutrient || typeof nutrient !== 'object') {
        return { name: 'unknown', value: 0, unit: 'g', isHighlight: false };
      }
      
      // Ensure value is a number
      let value = nutrient.value;
      if (value === undefined || value === null) {
        value = 0;
      } else if (typeof value === 'string') {
        const numericValue = parseFloat(value.replace(/[^\d.-]/g, ''));
        value = isNaN(numericValue) ? 0 : numericValue;
      } else if (typeof value !== 'number') {
        value = 0;
      }
      
      return {
        name: nutrient.name || 'unknown',
        value,
        unit: nutrient.unit || (nutrient.name?.toLowerCase() === 'calories' ? 'kcal' : 'g'),
        isHighlight: nutrient.isHighlight === true
      };
    });
  }

  // Ensure feedback exists
  if (!enriched.feedback) {
    enriched.feedback = "We couldn't fully analyze this meal, but eating a balanced diet with plenty of vegetables, lean proteins, and whole grains is always recommended.";
    enriched.metadata.feedbackWasDefault = true;
  } else if (Array.isArray(enriched.feedback) && enriched.feedback.length === 0) {
    // Convert empty array to default string
    enriched.feedback = "We couldn't fully analyze this meal, but eating a balanced diet with plenty of vegetables, lean proteins, and whole grains is always recommended.";
    enriched.metadata.feedbackWasDefault = true;
  } else if (Array.isArray(enriched.feedback)) {
    // Convert array to string if needed
    enriched.feedback = enriched.feedback
      .filter((item: any) => typeof item === 'string')
      .join('\n\n');
    enriched.metadata.feedbackWasJoined = true;
  }

  // Ensure suggestions exist
  if (!enriched.suggestions || !Array.isArray(enriched.suggestions) || enriched.suggestions.length === 0) {
    enriched.suggestions = [
      "Consider including more colorful vegetables in your meals for additional nutrients",
      "Stay hydrated by drinking water with your meals",
      "Be mindful of portion sizes for a balanced diet"
    ];
    enriched.metadata.suggestionsWereDefault = true;
  } else {
    // Ensure each suggestion is a string
    enriched.suggestions = enriched.suggestions
      .filter((suggestion: any) => suggestion)
      .map((suggestion: any) => {
        if (typeof suggestion === 'string') return suggestion;
        if (typeof suggestion === 'object' && suggestion.text) return suggestion.text;
        return String(suggestion);
      });
  }

  // Ensure detailedIngredients exist
  if (!enriched.detailedIngredients || !Array.isArray(enriched.detailedIngredients)) {
    enriched.detailedIngredients = [];
    enriched.metadata.detailedIngredientsWereDefault = true;
  }

  // Handle goal score (optional)
  if (enriched.goalScore !== undefined) {
    // Normalize the goalScore structure
    if (typeof enriched.goalScore === 'number') {
      // Convert number to object format
      const score = Math.max(0, Math.min(100, enriched.goalScore));
      enriched.goalScore = {
        overall: score,
        explanation: `Overall nutrition score: ${score}/100`
      };
      enriched.metadata.goalScoreWasConverted = true;
    } else if (typeof enriched.goalScore === 'object') {
      // Ensure proper structure
      if (typeof enriched.goalScore.overall !== 'number') {
        enriched.goalScore.overall = 50; // Default middle score
        enriched.metadata.goalScoreOverallWasDefault = true;
      }
      
      if (!enriched.goalScore.explanation) {
        enriched.goalScore.explanation = `Overall nutrition score: ${enriched.goalScore.overall}/100`;
        enriched.metadata.goalScoreExplanationWasDefault = true;
      }
    } else {
      // Invalid format, create default
      enriched.goalScore = {
        overall: 50,
        explanation: "Overall nutrition score: 50/100"
      };
      enriched.metadata.goalScoreWasDefault = true;
    }
  }

  if (shouldLog) {
    console.log(`Enriched analysis result: ${Object.keys(enriched).length} fields, metadata:`, enriched.metadata);
  }

  return enriched;
}

/**
 * Validate that a GPT analysis result has all required fields
 * This is a lenient validation that will try to accept data in multiple formats
 * @param analysis Analysis result to validate
 * @returns Boolean indicating if the analysis is valid
 */
export function validateGptAnalysisResult(analysis: any): boolean {
  if (!analysis) {
    console.warn(`Analysis validation failed: analysis is null or undefined`);
    return false;
  }
  
  // Track missing fields for detailed error reporting
  const missingFields: string[] = [];
  const invalidFields: string[] = [];
  
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
      missingFields.push(field);
      console.warn(`Analysis validation failed: missing '${field}'`);
    }
  }
  
  // Handle nutrients in different formats
  if (analysis.nutrients) {
    // Case 1: nutrients is an object with direct properties
    if (typeof analysis.nutrients === 'object' && !Array.isArray(analysis.nutrients)) {
      const requiredNutrients = ['calories', 'protein', 'carbs', 'fat'];
      const missingNutrients: string[] = [];
      
      for (const nutrient of requiredNutrients) {
        // Allow both numeric and string values that can be parsed to numbers
        const value = analysis.nutrients[nutrient];
        const isValidNumber = 
          (typeof value === 'number') || 
          (typeof value === 'string' && !isNaN(parseFloat(value)));
        
        if (!isValidNumber) {
          missingNutrients.push(nutrient);
          console.warn(`Analysis validation: missing or invalid nutrient '${nutrient}', value: ${value}, type: ${typeof value}`);
        }
      }
      
      if (missingNutrients.length > 0) {
        invalidFields.push(`nutrients (missing: ${missingNutrients.join(', ')})`);
      }
    } 
    // Case 2: nutrients is an array of objects
    else if (Array.isArray(analysis.nutrients)) {
      // Map nutrient names to values for validation
      const nutrientMap = new Map<string, any>();
      
      // Map nutrient names to values
      for (const item of analysis.nutrients) {
        if (item && typeof item === 'object' && item.name) {
          nutrientMap.set(item.name.toLowerCase(), item);
        }
      }
      
      // Check for required nutrients
      const requiredNutrients = ['calories', 'protein', 'carbs', 'fat'];
      const missingNutrients: string[] = [];
      
      for (const nutrient of requiredNutrients) {
        if (!nutrientMap.has(nutrient)) {
          missingNutrients.push(nutrient);
          console.warn(`Analysis validation: required nutrient '${nutrient}' not found in nutrients array`);
        }
      }
      
      if (missingNutrients.length > 0) {
        invalidFields.push(`nutrients array (missing: ${missingNutrients.join(', ')})`);
      }
    } 
    // Neither object nor array - invalid format
    else {
      invalidFields.push('nutrients (invalid format)');
      console.warn(`Analysis validation failed: 'nutrients' is neither an object nor an array`);
    }
  }
  
  // Validate suggestions array
  if (analysis.suggestions) {
    if (!Array.isArray(analysis.suggestions)) {
      invalidFields.push('suggestions (not an array)');
      console.warn(`Analysis validation failed: 'suggestions' is not an array`);
    } else if (analysis.suggestions.length === 0) {
      invalidFields.push('suggestions (empty array)');
      console.warn(`Analysis validation warning: 'suggestions' array is empty`);
    }
  }
  
  // Validate detailed ingredients array
  if (analysis.detailedIngredients) {
    if (!Array.isArray(analysis.detailedIngredients)) {
      invalidFields.push('detailedIngredients (not an array)');
      console.warn(`Analysis validation failed: 'detailedIngredients' is not an array`);
    } else if (analysis.detailedIngredients.length === 0) {
      // This is just a warning, not a fatal error
      console.warn(`Analysis validation warning: 'detailedIngredients' array is empty`);
    }
  }
  
  // Handle feedback which can be either string or array
  if (analysis.feedback) {
    if (typeof analysis.feedback !== 'string' && !Array.isArray(analysis.feedback)) {
      invalidFields.push('feedback (invalid type)');
      console.warn(`Analysis validation failed: 'feedback' is neither a string nor an array`);
    }
  }
  
  // Check goalScore if present (this is optional but should have correct structure if provided)
  if (analysis.goalScore) {
    if (typeof analysis.goalScore === 'number') {
      // Acceptable, will be converted to object structure in normalization
    } else if (typeof analysis.goalScore === 'object') {
      // Expected structure, check if overall score is present
      if (typeof analysis.goalScore.overall !== 'number') {
        console.warn(`Analysis validation warning: 'goalScore.overall' is not a number`);
        // Not a fatal error
      }
    } else {
      invalidFields.push('goalScore (invalid type)');
      console.warn(`Analysis validation failed: 'goalScore' has invalid type: ${typeof analysis.goalScore}`);
    }
  }
  
  // Determine if analysis is valid despite some issues
  const isValid = missingFields.length === 0 && invalidFields.length === 0;
  
  // Enhanced logging for visibility
  if (!isValid) {
    console.warn(`Analysis validation summary:
    - Missing fields: ${missingFields.length > 0 ? missingFields.join(', ') : 'None'}
    - Invalid fields: ${invalidFields.length > 0 ? invalidFields.join(', ') : 'None'}
    - Overall validation: ${isValid ? 'PASSED' : 'FAILED'}`);
  } else {
    console.log(`✅ Analysis validation: All required fields present and valid`);
  }
  
  // If no critical failures, consider the analysis valid
  // Let's be more lenient and allow analysis with minor issues
  return missingFields.length === 0 && 
         (!analysis.nutrients || invalidFields.filter(f => f.startsWith('nutrients')).length === 0);
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
  const fallback = createEmptyFallbackAnalysis(crypto.randomUUID(), 'fallback', reason);
  
  // Add the reason to the fallback analysis
  fallback.metadata.error = reason;
  
  // If we have partial data, try to incorporate valid parts
  if (partialAnalysis) {
    // Description
    if (partialAnalysis.description && typeof partialAnalysis.description === 'string') {
      fallback.description = partialAnalysis.description;
    }
    
    // Try to salvage any valid nutrients
    if (partialAnalysis.nutrients) {
      if (Array.isArray(partialAnalysis.nutrients)) {
        // If nutrients is already an array, use it directly
        fallback.nutrients = partialAnalysis.nutrients;
      } else if (typeof partialAnalysis.nutrients === 'object') {
        // If nutrients is an object, convert to array format
        const validNutrients = ['calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'sodium'];
        const nutrientsArray: Nutrient[] = [];
        
        validNutrients.forEach(nutrient => {
          if (typeof partialAnalysis.nutrients[nutrient] === 'number') {
            nutrientsArray.push({
              name: nutrient,
              value: partialAnalysis.nutrients[nutrient].toString(),
              unit: nutrient === 'calories' ? 'kcal' : 'g',
              isHighlight: false
            });
          }
        });
        
        fallback.nutrients = nutrientsArray;
      }
    }
    
    // Try to salvage any valid detailed ingredients
    if (Array.isArray(partialAnalysis.detailedIngredients) && 
        partialAnalysis.detailedIngredients.length > 0) {
      fallback.detailedIngredients = partialAnalysis.detailedIngredients;
    }
    
    // Try to salvage any valid feedback
    if (typeof partialAnalysis.feedback === 'string') {
      fallback.feedback = partialAnalysis.feedback;
    } else if (Array.isArray(partialAnalysis.feedback) && 
        partialAnalysis.feedback.length > 0) {
      // Join array into string if the feedback is an array
      fallback.feedback = partialAnalysis.feedback.join(". ");
    }
    
    // Try to salvage any valid suggestions
    if (Array.isArray(partialAnalysis.suggestions) && 
        partialAnalysis.suggestions.length > 0) {
      fallback.suggestions = partialAnalysis.suggestions;
    }
  }
  
  return fallback;
}

/**
 * Create an emergency fallback response for unexpected errors
 */
export function createEmergencyFallbackResponse(): any {
  return {
    description: "We're unable to analyze your meal at this time.",
    nutrients: [] as Nutrient[],
    feedback: "Our systems are experiencing high load. Please try again in a few minutes.",
    suggestions: [
      "Try again with a clearer photo",
      "Make sure the lighting is good",
      "Ensure your meal is visible in the frame"
    ],
    detailedIngredients: [] as DetailedIngredient[],
    goalScore: {
      overall: 0,
      specific: {} as Record<string, number>
    },
    metadata: {
      requestId: crypto.randomUUID(),
      modelUsed: "emergency_fallback",
      usedFallbackModel: true, 
      processingTime: 0,
      confidence: 0,
      error: "Emergency fallback triggered",
      imageQuality: "unknown"
    }
  };
}

/**
 * Extracts JSON from text, attempting to handle malformed JSON responses
 * using multiple extraction strategies
 */
function extractJSONFromText(text: string): any | null {
  if (!text || typeof text !== 'string') {
    console.warn('extractJSONFromText: Invalid input - not a string or empty');
    return null;
  }

  const textLength = text.length;
  console.log(`Attempting to extract JSON from text (length: ${textLength})`);
  
  // Store extraction attempts and results for debugging
  const extractionAttempts: Array<{strategy: string, result: 'success' | 'failure', reason?: string}> = [];
  
  // First attempt: direct parsing if it's already valid JSON
  try {
    const directParse = JSON.parse(text);
    extractionAttempts.push({strategy: 'direct_parse', result: 'success'});
    console.log('Successfully parsed text directly as JSON');
    return directParse;
  } catch (initialError) {
    extractionAttempts.push({
      strategy: 'direct_parse', 
      result: 'failure', 
      reason: initialError instanceof Error ? initialError.message : 'Unknown error'
    });
    // Not valid JSON, continue with extraction attempts
  }
  
  // Second attempt: extract JSON between curly braces (most common case)
  try {
    // Look for the outermost JSON object pattern - handling nested objects
    const jsonMatches = text.match(/\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\}/g);
    
    if (jsonMatches && jsonMatches.length > 0) {
      // Try to parse each potential JSON object, starting with the longest one
      // (which is likely the most complete)
      const sortedMatches = [...jsonMatches].sort((a, b) => b.length - a.length);
      
      for (const match of sortedMatches) {
        try {
          const parsed = JSON.parse(match);
          extractionAttempts.push({strategy: 'curly_braces', result: 'success'});
          console.log(`Successfully parsed JSON from curly braces match (length: ${match.length})`);
          return parsed;
        } catch (matchError) {
          // Try with cleaning
          try {
            // Clean the matched content before parsing
            let cleanedText = match
              .replace(/(\r\n|\n|\r)/gm, '') // Remove line breaks
              .replace(/,\s*}/g, '}')        // Remove trailing commas
              .replace(/,\s*]/g, ']')        // Remove trailing commas in arrays
              .replace(/'/g, '"')            // Replace single quotes with double quotes
              .replace(/\\([^"\\\/bfnrtu])/g, '$1') // Fix invalid escapes
              .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3'); // Quote unquoted keys
              
            const parsedCleaned = JSON.parse(cleanedText);
            extractionAttempts.push({strategy: 'curly_braces_cleaned', result: 'success'});
            console.log(`Successfully parsed JSON from cleaned curly braces match (length: ${cleanedText.length})`);
            return parsedCleaned;
          } catch (cleanError) {
            // Continue to next match
            extractionAttempts.push({
              strategy: 'curly_braces_cleaned', 
              result: 'failure', 
              reason: cleanError instanceof Error ? cleanError.message : 'Unknown error'
            });
          }
        }
      }
    }
    
    // Third attempt: look for code blocks (```json ... ```) - common in newer models
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      try {
        const parsed = JSON.parse(codeBlockMatch[1]);
        extractionAttempts.push({strategy: 'code_block', result: 'success'});
        console.log(`Successfully parsed JSON from code block (length: ${codeBlockMatch[1].length})`);
        return parsed;
      } catch (codeBlockError) {
        extractionAttempts.push({
          strategy: 'code_block', 
          result: 'failure', 
          reason: codeBlockError instanceof Error ? codeBlockError.message : 'Unknown error'
        });
        
        // Try cleaning code block
        try {
          const cleanedCodeBlock = codeBlockMatch[1]
            .replace(/(\r\n|\n|\r)/gm, '')
            .replace(/,\s*}/g, '}')
            .replace(/,\s*]/g, ']')
            .replace(/'/g, '"')
            .replace(/\\([^"\\\/bfnrtu])/g, '$1')
            .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3');
            
          const parsedCleanedBlock = JSON.parse(cleanedCodeBlock);
          extractionAttempts.push({strategy: 'code_block_cleaned', result: 'success'});
          console.log(`Successfully parsed JSON from cleaned code block (length: ${cleanedCodeBlock.length})`);
          return parsedCleanedBlock;
        } catch (cleanBlockError) {
          extractionAttempts.push({
            strategy: 'code_block_cleaned', 
            result: 'failure', 
            reason: cleanBlockError instanceof Error ? cleanBlockError.message : 'Unknown error'
          });
        }
      }
    }
    
    // Fourth attempt: extract structured key-value pairs to create partial object
    try {
      const partialObject: Record<string, any> = {};
      let extractionCount = 0;
      
      // Extract top-level fields with various formats
      const fieldPatterns = [
        // "key": "string value"
        /"([^"]+)"\s*:\s*"([^"]+)"/g,
        // "key": number
        /"([^"]+)"\s*:\s*(-?\d+(?:\.\d+)?)/g,
        // "key": [array]
        /"([^"]+)"\s*:\s*(\[[^\]]*\])/g,
        // "key": {object}
        /"([^"]+)"\s*:\s*(\{[^}]*\})/g,
        // key: "string value" (unquoted keys)
        /([a-zA-Z_]\w*)\s*:\s*"([^"]+)"/g,
        // key: number (unquoted keys)
        /([a-zA-Z_]\w*)\s*:\s*(-?\d+(?:\.\d+)?)/g
      ];
      
      // Process each pattern
      for (const pattern of fieldPatterns) {
        let match;
        // Reset RegExp lastIndex
        pattern.lastIndex = 0;
        
        while ((match = pattern.exec(text)) !== null) {
          const key = match[1];
          const valueStr = match[2];
          
          if (key && valueStr) {
            try {
              // Try to parse as JSON if it looks like an object or array
              if ((valueStr.startsWith('{') && valueStr.endsWith('}')) || 
                  (valueStr.startsWith('[') && valueStr.endsWith(']'))) {
                try {
                  partialObject[key] = JSON.parse(valueStr);
                } catch {
                  // If parsing fails, store as string
                  partialObject[key] = valueStr;
                }
              } else if (!isNaN(Number(valueStr)) && valueStr.trim() !== '') {
                // Parse as number if it looks like a number
                partialObject[key] = Number(valueStr);
              } else {
                // Otherwise keep as string
                partialObject[key] = valueStr;
              }
              extractionCount++;
            } catch (valueParseError) {
              // If parsing fails, use string value
              partialObject[key] = valueStr;
              extractionCount++;
            }
          }
        }
      }
      
      // Special handling for arrays like "suggestions": ["item1", "item2"]
      const arrayPattern = /"([^"]+)"\s*:\s*\[([\s\S]*?)\]/g;
      let arrayMatch;
      while ((arrayMatch = arrayPattern.exec(text)) !== null) {
        const key = arrayMatch[1];
        const arrayContent = arrayMatch[2];
        
        if (key && arrayContent && !partialObject[key]) {
          // Extract array items
          const itemsPattern = /"([^"]+)"/g;
          const items: string[] = [];
          let itemMatch;
          
          while ((itemMatch = itemsPattern.exec(arrayContent)) !== null) {
            items.push(itemMatch[1]);
          }
          
          if (items.length > 0) {
            partialObject[key] = items;
            extractionCount++;
          }
        }
      }
      
      // Special handling for nested objects
      const nestedObjectPattern = /"([^"]+)"\s*:\s*\{([\s\S]*?)\}/g;
      let objectMatch;
      while ((objectMatch = nestedObjectPattern.exec(text)) !== null) {
        const key = objectMatch[1];
        const objectContent = objectMatch[2];
        
        if (key && objectContent && !partialObject[key]) {
          // Try to parse the nested object
          try {
            const nestedObj = JSON.parse(`{${objectContent}}`);
            partialObject[key] = nestedObj;
            extractionCount++;
          } catch {
            // If parsing fails, try to extract key-value pairs
            const nestedKVObject: Record<string, any> = {};
            const kvPattern = /"([^"]+)"\s*:\s*("[^"]+"|[0-9]+)/g;
            let kvMatch;
            
            while ((kvMatch = kvPattern.exec(objectContent)) !== null) {
              const nestedKey = kvMatch[1];
              const nestedValue = kvMatch[2];
              
              if (nestedKey && nestedValue) {
                if (nestedValue.startsWith('"') && nestedValue.endsWith('"')) {
                  nestedKVObject[nestedKey] = nestedValue.slice(1, -1);
                } else if (!isNaN(Number(nestedValue))) {
                  nestedKVObject[nestedKey] = Number(nestedValue);
                } else {
                  nestedKVObject[nestedKey] = nestedValue;
                }
              }
            }
            
            if (Object.keys(nestedKVObject).length > 0) {
              partialObject[key] = nestedKVObject;
              extractionCount++;
            }
          }
        }
      }
      
      // Only return if we extracted some data
      if (extractionCount > 0) {
        extractionAttempts.push({strategy: 'key_value_extraction', result: 'success'});
        console.log(`Reconstructed partial object with ${extractionCount} extracted fields`);
        
        // If we have required fields for analysis, our extraction is good enough
        const hasMinimumRequiredFields = 
          (partialObject.description || partialObject.nutrients || 
           partialObject.feedback || partialObject.suggestions);
           
        if (hasMinimumRequiredFields) {
          console.log('Extracted object has minimum required fields for analysis');
        } else {
          console.warn('Extracted object is missing some required fields for analysis');
        }
        
        return partialObject;
      } else {
        extractionAttempts.push({strategy: 'key_value_extraction', result: 'failure', reason: 'No fields extracted'});
      }
    } catch (reconstructError) {
      extractionAttempts.push({
        strategy: 'key_value_extraction', 
        result: 'failure', 
        reason: reconstructError instanceof Error ? reconstructError.message : 'Unknown error'
      });
    }
    
    // If all strategies failed, log detailed information for debugging
    console.warn('All JSON extraction strategies failed');
    console.warn('Extraction attempts:', JSON.stringify(extractionAttempts, null, 2));
    
    // Last resort: create basic object with any text we can find
    const fallbackExtraction: Record<string, any> = {};
    
    // Try to extract description
    const descriptionMatch = text.match(/description\s*[":]\s*["']?([^"',}\n]+)/i);
    if (descriptionMatch && descriptionMatch[1]) {
      fallbackExtraction.description = descriptionMatch[1].trim();
    }
    
    // Try to extract feedback
    const feedbackMatch = text.match(/feedback["\s:]+([^"}.]+)/i) || 
                         text.match(/nutritional\s+value["\s:]+([^"}.]+)/i);
    if (feedbackMatch && feedbackMatch[1]) {
      fallbackExtraction.feedback = feedbackMatch[1].trim();
    }
    
    if (Object.keys(fallbackExtraction).length > 0) {
      console.log('Created emergency fallback object with partial text extraction');
      return fallbackExtraction;
    }
    
    // Failed to extract any valid JSON or text
    console.warn('Failed to extract any meaningful data from the text');
    return null;
  } catch (error) {
    // Catch any unexpected errors in the main extraction process
    console.error('Unexpected error during JSON extraction:', error);
    return null;
  }
}

/**
 * Creates a partial fallback analysis from incomplete data
 * with enhanced extraction and fallback field generation
 */
function createPartialFallbackAnalysis(
  rawContent: string, 
  requestId: string, 
  modelUsed: string, 
  isParseError: boolean,
  partialData?: any
): AnalysisResult {
  console.log(`🛠️ [${requestId}] Creating partial fallback analysis from ${isParseError ? 'raw text' : 'partial data'}`);
  
  // Start with a complete fallback structure to ensure all fields exist
  const fallback = createEmptyFallbackAnalysis(
    requestId, 
    modelUsed, 
    isParseError ? 'Failed to parse JSON response' : 'Missing required fields in response'
  );
  
  try {
    // If we have partial data, use what's valid
    if (partialData) {
      console.log(`✨ [${requestId}] Using partial data for fallback analysis: ${JSON.stringify(partialData, null, 2).substring(0, 500)}...`);
      
      // Copy any valid fields from partial data
      if (partialData.description && typeof partialData.description === 'string') {
        fallback.description = partialData.description;
      }
      
      // Handle nutrients (either as array or object)
      if (partialData.nutrients) {
        if (Array.isArray(partialData.nutrients) && partialData.nutrients.length > 0) {
          // Ensure each nutrient has the required fields
          const validNutrients = partialData.nutrients.map((nutrient: any) => {
            // Create a valid nutrient object
            const validNutrient: Nutrient = {
              name: typeof nutrient.name === 'string' ? nutrient.name : 'unknown',
              value: typeof nutrient.value !== 'undefined' ? String(nutrient.value) : '0',
              unit: typeof nutrient.unit === 'string' ? nutrient.unit : 
                    nutrient.name === 'calories' ? 'kcal' : 'g',
              isHighlight: Boolean(nutrient.isHighlight)
            };
            return validNutrient;
          });
          
          // Make sure fallback.nutrients is defined before assigning
          fallback.nutrients = validNutrients;
          
          // Check if we need to add core nutrients that are missing
          const requiredNutrients = ['calories', 'protein', 'carbs', 'fat'];
          const existingNutrients = new Set(validNutrients.map(n => n.name.toLowerCase()));
          
          for (const requiredNutrient of requiredNutrients) {
            if (!existingNutrients.has(requiredNutrient)) {
              fallback.nutrients.push({
                name: requiredNutrient,
                value: '0',
                unit: requiredNutrient === 'calories' ? 'kcal' : 'g',
                isHighlight: true
              });
            }
          }
        } else if (typeof partialData.nutrients === 'object') {
          const nutrientsArray: Nutrient[] = [];
          
          // Log the nutrients object to help debug
          console.log(`🔎 [${requestId}] Nutrients object structure: ${JSON.stringify(partialData.nutrients, null, 2)}`);
          
          // Process core nutrients first
          const coreNutrients = [
            { key: 'calories', unit: 'kcal', highlight: true },
            { key: 'protein', unit: 'g', highlight: true },
            { key: 'carbs', unit: 'g', highlight: true },
            { key: 'fat', unit: 'g', highlight: true }
          ];
          
          for (const { key, unit, highlight } of coreNutrients) {
            // Add each core nutrient, even if value is 0 or missing
            const value = partialData.nutrients[key] ?? 0;
            nutrientsArray.push({
              name: key,
              value: String(value),
              unit,
              isHighlight: highlight
            });
          }
          
          // Add any other nutrients found in the object
          Object.keys(partialData.nutrients).forEach(key => {
            if (!['calories', 'protein', 'carbs', 'fat'].includes(key) && 
                partialData.nutrients[key] !== null && 
                partialData.nutrients[key] !== undefined) {
              try {
                nutrientsArray.push({
                  name: key,
                  value: String(partialData.nutrients[key]),
                  unit: key === 'sodium' ? 'mg' : 'g',
                  isHighlight: false
                });
              } catch (nutrientError) {
                console.warn(`⚠️ [${requestId}] Error processing nutrient ${key}: ${nutrientError}`);
              }
            }
          });
          
          fallback.nutrients = nutrientsArray;
        }
      }
      
      // Handle feedback (string or array)
      if (typeof partialData.feedback === 'string' && partialData.feedback.trim()) {
        fallback.feedback = partialData.feedback;
      } else if (Array.isArray(partialData.feedback) && partialData.feedback.length > 0) {
        fallback.feedback = partialData.feedback.join(". ");
      }
      
      // Handle suggestions (array or string)
      if (Array.isArray(partialData.suggestions) && partialData.suggestions.length > 0) {
        // Explicitly type the filter function parameter
        fallback.suggestions = partialData.suggestions.filter((s: any) => typeof s === 'string' && s.trim() !== '');
        // If filtering removed all suggestions, restore defaults
        if (fallback.suggestions.length === 0) {
          fallback.suggestions = ["Try taking a clearer photo", "Make sure the lighting is good"];
        }
      } else if (typeof partialData.suggestions === 'string' && partialData.suggestions.trim()) {
        // Convert string to array if needed
        fallback.suggestions = [partialData.suggestions];
      }
      
      // Handle detailed ingredients
      if (Array.isArray(partialData.detailedIngredients) && partialData.detailedIngredients.length > 0) {
        // Ensure each ingredient has required fields
        fallback.detailedIngredients = partialData.detailedIngredients.map((ingredient: any) => {
          return {
            name: ingredient.name || 'Unknown ingredient',
            category: ingredient.category || 'Other',
            confidence: typeof ingredient.confidence === 'number' ? 
              ingredient.confidence : 0.5
          };
        });
      } else {
        // Create at least one ingredient for UI display
        fallback.detailedIngredients = [
          { name: "Unknown food item", category: "Unknown", confidence: 0 }
        ];
      }
      
      // Handle goalScore with more robust error handling
      try {
        if (partialData.goalScore) {
          if (typeof partialData.goalScore === 'number') {
            fallback.goalScore = {
              overall: Math.max(0, Math.min(100, partialData.goalScore)), // Clamp between 0-100
              specific: {} as Record<string, number>
            };
          } else if (typeof partialData.goalScore === 'object') {
            let overallScore = 50; // Default mid-point
            
            // Safely extract overall score
            if (typeof partialData.goalScore.overall === 'number') {
              overallScore = Math.max(0, Math.min(100, partialData.goalScore.overall));
            }
            
            fallback.goalScore = {
              overall: overallScore,
              specific: {} as Record<string, number>
            };
            
            // Safely copy specific scores if they exist
            if (partialData.goalScore.specific && typeof partialData.goalScore.specific === 'object') {
              Object.keys(partialData.goalScore.specific).forEach(key => {
                const value = partialData.goalScore.specific[key];
                if (typeof value === 'number') {
                  // Clamp between 0-100
                  fallback.goalScore.specific[key] = Math.max(0, Math.min(100, value));
                }
              });
            }
          }
        }
      } catch (goalScoreError) {
        console.error(`❌ [${requestId}] Error processing goalScore: ${goalScoreError}`);
        // Reset to default
        fallback.goalScore = {
          overall: 50, // Use middle value
          specific: {} as Record<string, number>
        };
      }
      
      fallback.metadata.isPartialResult = true;
      fallback.metadata.fallback = true;
      
      // Additional metadata for diagnostics
      fallback.metadata.partialFieldsExtracted = Object.keys(partialData).join(',');
      
      return fallback;
    }
    
    // For parse errors, try to extract some information from the raw text
    if (isParseError && rawContent) {
      console.log(`🔍 [${requestId}] Attempting to extract information from raw text (length: ${rawContent.length})`);
      
      // Try to find a description
      const descriptionMatch = rawContent.match(/description["\s:]+([^"}.]+)/i) || 
                              rawContent.match(/describe[^\n]+meal[^\n]*?:?\s*([^"}.]+)/i);
      if (descriptionMatch && descriptionMatch[1]) {
        fallback.description = descriptionMatch[1].trim();
      }
      
      // Try to find feedback
      const feedbackMatch = rawContent.match(/feedback["\s:]+([^"}.]+)/i) || 
                           rawContent.match(/nutritional\s+value["\s:]+([^"}.]+)/i);
      if (feedbackMatch && feedbackMatch[1]) {
        fallback.feedback = feedbackMatch[1].trim();
      }
      
      // Try to extract suggestions from numbered or bulleted lists
      const suggestionsRegexes = [
        /suggestions?(?:[\s:"]*)((?:[\d\-•\*]\s*[^"}\n]+[.,]?\s*)+)/i,
        /improvements?(?:[\s:"]*)((?:[\d\-•\*]\s*[^"}\n]+[.,]?\s*)+)/i,
        /recommend(?:[\s:"]*)((?:[\d\-•\*]\s*[^"}\n]+[.,]?\s*)+)/i
      ];
      
      for (const regex of suggestionsRegexes) {
        const match = rawContent.match(regex);
        if (match && match[1]) {
          // Split by numbers, bullets, etc.
          const splitLines = match[1].split(/(?:[\d\-•\*]\s*)/);
          const suggestions = splitLines
            .map(line => line.trim())
            .filter(line => line && line.length > 5) // Only keep substantial lines
            .map(line => line.replace(/[.,]$/, '')); // Remove ending punctuation
          
          if (suggestions.length > 0) {
            fallback.suggestions = suggestions;
            break;
          }
        }
      }
      
      // Try to extract nutrient values
      const nutrientMatches = [
        { name: 'calories', regex: /calories?(?:[^\d]+)(\d+)/i, unit: 'kcal', isHighlight: true },
        { name: 'protein', regex: /protein(?:[^\d]+)(\d+)/i, unit: 'g', isHighlight: true },
        { name: 'carbs', regex: /carbs?(?:[^\d]+)(\d+)/i, unit: 'g', isHighlight: true },
        { name: 'fat', regex: /fat(?:[^\d]+)(\d+)/i, unit: 'g', isHighlight: true }
      ];
      
      const extractedNutrients: Nutrient[] = [];
      
      for (const nutrientInfo of nutrientMatches) {
        const match = rawContent.match(nutrientInfo.regex);
        if (match && match[1]) {
          extractedNutrients.push({
            name: nutrientInfo.name,
            value: match[1],
            unit: nutrientInfo.unit,
            isHighlight: nutrientInfo.isHighlight
          });
        }
      }
      
      // If we extracted nutrients, use them, otherwise keep defaults
      if (extractedNutrients.length > 0) {
        // Find missing required nutrients from what we extracted
        const requiredNutrients = ['calories', 'protein', 'carbs', 'fat'];
        const extractedNames = new Set(extractedNutrients.map(n => n.name));
        
        for (const required of requiredNutrients) {
          if (!extractedNames.has(required)) {
            extractedNutrients.push({
              name: required,
              value: '0',
              unit: required === 'calories' ? 'kcal' : 'g',
              isHighlight: true
            });
          }
        }
        
        fallback.nutrients = extractedNutrients;
      }
      
      // Try to extract goal score
      const goalScoreMatch = rawContent.match(/(?:goal|health)(?:\s+)?score(?:[^\d]+)(\d+)/i);
      if (goalScoreMatch && goalScoreMatch[1]) {
        const score = parseInt(goalScoreMatch[1], 10);
        if (!isNaN(score)) {
          fallback.goalScore.overall = Math.min(100, Math.max(0, score)); // Clamp between 0-100
        }
      }
      
      fallback.metadata.isPartialResult = true;
      fallback.metadata.extractedFromText = true;
      fallback.metadata.fallback = true;
    }
  } catch (extractionError) {
    console.error(`❌ [${requestId}] Error creating partial fallback:`, 
      extractionError instanceof Error ? extractionError.message : String(extractionError));
    console.error(`❌ [${requestId}] Error stack:`, 
      extractionError instanceof Error ? extractionError.stack : 'No stack trace');
  }
  
  // Final safety check - ensure all required fields have at least default values
  if (!Array.isArray(fallback.nutrients) || fallback.nutrients.length === 0) {
    fallback.nutrients = [
      { name: 'calories', value: '0', unit: 'kcal', isHighlight: true },
      { name: 'protein', value: '0', unit: 'g', isHighlight: true },
      { name: 'carbs', value: '0', unit: 'g', isHighlight: true },
      { name: 'fat', value: '0', unit: 'g', isHighlight: true }
    ];
  }
  
  if (!Array.isArray(fallback.suggestions) || fallback.suggestions.length === 0) {
    fallback.suggestions = [
      "Try taking a clearer photo of your meal",
      "Make sure the lighting is good when taking a photo",
      "Position your camera directly above the plate for best results"
    ];
  }
  
  if (!Array.isArray(fallback.detailedIngredients) || fallback.detailedIngredients.length === 0) {
    fallback.detailedIngredients = [
      { name: "Food item", category: "Unknown", confidence: 0.5 }
    ];
  }
  
  if (!fallback.description) {
    fallback.description = "Unable to analyze the image at this time. We've provided a placeholder response.";
  }
  
  if (!fallback.feedback) {
    fallback.feedback = "We couldn't process your image completely. Please try again with a clearer photo of your meal.";
  }
  
  // Add additional metadata for diagnostic purposes
  fallback.metadata.generatedAt = new Date().toISOString();
  fallback.metadata.recoveryAttempted = isParseError || !partialData;
  
  return fallback;
}