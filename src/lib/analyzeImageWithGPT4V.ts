/**
 * This file contains stub implementations of analysis functions
 * to allow the app to compile and unblock the Vercel build.
 */

import OpenAI from 'openai';
import crypto from 'crypto';
import { GPT_MODEL, GPT_VISION_MODEL, FALLBACK_MODELS, API_CONFIG } from './constants';

// Define the interface for the analysis result, matching what's used in the components
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

interface HealthGoals {
  primary: string;
  additional: string[];
}

interface DietaryPreferences {
  allergies: string[];
  avoidances: string[];
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
 */
export async function checkModelAvailability(
  modelName: string,
  apiKey: string
): Promise<{
  isAvailable: boolean;
  fallbackModel: string | null;
  errorMessage: string | null;
}> {
  try {
    const openai = new OpenAI({ apiKey });
    const models = await openai.models.list();
    
    const isAvailable = models.data.some(model => model.id === modelName);
    if (isAvailable) {
      console.info(`Model ${modelName} is available`);
      return { isAvailable: true, fallbackModel: null, errorMessage: null };
    }
    
    // Find fallback model from available models
    const availableFallbackModel = FALLBACK_MODELS.find(fallbackModel => 
      models.data.some(model => model.id === fallbackModel)
    );
    
    console.warn(`Model ${modelName} is not available, fallback: ${availableFallbackModel || 'none'}`);
    return { 
      isAvailable: false, 
      fallbackModel: availableFallbackModel || null,
      errorMessage: `Model ${modelName} is not available` 
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error checking model availability: ${errorMessage}`);
    return { isAvailable: false, fallbackModel: null, errorMessage };
  }
}

/**
 * Define types for analysis results
 */
export interface GoalScore {
  overall: number;
  specific: Record<string, number>;
}

export interface AnalysisMetadata {
  requestId: string;
  model: string | null;
  usedFallback: boolean;
  processingTime: number;
  error: string;
}

export interface AnalysisFallback {
  success: boolean;
  description: string;
  nutrients: any[];
  feedback: string;
  suggestions: string[];
  detailedIngredients: any[];
  healthScore: number;
  goalScore: GoalScore;
  metadata: AnalysisMetadata;
}

/**
 * Creates an empty fallback analysis when analysis fails
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
      specific: Object.create(null) as Record<string, number>,
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
  // Start timing for performance metrics
  const startTime = Date.now();
  
  // Log the request details
  console.log(`🔍 [${requestId}] Starting image analysis...`);
  console.log(`🎯 [${requestId}] Goals: ${healthGoals.join(', ') || 'None specified'}`);
  console.log(`🍽️ [${requestId}] Preferences: ${dietaryPreferences.join(', ') || 'None specified'}`);
  
  // Check for the OpenAI API key
  const openAIApiKey = process.env.OPENAI_API_KEY;
  if (!openAIApiKey) {
    const error = 'OpenAI API key not found in environment variables';
    console.error(`❌ [${requestId}] ${error}`);
    
    return {
      analysis: createEmptyFallbackAnalysis(requestId, 'none', error),
      success: false,
      error,
      modelUsed: 'none',
      usedFallbackModel: false,
      forceGPT4V: false
    };
  }
  
  if (!validateOpenAIApiKey(openAIApiKey)) {
    const error = 'Invalid OpenAI API key format';
    console.error(`❌ [${requestId}] ${error}`);
    
    return {
      analysis: createEmptyFallbackAnalysis(requestId, 'none', error),
      success: false,
      error,
      modelUsed: 'none',
      usedFallbackModel: false,
      forceGPT4V: false
    };
  }
  
  // If openai client wasn't initialized properly or had an error
  if (!openai) {
    const error = openAIInitializationError?.message || 'OpenAI client not initialized';
    console.error(`❌ [${requestId}] ${error}`);
    
    return {
      analysis: createEmptyFallbackAnalysis(requestId, 'none', error),
      success: false,
      error,
      modelUsed: 'none',
      usedFallbackModel: false,
      forceGPT4V: false
    };
  }
  
  // Check if image data is provided
  if (!base64Image) {
    const error = 'No image data provided';
    console.error(`❌ [${requestId}] ${error}`);
    
    return {
      analysis: createEmptyFallbackAnalysis(requestId, 'none', error),
      success: false,
      error,
      modelUsed: 'none',
      usedFallbackModel: false,
      forceGPT4V: false
    };
  }
  
  try {
    console.log(`🔗 [${requestId}] OpenAI client initialized successfully`);
    
    // Determine which model to use
    let modelToUse = GPT_MODEL;
    let usedFallbackModel = false;

    // Check if environment forces GPT-4 Vision or allows fallback to other models
    const forceGPT4V = process.env.USE_GPT4_VISION === 'true';
    
    // Default to GPT-4o which supports vision
    const preferredModel = GPT_VISION_MODEL;
    
    console.log(`🔍 [${requestId}] Analyzing image with desired model: ${preferredModel}`);
    
    if (forceGPT4V) {
      // If GPT-4o is forced, check availability but don't fallback
      const modelCheck = await checkModelAvailability(preferredModel, openAIApiKey);
      
      if (!modelCheck.isAvailable) {
        // If force mode is on but model isn't available, fail rather than fallback
        const error = `Advanced model is forced (USE_GPT4_VISION=true) but ${preferredModel} is not available: ${modelCheck.errorMessage}`;
        console.error(`❌ [${requestId}] ${error}`);
        
        return {
          analysis: createEmptyFallbackAnalysis(requestId, 'none', error),
          success: false,
          error,
          modelUsed: 'none',
          usedFallbackModel: false,
          forceGPT4V: forceGPT4V
        };
      }
      
      // Use the preferred model (gpt-4o)
      modelToUse = preferredModel;
      console.log(`✅ [${requestId}] Using forced model: ${modelToUse}`);
    } else {
      // If fallbacks are allowed, check availability and use fallback if needed
      const modelCheck = await checkModelAvailability(preferredModel, openAIApiKey);
      
      if (!modelCheck.isAvailable && modelCheck.fallbackModel) {
        modelToUse = modelCheck.fallbackModel;
        usedFallbackModel = true;
        console.warn(`⚠️ [${requestId}] Using fallback model: ${modelToUse} (USE_GPT4_VISION=false)`);
      } else if (modelCheck.isAvailable) {
        modelToUse = preferredModel;
        console.log(`✅ [${requestId}] Using preferred model: ${modelToUse}`);
      } else {
        // No models available
        const error = `No suitable vision models available: ${modelCheck.errorMessage}`;
        console.error(`❌ [${requestId}] ${error}`);
        
        return {
          analysis: createEmptyFallbackAnalysis(requestId, 'none', error),
          success: false,
          error,
          modelUsed: 'none',
          usedFallbackModel: false,
          forceGPT4V: forceGPT4V
        };
      }
    }
    
    // Validate the image and check its quality
    const { url: formattedImage, qualityInfo } = formatImageForRequest(base64Image);
    console.log(`🖼️ [${requestId}] Image quality: ${qualityInfo.qualityLevel}, size: ${qualityInfo.sizeKB}KB`);
    
    if (!qualityInfo.isValid) {
      const error = qualityInfo.error || 'Invalid image format';
      console.error(`❌ [${requestId}] ${error}`);
      
      return {
        analysis: createEmptyFallbackAnalysis(requestId, 'none', error),
        success: false,
        error,
        modelUsed: 'none',
        usedFallbackModel: false,
        forceGPT4V: false
      };
    }
    
    // If image is too small or too large, warn but proceed
    if (qualityInfo.qualityLevel === 'low') {
      console.warn(`⚠️ [${requestId}] Low quality image detected (${qualityInfo.sizeKB}KB), analysis may be less accurate`);
    }
    
    // Prepare system message with detailed instructions for analysis
    const systemMessage = `You are a nutrition expert analyzing food images. 
Provide a detailed analysis with accurate nutritional information and practical advice.
Your response MUST be valid JSON with these fields:
- description: Detailed description of the food/meal visible in the image
- nutrients: Array of nutrient objects with name, value, unit, and isHighlight fields
- feedback: Concise overall feedback about the nutritional value of the meal
- suggestions: Array of specific improvement suggestions related to user's health goals
- detailedIngredients: Array of ingredients with name, category, and confidence fields
- goalScore: Object with overall score (0-10) and specific scores for each health goal

Even if the image is unclear, make your best attempt to provide nutritional analysis.
Prioritize accuracy over completeness - if you're unsure about specific nutrients, focus on what you can identify with confidence.`;

    // Prepare the user message with the image and goals information
    const goalDescription = healthGoals.length > 0 
      ? `My health goals are: ${healthGoals.join(', ')}. `
      : '';
      
    const dietaryDescription = dietaryPreferences.length > 0
      ? `My dietary preferences/restrictions are: ${dietaryPreferences.join(', ')}. `
      : '';
      
    const userMessage = `${goalDescription}${dietaryDescription}Please analyze this meal and provide detailed nutritional information.`;

    console.log(`⏳ [${requestId}] Sending request to OpenAI API with model: ${modelToUse}`);
    
    // Add retry mechanism with exponential backoff
    const MAX_RETRIES = 3;
    let retryAttempt = 0;
    let lastError: Error | null = null;
    
    while (retryAttempt < MAX_RETRIES) {
      try {
        // Log attempt number if this is a retry
        if (retryAttempt > 0) {
          console.log(`🔄 [${requestId}] Retry attempt ${retryAttempt}/${MAX_RETRIES} for OpenAI API request`);
        }
        
        console.log(`🤖 [${requestId}] Making OpenAI API request with model: ${modelToUse}`);
        const startTime = Date.now();
        const completion = await openai.chat.completions.create({
          model: modelToUse,
          messages: [
            { role: 'system', content: systemMessage },
            { 
              role: 'user', 
              content: [
                { type: 'text', text: userMessage },
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
          max_tokens: API_CONFIG.MAX_TOKENS,
          temperature: API_CONFIG.TEMPERATURE,
          top_p: API_CONFIG.TOP_P,
          frequency_penalty: API_CONFIG.FREQUENCY_PENALTY,
          presence_penalty: API_CONFIG.PRESENCE_PENALTY,
          response_format: { type: 'json_object' }
        });
        const endTime = Date.now();
        console.log(`✅ [${requestId}] OpenAI API request completed in ${endTime - startTime}ms`);

        // Log the raw response
        console.log(`📊 [${requestId}] Raw OpenAI response:`, JSON.stringify(completion));

        // Validate response structure
        if (!completion.choices || completion.choices.length === 0) {
          console.error(`❌ [${requestId}] OpenAI API returned empty choices array`);
          throw new Error('OpenAI API returned empty choices array');
        }

        const choice = completion.choices[0];
        if (!choice.message || !choice.message.content) {
          console.error(`❌ [${requestId}] OpenAI API response missing message content`);
          throw new Error('OpenAI API response missing message content');
        }
        
        let parsedResult: any;
        try {
          console.log(`🔍 [${requestId}] Attempting to parse JSON response`);
          parsedResult = JSON.parse(choice.message.content);
          console.log(`✅ [${requestId}] Successfully parsed JSON response`);
        } catch (parseError) {
          console.error(`❌ [${requestId}] Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
          console.log(`🧩 [${requestId}] Raw content being parsed: ${choice.message.content}`);
          
          // If on the last retry attempt, try to create a partial fallback analysis
          if (retryAttempt === MAX_RETRIES - 1) {
            const fallbackAnalysis = createPartialFallbackAnalysis(choice.message.content, requestId, modelToUse, true, parsedResult);
            return {
              analysis: fallbackAnalysis,
              success: false,
              error: `Failed to parse response: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
              modelUsed: modelToUse,
              usedFallbackModel,
              forceGPT4V,
              rawResponse: choice.message.content
            };
          }
          
          // Increment retry attempt and continue
          retryAttempt++;
          lastError = parseError instanceof Error ? parseError : new Error(String(parseError));
          
          // Exponential backoff
          const delayMs = 1000 * Math.pow(2, retryAttempt);
          console.log(`⏳ [${requestId}] Waiting ${delayMs}ms before retry ${retryAttempt}/${MAX_RETRIES}`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        
        // Validate required fields
        const validationResult = validateRequiredFields(parsedResult);
        if (!validationResult.isValid) {
          console.error(`❌ [${requestId}] Validation failed: Missing required fields: ${validationResult.missingFields.join(', ')}`);
          
          // If on the last retry attempt, try to use what we have with a fallback for missing fields
          if (retryAttempt === MAX_RETRIES - 1) {
            const fallbackAnalysis = createPartialFallbackAnalysis(choice.message.content, requestId, modelToUse, false, parsedResult);
            return {
              analysis: fallbackAnalysis,
              success: false,
              error: `Missing required fields: ${validationResult.missingFields.join(', ')}`,
              modelUsed: modelToUse,
              usedFallbackModel,
              forceGPT4V,
              rawResponse: choice.message.content
            };
          }
          
          // Increment retry attempt and continue
          retryAttempt++;
          lastError = new Error(`Missing required fields: ${validationResult.missingFields.join(', ')}`);
          
          // Exponential backoff
          const delayMs = 1000 * Math.pow(2, retryAttempt);
          console.log(`⏳ [${requestId}] Waiting ${delayMs}ms before retry ${retryAttempt}/${MAX_RETRIES}`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          continue;
        }
        
        // Success! Return the valid result
        const analysisResult = {
          ...parsedResult,
          metadata: {
            requestId,
            modelUsed: modelToUse,
            usedFallbackModel,
            processingTime: endTime - startTime,
            confidence: parsedResult.confidence || 0,
            error: '',
            imageQuality: qualityInfo.qualityLevel
          },
        };
        
        return {
          analysis: analysisResult,
          success: true,
          modelUsed: modelToUse,
          usedFallbackModel,
          forceGPT4V,
          rawResponse: choice.message.content
        };
      } catch (apiError) {
        console.error(`❌ [${requestId}] OpenAI API error:`, apiError instanceof Error ? apiError.message : String(apiError));
        
        // If this is the last retry, we'll fall through to the outer catch block
        if (retryAttempt === MAX_RETRIES - 1) {
          throw apiError;
        }
        
        // Increment retry attempt and continue
        retryAttempt++;
        lastError = apiError instanceof Error ? apiError : new Error(String(apiError));
        
        // Exponential backoff
        const delayMs = 1000 * Math.pow(2, retryAttempt);
        console.log(`⏳ [${requestId}] Waiting ${delayMs}ms before retry ${retryAttempt}/${MAX_RETRIES}`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    // If we've exhausted all retries, throw the last error
    if (lastError) {
      throw lastError;
    }
    
    // This should never be reached, but TypeScript needs it
    throw new Error('Unknown error in OpenAI API request');
  } catch (error) {
    console.error(`❌ [${requestId}] Error in analyzeImageWithGPT4V:`, error instanceof Error ? error.message : String(error));
    const fallbackAnalysis = createEmptyFallbackAnalysis(requestId, 'error', error instanceof Error ? error.message : String(error));
    return {
      analysis: fallbackAnalysis,
      success: false,
      error: `API error: ${error instanceof Error ? error.message : String(error)}`,
      modelUsed: 'error',
      usedFallbackModel: false,
      forceGPT4V: false,
      rawResponse: JSON.stringify(error)
    };
  }
}

/**
 * Attempts to extract partial data from non-JSON responses
 * This can help recover from malformed JSON or text responses
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
      if (partialData.nutrients) fallback.nutrients = partialData.nutrients;
      if (partialData.feedback) fallback.feedback = partialData.feedback;
      if (partialData.suggestions) fallback.suggestions = partialData.suggestions;
      if (partialData.detailedIngredients) fallback.detailedIngredients = partialData.detailedIngredients;
      if (partialData.goalScore) fallback.goalScore = partialData.goalScore;
      
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
  const fallback = createEmptyFallbackAnalysis(reason, 'fallback', reason);
  
  // Add error metadata for debugging
  fallback.metadata = {
    requestId: reason,
    modelUsed: "fallback",
    usedFallbackModel: true,
    processingTime: 0,
    confidence: 0,
    error: reason,
    imageQuality: "unknown"
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
        value: value.toString(),
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
      specific: {}
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
 * Assess image quality based on size and encoding
 * This helps prevent sending very large or corrupted images to the API
 */
export function assessImageQuality(base64Image: string): {
  isValid: boolean;
  qualityLevel: 'high' | 'medium' | 'low' | 'invalid';
  sizeKB: number;
  error?: string;
} {
  if (!base64Image) {
    return {
      isValid: false,
      qualityLevel: 'invalid',
      sizeKB: 0,
      error: 'No image data provided'
    };
  }

  // Check if the base64 string has a valid format
  if (!base64Image.startsWith('data:image/')) {
    return {
      isValid: false,
      qualityLevel: 'invalid',
      sizeKB: 0,
      error: 'Invalid base64 image format'
    };
  }

  try {
    // Remove the data:image/*;base64, prefix if present
    const base64Data = base64Image.split(',')[1] || base64Image;
    
    // Calculate approximate size in KB
    const sizeKB = Math.round(base64Data.length * 0.75 / 1024);
    
    // Assess quality based on size
    let qualityLevel: 'high' | 'medium' | 'low' | 'invalid' = 'medium';
    
    if (sizeKB < 10) {
      qualityLevel = 'low'; // Very small images are likely low quality
    } else if (sizeKB > 5000) {
      // Images larger than 5MB might be too large for efficient API processing
      qualityLevel = 'low';
    } else if (sizeKB > 100) {
      qualityLevel = 'high';
    }
    
    return {
      isValid: true,
      qualityLevel,
      sizeKB
    };
  } catch (error) {
    return {
      isValid: false,
      qualityLevel: 'invalid',
      sizeKB: 0,
      error: `Error processing image: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Format the image data for API request
 */
export function formatImageForRequest(base64Image: string): { 
  url: string; 
  qualityInfo: ReturnType<typeof assessImageQuality>;
} {
  // Assess image quality first
  const qualityInfo = assessImageQuality(base64Image);
  
  // Ensure the image has the correct data URL prefix
  let imageUrl = base64Image;
  if (!base64Image.startsWith('data:image/')) {
    // If no prefix, assume it's a JPEG
    imageUrl = `data:image/jpeg;base64,${base64Image}`;
  }
  
  return { 
    url: imageUrl,
    qualityInfo
  };
}

// Helper function to validate required fields
function validateRequiredFields(result: any): { isValid: boolean; missingFields: string[] } {
  const requiredFields = ['description', 'nutrients', 'feedback', 'suggestions', 'detailedIngredients', 'goalScore'];
  const missingFields = requiredFields.filter(field => !result[field]);
  
  return {
    isValid: missingFields.length === 0,
    missingFields
  };
}

// Function to extract JSON from potentially malformed text
function extractJSONFromText(text: string): any {
  // Try to find JSON content between curly braces
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON object found in response');
  }
  
  try {
    return JSON.parse(jsonMatch[0]);
  } catch (parseError) {
    // Try to clean the content before parsing
    let cleanedText = jsonMatch[0]
      .replace(/(\r\n|\n|\r)/gm, '') // Remove line breaks
      .replace(/,\s*}/g, '}')        // Remove trailing commas
      .replace(/,\s*]/g, ']');       // Remove trailing commas in arrays
      
    try {
      return JSON.parse(cleanedText);
    } catch (secondError) {
      throw new Error(`Failed to parse JSON after cleaning: ${secondError instanceof Error ? secondError.message : String(secondError)}`);
    }
  }
}