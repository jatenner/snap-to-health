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
  requestId: string, 
  modelUsed: string, 
  errorMessage: string
): AnalysisResult {
  return {
    description: "Unable to analyze the image at this time.",
    nutrients: [],
    feedback: "We couldn't process your image. Please try again with a clearer photo of your meal.",
    suggestions: ["Try taking the photo in better lighting", "Make sure your meal is clearly visible"],
    detailedIngredients: [],
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
      imageQuality: "unknown"
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
 */
function extractJSONFromText(text: string): any | null {
  try {
    // Try to find JSON content between curly braces
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON object found in response');
    }
    
    return JSON.parse(jsonMatch[0]);
  } catch (parseError) {
    // Try to clean the content before parsing
    try {
      // Find the JSON-like content
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }
      
      let cleanedText = jsonMatch[0]
        .replace(/(\r\n|\n|\r)/gm, '') // Remove line breaks
        .replace(/,\s*}/g, '}')        // Remove trailing commas
        .replace(/,\s*]/g, ']');       // Remove trailing commas in arrays
        
      return JSON.parse(cleanedText);
    } catch (secondError) {
      return null;
    }
  }
}

/**
 * Creates a partial fallback analysis from incomplete data
 */
function createPartialFallbackAnalysis(
  rawContent: string, 
  requestId: string, 
  modelUsed: string, 
  isParseError: boolean,
  partialData?: any
): AnalysisResult {
  console.log(`🛠️ [${requestId}] Creating partial fallback analysis from ${isParseError ? 'raw text' : 'partial data'}`);
  
  // Start with an empty fallback
  const fallback = createEmptyFallbackAnalysis(
    requestId, 
    modelUsed, 
    isParseError ? 'Failed to parse JSON response' : 'Missing required fields in response'
  );
  
  try {
    // If we have partial data, use what's valid
    if (partialData) {
      console.log(`✨ [${requestId}] Using partial data for fallback analysis`);
      
      // Copy any valid fields from partial data
      if (partialData.description) fallback.description = partialData.description;
      
      // Handle nutrients (either as array or object)
      if (partialData.nutrients) {
        if (Array.isArray(partialData.nutrients)) {
          fallback.nutrients = partialData.nutrients;
        } else if (typeof partialData.nutrients === 'object') {
          const nutrientsArray: Nutrient[] = [];
          Object.keys(partialData.nutrients).forEach(key => {
            if (partialData.nutrients[key] !== null && partialData.nutrients[key] !== undefined) {
              nutrientsArray.push({
                name: key,
                value: String(partialData.nutrients[key]),
                unit: key === 'calories' ? 'kcal' : key === 'sodium' ? 'mg' : 'g',
                isHighlight: ['calories', 'protein', 'carbs', 'fat'].includes(key)
              });
            }
          });
          fallback.nutrients = nutrientsArray;
        }
      }
      
      // Handle feedback (string or array)
      if (typeof partialData.feedback === 'string') {
        fallback.feedback = partialData.feedback;
      } else if (Array.isArray(partialData.feedback) && partialData.feedback.length > 0) {
        fallback.feedback = partialData.feedback.join('. ');
      }
      
      // Handle suggestions (array)
      if (Array.isArray(partialData.suggestions)) {
        fallback.suggestions = partialData.suggestions;
      }
      
      // Handle detailed ingredients
      if (Array.isArray(partialData.detailedIngredients)) {
        fallback.detailedIngredients = partialData.detailedIngredients;
      }
      
      // Handle goalScore
      if (partialData.goalScore) {
        if (typeof partialData.goalScore === 'number') {
          fallback.goalScore = {
            overall: partialData.goalScore,
            specific: {} as Record<string, number>
          };
        } else if (typeof partialData.goalScore === 'object') {
          fallback.goalScore = {
            overall: partialData.goalScore.overall || 0,
            specific: partialData.goalScore.specific || {} as Record<string, number>
          };
        }
      }
      
      fallback.metadata.isPartialResult = true;
      return fallback;
    }
    
    // For parse errors, try to extract some information from the raw text
    if (isParseError && rawContent) {
      console.log(`🔍 [${requestId}] Attempting to extract information from raw text`);
      
      // Try to find a description
      const descriptionMatch = rawContent.match(/description["\s:]+([^"}.]+)/i);
      if (descriptionMatch && descriptionMatch[1]) {
        fallback.description = descriptionMatch[1].trim();
      }
      
      // Try to find feedback
      const feedbackMatch = rawContent.match(/feedback["\s:]+([^"}.]+)/i);
      if (feedbackMatch && feedbackMatch[1]) {
        fallback.feedback = feedbackMatch[1].trim();
      }
      
      fallback.metadata.isPartialResult = true;
      fallback.metadata.extractedFromText = true;
    }
  } catch (extractionError) {
    console.error(`❌ [${requestId}] Error creating partial fallback:`, 
      extractionError instanceof Error ? extractionError.message : String(extractionError));
  }
  
  return fallback;
}