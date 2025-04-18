/**
 * OCR-based image analysis implementation for meal analysis
 */

import OpenAI from 'openai';
import crypto from 'crypto';
import { GPT_MODEL, FALLBACK_MODELS, API_CONFIG } from './constants';
import { runOCR } from './runOCR';
import { analyzeMealTextOnly } from './analyzeMealTextOnly';
import { getNutritionData, createNutrientAnalysis } from './nutritionixApi';

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
  
  // Check if API key matches expected format
  return (
    apiKey.startsWith('sk-') || 
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
): any {
  console.log(`[${requestId}] Creating empty fallback analysis due to: ${errorMessage}`);
  
  return {
    description: "We couldn't analyze this meal properly. Please try again with a clearer photo.",
    nutrients: [],
    feedback: ["Unable to analyze the image."],
    suggestions: ["Try taking the photo with better lighting and make sure the food is clearly visible."],
    fallback: true,
    lowConfidence: true,
    message: errorMessage || "Analysis failed",
    modelInfo: {
      model: modelUsed || "none",
      usedFallback: true,
      ocrExtracted: true
    }
  };
}

/**
 * Analyze an image using OCR text extraction
 * @param base64Image Base64 encoded image to analyze
 * @param healthGoals User's health goals to consider
 * @param dietaryPreferences User's dietary preferences (allergies, avoidances)
 * @param requestId Unique ID for this request
 * @returns Analysis result
 */
export async function analyzeImageWithOCR(
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
  rawResponse?: string;
}> {
  // Start timing for performance metrics
  console.time(`⏱️ [${requestId}] analyzeImageWithOCR`);
  const startTime = Date.now();
  console.log(`🔍 [${requestId}] Beginning OCR-based image analysis`);
  
  // Set up global timeout
  const globalTimeoutMs = parseInt(process.env.OPENAI_TIMEOUT_MS || '', 10) || API_CONFIG.DEFAULT_TIMEOUT_MS;
  let timeoutId: NodeJS.Timeout | null = null;
  
  try {
    if (!openai) {
      if (openAIInitializationError) {
        throw openAIInitializationError;
      }
      throw new Error("OpenAI client is not initialized.");
    }
    
    // Perform OCR on the image
    console.log(`🔍 [${requestId}] Running OCR on the image`);
    const ocrResult = await runOCR(base64Image, requestId);
    
    if (!ocrResult.success || !ocrResult.text) {
      console.warn(`⚠️ [${requestId}] OCR failed: ${ocrResult.error || 'No text extracted'}`);
      throw new Error(ocrResult.error || 'Failed to extract text from image');
    }
    
    const extractedText = ocrResult.text;
    console.log(`✅ [${requestId}] OCR successful, extracted ${extractedText.length} characters`);
    console.log(`📋 [${requestId}] Extracted text: "${extractedText.substring(0, 100)}${extractedText.length > 100 ? '...' : ''}"`);
    
    // Convert health goals and dietary preferences to the expected format
    const healthGoalsObj = {
      primary: healthGoals.length > 0 ? healthGoals[0] : 'general health',
      additional: healthGoals.slice(1)
    };
    
    const dietaryPreferencesObj = {
      allergies: dietaryPreferences.filter(p => p.toLowerCase().includes('allergy') || p.toLowerCase().includes('allergic')),
      avoidances: dietaryPreferences.filter(p => !p.toLowerCase().includes('allergy') && !p.toLowerCase().includes('allergic'))
    };
    
    // Analyze the extracted text
    console.log(`🔍 [${requestId}] Analyzing extracted text to identify meal components`);
    const mealAnalysis = await analyzeMealTextOnly(
      extractedText,
      healthGoalsObj,
      dietaryPreferencesObj,
      requestId
    );
    
    if (!mealAnalysis.success && mealAnalysis.error) {
      console.warn(`⚠️ [${requestId}] Text analysis failed: ${mealAnalysis.error}`);
      throw new Error(mealAnalysis.error);
    }
    
    console.log(`✅ [${requestId}] Text analysis successful`);
    
    // Format the final result
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    const formattedResult = {
      description: mealAnalysis.description,
      nutrients: mealAnalysis.nutrients,
      feedback: mealAnalysis.feedback,
      suggestions: mealAnalysis.suggestions,
      detailedIngredients: mealAnalysis.ingredients,
      goalScore: {
        overall: 5, // Default neutral score
        specific: {} as Record<string, number>
      },
      metadata: {
        requestId,
        modelUsed: 'ocr-text-analysis',
        usedFallbackModel: false,
        processingTime,
        confidence: ocrResult.confidence,
        error: '',
        imageQuality: 'medium'
      }
    };
    
    console.timeEnd(`⏱️ [${requestId}] analyzeImageWithOCR`);
    
    return {
      analysis: formattedResult,
      success: true,
      modelUsed: 'ocr-text-analysis',
      usedFallbackModel: false
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ [${requestId}] Analysis failed: ${errorMessage}`);
    
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    const fallbackAnalysis = createEmptyFallbackAnalysis(requestId, 'ocr-text-analysis', errorMessage);
    
    console.timeEnd(`⏱️ [${requestId}] analyzeImageWithOCR`);
    
    return {
      analysis: fallbackAnalysis,
      success: false,
      error: errorMessage,
      modelUsed: 'none',
      usedFallbackModel: false
    };
  } finally {
    // Clear timeout if it was set
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Validate that an analysis result has all required fields
 * @param analysis Analysis result to validate
 * @returns Boolean indicating if the analysis is valid
 */
export function validateAnalysisResult(analysis: any): boolean {
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
 * Create a fallback response for when analysis fails
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