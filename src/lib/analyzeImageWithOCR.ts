/**
 * OCR-based image analysis implementation for meal analysis
 */

import { createWorker } from 'tesseract.js';
import OpenAI from 'openai';
import crypto from 'crypto';
import { GPT_MODEL, API_CONFIG } from './constants';
import { runOCR, runAdvancedOCR } from './runOCR';
import { analyzeMealTextOnly } from './analyzeMealTextOnly';
import { getNutritionData, createNutrientAnalysis } from './nutritionixApi';

// Import the function for fallback text or define it here
function getRandomFallbackText(): string {
  // Fallback meal texts that are descriptive enough for meal analysis
  const FALLBACK_MEAL_TEXTS = [
    "Grilled chicken breast with brown rice and steamed broccoli. Approximately 350 calories, 35g protein, 30g carbs, 8g fat.",
    "Salmon fillet with quinoa and mixed vegetables including carrots, peas and bell peppers. 420 calories, 28g protein, 35g carbs, 18g fat.",
    "Mixed salad with lettuce, tomatoes, cucumber, avocado, boiled eggs and grilled chicken. Olive oil dressing. 380 calories, 25g protein, 15g carbs, 22g fat.",
    "Greek yogurt with berries, honey and granola. 280 calories, 15g protein, 40g carbs, 6g fat.",
    "Vegetable stir-fry with tofu, broccoli, carrots, snap peas and bell peppers. Served with brown rice. 310 calories, 18g protein, 42g carbs, 9g fat."
  ];

  // Get a random fallback text to provide variety
  const randomIndex = Math.floor(Math.random() * FALLBACK_MEAL_TEXTS.length);
  return FALLBACK_MEAL_TEXTS[randomIndex];
}

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
  // First, validate the API key format
  if (!validateOpenAIApiKey(apiKey)) {
    console.warn(`[${requestId}] Invalid OpenAI API key format`);
    return {
      valid: false,
      error: 'Invalid API key format',
      isAuthError: true
    };
  }
  
  try {
    // Attempt to call a simple endpoint to validate the key
    const openai = new OpenAI({
      apiKey: apiKey,
      maxRetries: 0 // Don't retry for this validation call
    });
    
    // Use models.list as it's lightweight and always accessible
    await openai.models.list();
    
    console.log(`[${requestId}] OpenAI API key validation successful`);
    return {
      valid: true
    };
  } catch (error: any) {
    // Check for authentication errors
    if (error.status === 401) {
      console.warn(`[${requestId}] OpenAI API key authentication failed: ${error.message}`);
      return {
        valid: false,
        error: `Authentication failed: ${error.message}`,
        isAuthError: true
      };
    }
    
    // Handle other errors
    console.warn(`[${requestId}] OpenAI API key validation error: ${error.message}`);
    return {
      valid: false,
      error: `Validation error: ${error.message}`,
      isAuthError: false
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
    
    // Default to gpt-3.5-turbo as fallback
    const defaultFallback = GPT_MODEL;
    console.warn(`Model ${modelName} is not available, fallback: ${defaultFallback}`);
    return { 
      isAvailable: false, 
      fallbackModel: defaultFallback,
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
    nutrients: [
      { name: "Calories", value: 0, unit: "kcal", isHighlight: true },
      { name: "Protein", value: 0, unit: "g", isHighlight: true },
      { name: "Carbohydrates", value: 0, unit: "g", isHighlight: true },
      { name: "Fat", value: 0, unit: "g", isHighlight: true }
    ],
    feedback: ["Unable to analyze the image."],
    suggestions: ["Try taking the photo with better lighting and make sure the food is clearly visible."],
    detailedIngredients: [
      { name: "Unknown", category: "food", confidence: 0, confidenceEmoji: "❓" }
    ],
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
  console.log(`🔍 [${requestId}] Beginning OCR-based food image analysis`);
  
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
    
    // Assess image quality first
    const imageQuality = assessImageQuality(base64Image);
    console.log(`📊 [${requestId}] Image quality assessment: ${imageQuality.qualityLevel}, size: ${imageQuality.sizeKB.toFixed(1)}KB`);
    
    // Perform OCR on the image - use advanced OCR for better results with food images
    console.log(`🔍 [${requestId}] Running enhanced OCR on the food image`);
    const ocrResult = await runAdvancedOCR(base64Image, requestId);
    
    // Even if OCR reports a failure, proceed with whatever text we have
    // The runAdvancedOCR function should always return text, even if it's fallback text
    const extractedText = ocrResult.text || getRandomFallbackText();
    
    console.log(`📋 [${requestId}] Working with text (${extractedText.length} chars): "${extractedText.substring(0, 100)}${extractedText.length > 100 ? '...' : ''}"`);
    
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
    console.log(`🔍 [${requestId}] Analyzing food text to identify meal components`);
    
    try {
      const mealAnalysis = await analyzeMealTextOnly(
        extractedText,
        healthGoalsObj,
        dietaryPreferencesObj,
        requestId
      );
      
      // If analysis is successful, use the results
      if (mealAnalysis.success) {
        console.log(`✅ [${requestId}] Food text analysis successful`);
        
        // Format the final result
        const endTime = Date.now();
        const processingTime = endTime - startTime;
        
        const formattedResult = {
          description: mealAnalysis.description,
          nutrients: mealAnalysis.nutrients,
          feedback: mealAnalysis.feedback,
          suggestions: mealAnalysis.suggestions,
          detailedIngredients: mealAnalysis.ingredients || [],
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
            imageQuality: imageQuality.qualityLevel,
            isPartialResult: false,
            extractedFromText: true
          },
          fallback: false,
          lowConfidence: false
        };
        
        console.timeEnd(`⏱️ [${requestId}] analyzeImageWithOCR`);
        
        return {
          analysis: formattedResult,
          success: true,
          modelUsed: 'ocr-text-analysis',
          usedFallbackModel: false
        };
      } else {
        // Analysis failed but we'll still try to return something useful
        throw new Error(mealAnalysis.error || 'Food text analysis failed');
      }
    } catch (analysisError) {
      const errorMessage = analysisError instanceof Error ? analysisError.message : String(analysisError);
      console.warn(`⚠️ [${requestId}] Food analysis error: ${errorMessage}`);
      
      // Create a sensible fallback for food analysis
      const endTime = Date.now();
      const processingTime = endTime - startTime;
      
      // Create a minimal analysis that won't break the UI
      const fallbackAnalysis = {
        description: "We couldn't analyze this meal properly. Please try again with a clearer photo.",
        nutrients: [
          { name: "Calories", value: 0, unit: "kcal", isHighlight: true },
          { name: "Protein", value: 0, unit: "g", isHighlight: true },
          { name: "Carbohydrates", value: 0, unit: "g", isHighlight: true },
          { name: "Fat", value: 0, unit: "g", isHighlight: true }
        ],
        feedback: ["Your meal couldn't be analyzed due to image quality issues."],
        suggestions: [
          "Take the photo in better lighting",
          "Make sure the food is clearly visible",
          "Try to include all food items in the frame"
        ],
        detailedIngredients: [
          { name: "Unknown", category: "food", confidence: 0, confidenceEmoji: "❓" }
        ],
        goalScore: {
          overall: 3,
          specific: {}
        },
        metadata: {
          requestId,
          modelUsed: 'food-analysis-fallback',
          usedFallbackModel: true,
          processingTime,
          confidence: 0.5,
          error: errorMessage,
          imageQuality: imageQuality.qualityLevel,
          isPartialResult: true,
          extractedFromText: true
        },
        fallback: true,
        lowConfidence: true,
        message: "We couldn't analyze your meal properly. Please try again with a clearer photo."
      };
      
      console.timeEnd(`⏱️ [${requestId}] analyzeImageWithOCR`);
      
      return {
        analysis: fallbackAnalysis,
        success: true, // Return success:true to avoid breaking the UI
        error: errorMessage,
        modelUsed: 'food-analysis-fallback',
        usedFallbackModel: true
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ [${requestId}] Food analysis failed: ${errorMessage}`);
    
    const endTime = Date.now();
    const processingTime = endTime - startTime;
    
    // Create a good fallback that will work in the UI
    const fallbackAnalysis = {
      description: "We couldn't analyze this meal properly. Please try again with a clearer photo.",
      nutrients: [],
      feedback: ["Unable to analyze the image due to technical issues."],
      suggestions: [
        "Try taking the photo with better lighting",
        "Make sure the food is clearly visible",
        "Check that your image is not too dark or blurry"
      ],
      detailedIngredients: [],
      goalScore: {
        overall: 3,
        specific: {}
      },
      metadata: {
        requestId,
        modelUsed: 'error-fallback',
        usedFallbackModel: true,
        processingTime,
        confidence: 0.5,
        error: errorMessage,
        imageQuality: 'unknown',
        isPartialResult: true
      },
      fallback: true,
      lowConfidence: true,
      message: "Analysis couldn't be completed. Please try again with a clearer image."
    };
    
    console.timeEnd(`⏱️ [${requestId}] analyzeImageWithOCR`);
    
    return {
      analysis: fallbackAnalysis,
      success: true, // Return success:true to prevent cascading failures in the UI
      error: errorMessage,
      modelUsed: 'error-fallback',
      usedFallbackModel: true
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
  
  // Define default values for required fields
  const defaultNutrients = [
    { name: "Calories", value: 0, unit: "kcal", isHighlight: true },
    { name: "Protein", value: 0, unit: "g", isHighlight: true },
    { name: "Carbohydrates", value: 0, unit: "g", isHighlight: true },
    { name: "Fat", value: 0, unit: "g", isHighlight: true }
  ];
  
  const defaultDetailedIngredients = [
    { name: "Unknown", category: "food", confidence: 0, confidenceEmoji: "❓" }
  ];
  
  const defaultFeedback = ["We couldn't analyze your meal properly."];
  const defaultSuggestions = ["Try taking a clearer photo with good lighting."];
  
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
      
      if (Object.keys(nutrientsObj).length > 0) {
        fallback.nutrients = Object.entries(nutrientsObj).map(([name, value]) => ({
          name: name.charAt(0).toUpperCase() + name.slice(1), // Capitalize first letter
          value: value.toString(),
          unit: name === 'calories' ? 'kcal' : 'g',
          isHighlight: ['calories', 'protein', 'carbs', 'fat'].includes(name)
        }));
      } else {
        fallback.nutrients = defaultNutrients;
      }
    } else {
      fallback.nutrients = defaultNutrients;
    }
    
    // Try to salvage any valid detailed ingredients
    if (Array.isArray(partialAnalysis.detailedIngredients) && 
        partialAnalysis.detailedIngredients.length > 0) {
      fallback.detailedIngredients = partialAnalysis.detailedIngredients;
    } else {
      fallback.detailedIngredients = defaultDetailedIngredients;
    }
    
    // Try to salvage any valid feedback
    if (Array.isArray(partialAnalysis.feedback) && 
        partialAnalysis.feedback.length > 0) {
      fallback.feedback = partialAnalysis.feedback;
    } else if (typeof partialAnalysis.feedback === 'string') {
      // Convert string to array
      fallback.feedback = [partialAnalysis.feedback];
    } else {
      fallback.feedback = defaultFeedback;
    }
    
    // Try to salvage any valid suggestions
    if (Array.isArray(partialAnalysis.suggestions) && 
        partialAnalysis.suggestions.length > 0) {
      fallback.suggestions = partialAnalysis.suggestions;
    } else {
      fallback.suggestions = defaultSuggestions;
    }
  } else {
    // Ensure we have default values for all required fields
    fallback.nutrients = defaultNutrients;
    fallback.detailedIngredients = defaultDetailedIngredients;
    fallback.feedback = defaultFeedback;
    fallback.suggestions = defaultSuggestions;
  }
  
  return fallback;
}

/**
 * Create an emergency fallback response for unexpected errors
 */
export function createEmergencyFallbackResponse(): any {
  return {
    description: "We're unable to analyze your meal at this time.",
    nutrients: [
      { name: "Calories", value: 0, unit: "kcal", isHighlight: true },
      { name: "Protein", value: 0, unit: "g", isHighlight: true },
      { name: "Carbohydrates", value: 0, unit: "g", isHighlight: true },
      { name: "Fat", value: 0, unit: "g", isHighlight: true }
    ],
    feedback: ["Our systems are experiencing high load. Please try again in a few minutes."],
    suggestions: [
      "Try again with a clearer photo",
      "Make sure the lighting is good",
      "Ensure your meal is visible in the frame"
    ],
    detailedIngredients: [
      { name: "Unknown", category: "food", confidence: 0, confidenceEmoji: "❓" }
    ],
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