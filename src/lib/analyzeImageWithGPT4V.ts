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
export function createEmptyFallbackAnalysis(requestId: string, errorMessage: string): AnalysisResult {
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
      modelUsed: "fallback",
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
      analysis: createEmptyFallbackAnalysis(requestId, error),
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
      analysis: createEmptyFallbackAnalysis(requestId, error),
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
      analysis: createEmptyFallbackAnalysis(requestId, error),
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
      analysis: createEmptyFallbackAnalysis(requestId, error),
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
          analysis: createEmptyFallbackAnalysis(requestId, error),
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
          analysis: createEmptyFallbackAnalysis(requestId, error),
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
        analysis: createEmptyFallbackAnalysis(requestId, error),
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
    
    // Make the API request
    const openaiResponse = await openai.chat.completions.create({
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
    
    console.log(`✅ [${requestId}] OpenAI API response received, model: ${modelToUse}, tokens: ${openaiResponse.usage?.total_tokens || 'unknown'}`);
    
    // Extract the response content
    const responseContent = openaiResponse.choices[0]?.message?.content || '';
    
    // Always log a truncated version of the response (for debugging)
    const truncatedResponse = responseContent.length > 500 
      ? `${responseContent.substring(0, 500)}...` 
      : responseContent;
      
    console.log(`📋 [${requestId}] GPT Response (truncated): ${truncatedResponse}`);
    
    // Try to parse the JSON response
    let parsedResponse: Record<string, any>;
    try {
      parsedResponse = JSON.parse(responseContent);
      
      // Calculate processing time
      const processingTime = Date.now() - startTime;
      
      // Add metadata to the analysis
      parsedResponse.metadata = {
        requestId,
        modelUsed: modelToUse,
        usedFallbackModel,
        processingTime,
        confidence: parsedResponse.confidence || 0,
        error: '',
        imageQuality: qualityInfo.qualityLevel
      };
      
      // Validate the analysis result contains required fields
      if (!validateGptAnalysisResult(parsedResponse)) {
        console.warn(`⚠️ [${requestId}] Incomplete analysis result, some fields may be missing`);
      }
      
      // Return the analysis as successful
      return {
        analysis: parsedResponse,
        success: true,
        modelUsed: modelToUse,
        usedFallbackModel,
        forceGPT4V,
        rawResponse: responseContent
      };
    } catch (error) {
      // Handle JSON parsing errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ [${requestId}] Failed to parse JSON from OpenAI response: ${errorMessage}`);
      
      // Return a failure with the raw response for debugging
      return {
        analysis: createEmptyFallbackAnalysis(requestId, `Failed to parse GPT-4V response: ${errorMessage}`),
        success: false,
        error: `Failed to parse response: ${errorMessage}`,
        modelUsed: modelToUse,
        usedFallbackModel,
        forceGPT4V,
        rawResponse: responseContent
      };
    }
  } catch (error) {
    // Handle any errors during the API request
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ [${requestId}] Error during GPT-4V analysis: ${errorMessage}`);
    
    return {
      analysis: createEmptyFallbackAnalysis(requestId, `API error: ${errorMessage}`),
      success: false,
      error: `API error: ${errorMessage}`,
      modelUsed: 'error',
      usedFallbackModel: false,
      forceGPT4V: false,
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