import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import crypto from 'crypto';
import OpenAI from 'openai';
import { adminStorage } from '@/lib/firebaseAdmin';
import { trySaveMealServer } from '@/lib/serverMealUtils';
import { createAnalysisResponse, createEmptyFallbackAnalysis, createErrorResponse } from './analyzer';
import { isValidAnalysis, createFallbackAnalysis, normalizeAnalysisResult } from '@/lib/utils/analysisValidator';
import { safeExtractImage } from '@/lib/imageProcessing/safeExtractImage';
import { GPT_VISION_MODEL, FALLBACK_MODELS } from '@/lib/constants';
import { 
  analyzeImageWithGPT4V as analyzeWithGPT4V, 
  validateAndTestAPIKey,
  checkModelAvailability,
  createEmptyFallbackAnalysis as createEmptyFallbackAnalysisUtil
} from '@/lib/analyzeImageWithGPT4V';
import { uploadImageToFirebase } from '@/lib/firebaseStorage';
import { extractBase64Image } from '@/lib/imageProcessing';

// Comment out conflicting imports
// import { uploadImageToFirebase as uploadToFirebase } from '@/lib/firebaseStorage';
// import { extractBase64Image } from '@/lib/imageProcessing';

// Placeholder image for development fallback
const PLACEHOLDER_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// Trigger new Vercel deployment - 15 Apr 2025
// Request concurrency tracking
let activeRequests = 0;
const requestStartTimes = new Map<string, number>();
const MAX_CONCURRENT_REQUESTS = 10; // Limit concurrent requests for stability

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
  
  // Check if the detailedIngredients have low average confidence
  if (analysis.detailedIngredients && analysis.detailedIngredients.length > 0) {
    const totalConfidence = analysis.detailedIngredients.reduce(
      (sum: number, ingredient: any) => sum + (ingredient.confidence || 0), 
      0
    );
    const avgConfidence = totalConfidence / analysis.detailedIngredients.length;
    
    if (avgConfidence < 5) {
      return true;
    }
    
    // Check if majority of ingredients have low confidence
    const lowConfidenceCount = analysis.detailedIngredients.filter(
      (i: any) => i.confidence < 5
    ).length;
    
    if (lowConfidenceCount > analysis.detailedIngredients.length / 2) {
      return true;
    }
  }
  
  // Check if there are reported image challenges
  if (analysis.imageChallenges && analysis.imageChallenges.length > 0) {
    return true;
  }
  
  return false;
}

// The analyzeImageWithGPT4V function implementation has been moved to src/lib/analyzeImageWithGPT4V.ts
// We are now using the imported version (renamed to analyzeWithGPT4V in the imports section)

/**
 * Extracts JSON from possibly malformed text that might contain markdown or other formatting
 */
function extractJSONFromText(text: string, requestId: string): any | null {
  if (!text || typeof text !== 'string') {
    console.error(`[${requestId}] Text to extract JSON from is empty or not a string`);
    return null;
  }

  // First try: simple JSON.parse if it's already valid JSON
  try {
    return JSON.parse(text);
  } catch (e) {
    console.log(`[${requestId}] Initial JSON.parse failed, trying alternative extraction methods`);
  }
  
  // Second try: Look for JSON between code blocks or backticks
  try {
    // Try to extract JSON from markdown code blocks
    const codeBlockMatch = text.match(/```(?:json)?([\s\S]*?)```/);
    if (codeBlockMatch && codeBlockMatch[1]) {
      const jsonContent = codeBlockMatch[1].trim();
      console.log(`[${requestId}] Found JSON in code block, attempting to parse`);
      return JSON.parse(jsonContent);
    }
  } catch (e) {
    console.log(`[${requestId}] Code block extraction failed:`, e);
  }
  
  // Third try: Look for anything that looks like a JSON object
  try {
    const possibleJson = text.match(/(\{[\s\S]*\})/);
    if (possibleJson && possibleJson[1]) {
      const jsonContent = possibleJson[1].trim();
      console.log(`[${requestId}] Found possible JSON object, attempting to parse`);
      return JSON.parse(jsonContent);
    }
  } catch (e) {
    console.log(`[${requestId}] Object extraction failed:`, e);
  }
  
  // Final attempt: Aggressive cleaning - remove all non-JSON characters
  try {
    // Remove any non-JSON characters at the beginning of the string
    let cleanedText = text.replace(/^[^{]*/, '');
    
    // Remove any non-JSON characters at the end of the string
    cleanedText = cleanedText.replace(/[^}]*$/, '');
    
    // Try to parse the cleaned text
    if (cleanedText.startsWith('{') && cleanedText.endsWith('}')) {
      console.log(`[${requestId}] Attempting to parse aggressively cleaned text`);
      return JSON.parse(cleanedText);
    }
  } catch (e) {
    console.log(`[${requestId}] Aggressive cleaning failed:`, e);
  }
  
  console.error(`[${requestId}] All JSON extraction methods failed`);
  return null;
}

/**
 * Validates that all required fields exist in the analysis
 */
function validateRequiredFields(result: any): boolean {
  if (!result || typeof result !== 'object') {
    return false;
  }
  
  // Check for required string fields
  if (typeof result.description !== 'string' || !result.description.trim()) {
    return false;
  }
  
  // Check for required nutrients object
  if (!result.nutrients || typeof result.nutrients !== 'object') {
    return false;
  }
  
  // Check for required nutrient fields
  const nutrients = result.nutrients;
  if (!('calories' in nutrients) || 
      !('protein' in nutrients) || 
      !('carbs' in nutrients) || 
      !('fat' in nutrients)) {
    return false;
  }
  
  // Check for required array fields
  if (!Array.isArray(result.feedback) || result.feedback.length === 0) {
    return false;
  }
  
  if (!Array.isArray(result.suggestions) || result.suggestions.length === 0) {
    return false;
  }
  
  // Check for goalScore
  if (typeof result.goalScore !== 'number') {
    return false;
  }
  
  return true;
}

// Helper function to standardize nutrient values
function standardizeNutrientValues(result: any): any {
  if (!result || !result.nutrients) return result;
  
  // Create a copy to avoid modifying the original
  const standardized = { ...result };
  const nutrients = { ...standardized.nutrients };
  
  // Ensure all expected nutrient fields exist
  const expectedNutrients = ['calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'sodium'];
  
  expectedNutrients.forEach(key => {
    // Create the field if it doesn't exist
    if (nutrients[key] === undefined) {
      nutrients[key] = 0;
      console.log(`Added missing nutrient: ${key}`);
    }
    
    // Handle if it's already a string
    if (typeof nutrients[key] === 'string') {
      // If it's a string with numeric content, try to parse it
      const numericValue = parseFloat(nutrients[key]);
      if (!isNaN(numericValue)) {
        nutrients[key] = numericValue;
      }
    }
    
    // Ensure all values are strings for consistent frontend handling
    if (typeof nutrients[key] === 'number') {
      nutrients[key] = nutrients[key].toString();
    }
  });
  
  // Handle possible nested or array-based nutrient structures
  if (Array.isArray(result.nutrients)) {
    console.log('Converting array-based nutrients to object format');
    const nutrientsObj: Record<string, string> = {};
    
    result.nutrients.forEach((item: any) => {
      if (item && item.name) {
        const name = item.name.toLowerCase().replace(/\s+/g, '');
        nutrientsObj[name] = item.value?.toString() || '0';
      }
    });
    
    // Ensure required nutrients exist
    expectedNutrients.forEach(key => {
      if (!nutrientsObj[key]) nutrientsObj[key] = '0';
    });
    
    standardized.nutrients = nutrientsObj;
  } else {
    standardized.nutrients = nutrients;
  }
  
  return standardized;
}

// Mock implementation for backward compatibility during migration
function needsConfidenceEnrichment(analysis: any): boolean {
  return false;
}

// Mock implementation for backward compatibility during migration
async function enrichAnalysisResult(
  originalResult: any,
  healthGoals: string[],
  dietaryPreferences: string[],
  requestId: string
): Promise<any> {
  return originalResult;
}

// Mock implementation for backward compatibility during migration
function validateGptAnalysisResult(analysis: any): boolean {
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

// Mock implementation for backward compatibility during migration
function createFallbackResponse(reason: string, partialResult: any, reqId: string = 'unknown'): any {
  return createEmptyFallbackAnalysisUtil(reqId, 'fallback', reason);
}

// Define the AnalysisResponse interface
interface AnalysisResponse {
  success: boolean;
  fallback: boolean;
  requestId: string;
  message: string;
  imageUrl: string | null;
  result: any | null;
  error: string | null;
  elapsedTime: number;
}

// The main POST handler for image analysis
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  console.time(`⏱️ [${requestId}] analyzeImage POST`);
  console.log(`📥 [${requestId}] Analyzing image - request received`);

  const startTime = Date.now();
  
  // Initialize response object
  const response: AnalysisResponse = {
    success: false,
    fallback: false,
    requestId,
    message: '',
    imageUrl: null,
    result: null,
    error: null,
    elapsedTime: 0
  };

  try {
    // Parse request body based on content type
    let formData = null;
    let healthGoals = null;
    let userId = null;
    let dietaryPreferences = null;
    
    const contentType = request.headers.get('content-type') || '';
    console.log(`📄 [${requestId}] Content-Type: ${contentType}`);
    
    if (contentType.includes('multipart/form-data')) {
      console.log(`📝 [${requestId}] Parsing multipart form data`);
      try {
        formData = await request.formData();
        console.log(`📋 [${requestId}] Form data keys:`, Array.from(formData.keys()));
        
        // Extract other fields from form data
        userId = formData.get('userId')?.toString() || null;
        
        // Parse health goals as JSON if it exists
        const healthGoalsRaw = formData.get('healthGoals')?.toString();
        if (healthGoalsRaw) {
          try {
            healthGoals = JSON.parse(healthGoalsRaw);
            console.log(`🎯 [${requestId}] Parsed health goals:`, JSON.stringify(healthGoals));
          } catch (error) {
            console.warn(`⚠️ [${requestId}] Failed to parse health goals:`, error);
            // Continue without health goals
          }
        }
        
        // Parse dietary preferences as JSON if it exists
        const dietaryPreferencesRaw = formData.get('dietaryPreferences')?.toString();
        if (dietaryPreferencesRaw) {
          try {
            dietaryPreferences = JSON.parse(dietaryPreferencesRaw);
            console.log(`🥕 [${requestId}] Parsed dietary preferences:`, JSON.stringify(dietaryPreferences));
          } catch (error) {
            console.warn(`⚠️ [${requestId}] Failed to parse dietary preferences:`, error);
            // Continue without dietary preferences
          }
        }
      } catch (error) {
        console.error(`❌ [${requestId}] Failed to parse multipart form data:`, error);
        throw new Error(`Failed to parse form data: ${error}`);
      }
    } else if (contentType.includes('application/json')) {
      console.log(`📝 [${requestId}] Parsing JSON data`);
      try {
        const jsonData = await request.json();
        console.log(`📋 [${requestId}] JSON data keys:`, Object.keys(jsonData));
        
        // Extract fields from JSON
        formData = jsonData.image || jsonData.file || jsonData.base64Image || null;
        healthGoals = jsonData.healthGoals || null;
        userId = jsonData.userId || null;
        dietaryPreferences = jsonData.dietaryPreferences || null;
        
        // Log extracted data (excluding image content)
        console.log(`👤 [${requestId}] User ID:`, userId || 'not provided');
        console.log(`🎯 [${requestId}] Health goals provided:`, !!healthGoals);
        console.log(`🥕 [${requestId}] Dietary preferences provided:`, !!dietaryPreferences);
        console.log(`🖼️ [${requestId}] Image/file provided:`, !!formData);
      } catch (error) {
        console.error(`❌ [${requestId}] Failed to parse JSON:`, error);
        throw new Error(`Failed to parse JSON: ${error}`);
      }
    } else {
      console.error(`❌ [${requestId}] Unsupported content type: ${contentType}`);
      throw new Error(`Unsupported content type: ${contentType}`);
    }
    
    // Validate that we have image data
    if (!formData) {
      console.error(`❌ [${requestId}] No image data provided`);
      throw new Error('No image provided. Please include an image file.');
    }
    
    // Extract base64 from the image
    let base64Image = '';
    try {
      console.log(`🔍 [${requestId}] Extracting base64 from image`);
      base64Image = await extractBase64Image(formData, requestId);
      console.log(`✅ [${requestId}] Base64 extraction successful (${base64Image.length} chars)`);
    } catch (error) {
      console.error(`❌ [${requestId}] Failed to extract base64 from image:`, error);
      throw new Error(`Failed to process image: ${error}`);
    }
    
    // Upload image to Firebase if userId is provided
    let imageUrl = null;
    if (userId) {
      try {
        console.log(`🔼 [${requestId}] Uploading image to Firebase for user ${userId}`);
        imageUrl = await uploadImageToFirebase(base64Image, userId, requestId);
        console.log(`✅ [${requestId}] Firebase upload successful: ${imageUrl}`);
        response.imageUrl = imageUrl;
        
        // Validate the image URL format
        if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('https://')) {
          console.error(`❌ [${requestId}] Invalid image URL format: ${imageUrl}`);
          throw new Error('Invalid image URL format');
        }
        
        // Check if the URL is accessible
        console.log(`🔍 [${requestId}] Validating image URL accessibility...`);
        const urlCheckResponse = await fetch(imageUrl, { method: 'HEAD' }).catch(e => {
          console.error(`❌ [${requestId}] Image URL check failed: ${e.message}`);
          return null;
        });
        
        if (!urlCheckResponse || !urlCheckResponse.ok) {
          console.error(`❌ [${requestId}] Image URL is not accessible: ${urlCheckResponse?.status || 'unknown error'}`);
          throw new Error(`Image URL is not accessible: ${urlCheckResponse?.status || 'unknown error'}`);
        }
        
        console.log(`✅ [${requestId}] Image URL is valid and accessible`);
      } catch (error) {
        console.error(`❌ [${requestId}] Error uploading image: ${error instanceof Error ? error.message : String(error)}`);
        return NextResponse.json(
          {
            errorCode: "IMAGE_UPLOAD_ERROR",
            message: "Failed to upload image for analysis",
            details: error instanceof Error ? error.message : String(error),
          },
          { status: 500 }
        );
      }
    } else {
      console.log(`ℹ️ [${requestId}] No userId provided, skipping Firebase upload`);
    }
    
    // Check OpenAI API key and model availability
    console.log(`🔑 [${requestId}] Checking OpenAI API key and model availability`);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error(`❌ [${requestId}] OpenAI API key is not set in environment variables`);
      throw new Error('OpenAI API key is not configured');
    }

    const { valid: isApiKeyValid, error: apiKeyError } = await validateAndTestAPIKey(apiKey, requestId);

    if (!isApiKeyValid) {
      console.error(`❌ [${requestId}] Invalid OpenAI API key:`, apiKeyError);
      throw new Error(`OpenAI API key validation failed: ${apiKeyError}`);
    }

    // Check if the preferred model is available 
    const { isAvailable, fallbackModel, errorMessage: modelError } = 
      await checkModelAvailability(GPT_VISION_MODEL, apiKey);

    const available = isAvailable;
    
    if (!available && !fallbackModel) {
      console.error(`❌ [${requestId}] No models available:`, modelError);
      throw new Error(`No OpenAI models available: ${modelError}`);
    }
    
    // Select model to use
    const modelToUse = available ? GPT_VISION_MODEL : fallbackModel;
    console.log(`🤖 [${requestId}] Using model: ${modelToUse} ${!available ? '(fallback)' : ''}`);
    
    // Analyze image with the imported function
    console.log(`🧠 [${requestId}] Analyzing image with GPT-4V`);
    const analysisResponse = await analyzeWithGPT4V(
      base64Image, 
      Array.isArray(healthGoals) ? healthGoals : [], 
      Array.isArray(dietaryPreferences) ? dietaryPreferences : [],
      requestId
    );
    console.log(`✅ [${requestId}] Analysis complete`);
    
    // Extract the analysis result and metadata
    const analysisResult = analysisResponse.analysis;
    const isFallbackResponse = 
      !analysisResponse.success || 
      !!analysisResponse.error;
    
    // Build success response
    response.success = analysisResponse.success;
    response.fallback = isFallbackResponse;
    response.message = isFallbackResponse 
      ? `Analysis completed with fallback content. ${analysisResponse.error || ''}`
      : 'Analysis completed successfully';
    response.result = analysisResult;
    
    // Calculate elapsed time
    const elapsedTime = Date.now() - startTime;
    response.elapsedTime = elapsedTime;
    
    console.log(`✅ [${requestId}] Request completed in ${elapsedTime}ms. Fallback: ${isFallbackResponse}`);
    console.timeEnd(`⏱️ [${requestId}] analyzeImage POST`);
    
    return NextResponse.json(response);
  } catch (error: any) {
    const errorMessage = error?.message || 'Unknown error';
    const elapsedTime = Date.now() - startTime;
    
    console.error(`❌ [${requestId}] Request failed after ${elapsedTime}ms:`, errorMessage);
    
    // Generate fallback analysis if main analysis fails
    let fallbackAnalysis = null;
    try {
      console.log(`🔄 [${requestId}] Generating fallback analysis`);
      fallbackAnalysis = createEmptyFallbackAnalysisUtil(requestId, 'fallback', errorMessage);
      console.log(`✅ [${requestId}] Fallback analysis generated`);
    } catch (fallbackError: any) {
      console.error(`❌ [${requestId}] Failed to generate fallback analysis:`, fallbackError);
    }
    
    // Build error response
    response.success = false;
    response.fallback = !!fallbackAnalysis;
    response.message = `Analysis failed: ${errorMessage}`;
    response.error = errorMessage;
    response.result = fallbackAnalysis;
    response.elapsedTime = elapsedTime;
    
    console.timeEnd(`⏱️ [${requestId}] analyzeImage POST`);
    return NextResponse.json(response, { status: 500 });
  }
}