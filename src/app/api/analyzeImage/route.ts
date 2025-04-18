import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import crypto from 'crypto';
import OpenAI from 'openai';
import { adminStorage } from '@/lib/firebaseAdmin';
import { trySaveMealServer } from '@/lib/serverMealUtils';
import { uploadImageToFirebase } from '@/lib/firebaseStorage';
import { extractBase64Image, extractTextFromImage } from '@/lib/imageProcessing';
import { GPT_MODEL } from '@/lib/constants';
import { getNutritionData, createNutrientAnalysis } from '@/lib/nutritionixApi';
import { createEmptyFallbackAnalysis } from '@/lib/analyzeImageWithGPT4V';

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
  result: any | null;
  error: string | null;
  elapsedTime: number;
}

// Mock implementation for backward compatibility during migration
function createFallbackResponse(reason: string, partialResult: any, reqId: string = 'unknown'): any {
  return {
    description: "Unable to analyze the image at this time.",
    nutrients: [],
    feedback: ["We couldn't process your image. Please try again with a clearer photo of your meal."],
    suggestions: ["Try taking the photo in better lighting", "Make sure your meal is clearly visible"],
    detailedIngredients: [],
    goalScore: {
      overall: 0,
      specific: {} as Record<string, number>,
    },
    metadata: {
      requestId: reqId,
      modelUsed: "text_extraction_fallback",
      usedFallbackModel: true,
      processingTime: 0,
      confidence: 0,
      error: reason,
      imageQuality: "unknown"
    }
  };
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
    let healthGoals: string[] = [];
    let userId = null;
    let dietaryPreferences: string[] = [];
    
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
        healthGoals = jsonData.healthGoals || [];
        userId = jsonData.userId || null;
        dietaryPreferences = jsonData.dietaryPreferences || [];
        
        // Log extracted data (excluding image content)
        console.log(`👤 [${requestId}] User ID:`, userId || 'not provided');
        console.log(`🎯 [${requestId}] Health goals provided:`, healthGoals.length > 0);
        console.log(`🥕 [${requestId}] Dietary preferences provided:`, dietaryPreferences.length > 0);
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
        console.log(`🔄 [${requestId}] Uploading image to Firebase for user ${userId}`);
        imageUrl = await uploadImageToFirebase(base64Image, userId, requestId);
        console.log(`✅ [${requestId}] Image upload successful: ${imageUrl}`);
        response.imageUrl = imageUrl;
      } catch (error) {
        console.error(`❌ [${requestId}] Firebase upload failed:`, error);
        // Continue with analysis even if upload fails
      }
    }
    
    // Set up timeout controller
    const controller = new AbortController();
    const globalTimeoutMs = 25000; // 25 second timeout
    const globalController = new AbortController();

    // Set global timeout
    const timeoutId = setTimeout(() => {
      console.warn(`⏱️ [${requestId}] Global timeout reached after ${globalTimeoutMs}ms`);
      globalController.abort('Global timeout reached');
    }, globalTimeoutMs);

    // Process the image analysis with text extraction instead of vision models
    let textualDescription = '';
    let nutritionData = null;
    let analysisFailed = false;
    let failureReason = '';
    let isTimeout = false;
    let fallbackMessage = '';

    try {
      console.log(`🔍 [${requestId}] Starting image analysis using text extraction method`);
      
      // Step 1: Extract text description from image
      const textExtractionResult = await extractTextFromImage(
        base64Image,
        requestId,
        healthGoals
      );
      
      if (!textExtractionResult.success) {
        throw new Error(textExtractionResult.error || 'Failed to extract text from image');
      }
      
      textualDescription = textExtractionResult.description;
      console.log(`✅ [${requestId}] Text extraction successful: "${textualDescription.substring(0, 100)}..."`);
      
      // Step 2: Get nutrition data based on the extracted text
      const nutritionResult = await getNutritionData(textualDescription, requestId);
      
      if (nutritionResult.success && nutritionResult.data) {
        nutritionData = nutritionResult.data;
        console.log(`✅ [${requestId}] Nutrition data retrieved successfully for ${nutritionData.foods?.length || 0} items`);
      } else {
        console.warn(`⚠️ [${requestId}] Nutrition data fetch failed: ${nutritionResult.error}`);
        // Continue with analysis even without nutrition data
      }
      
      // Step 3: Create analysis with the extracted description and nutrition data
      const healthGoalString = healthGoals.length > 0 ? healthGoals[0] : 'general health';
      
      // Combine extracted description with nutrition data
      let analysisResult: any = {
        description: textualDescription,
        nutrients: nutritionData?.nutrients || [],
        modelInfo: {
          model: textExtractionResult.modelUsed,
          usedFallback: false,
          forceGPT4V: false
        }
      };
      
      // Add nutrient analysis based on goals if we have nutrition data
      if (nutritionData) {
        const goalAnalysis = createNutrientAnalysis(
          nutritionData.nutrients,
          healthGoals,
          requestId
        );
        
        analysisResult = {
          ...analysisResult,
          feedback: goalAnalysis.feedback,
          suggestions: goalAnalysis.suggestions,
          goalScore: goalAnalysis.goalScore,
          goalName: formatGoalName(healthGoalString)
        };
      } else {
        // Generic feedback if no nutrition data
        analysisResult.feedback = [
          "We analyzed your meal based on visual characteristics only.",
          "For more specific nutrition advice, try taking a clearer photo."
        ];
        analysisResult.suggestions = [
          "Include all food items in the frame",
          "Take photos in good lighting"
        ];
        analysisResult.goalScore = 5; // Neutral score
        analysisResult.goalName = formatGoalName(healthGoalString);
      }
      
      // Mark as successful
      response.success = true;
      response.result = analysisResult;
      response.message = 'Analysis completed successfully';
      
      // Try to save the meal to Firestore if we have a userId
      if (userId && imageUrl) {
        try {
          console.log(`🔄 [${requestId}] Saving meal to Firestore for user ${userId}`);
          const saveResult = await trySaveMealServer({
            userId,
            analysis: analysisResult,
            imageUrl,
            requestId
          });
          
          if (saveResult.success) {
            console.log(`✅ [${requestId}] Meal saved successfully with ID: ${saveResult.savedMealId}`);
            response.message = 'Analysis completed and meal saved successfully';
          } else {
            console.warn(`⚠️ [${requestId}] Failed to save meal: ${saveResult.error}`);
            // Don't fail the entire response just because saving failed
          }
        } catch (saveError) {
          console.error(`❌ [${requestId}] Error saving meal:`, saveError);
          // Continue without failing the whole response
        }
      }
    } catch (error: any) {
      console.error(`❌ [${requestId}] Analysis failed:`, error);
      analysisFailed = true;
      fallbackMessage = error.message || 'Unknown error during analysis';
      failureReason = error.code || 'analysis_error';
      
      // Check if it was a timeout
      isTimeout = error.name === 'AbortError' || fallbackMessage.includes('timeout');
      
      // Create fallback response
      let fallbackResponse = createEmptyFallbackAnalysis(requestId, "text_extraction", fallbackMessage);
      
      response.success = false;
      response.fallback = true;
      response.result = fallbackResponse;
      response.error = fallbackMessage;
      response.message = 'Analysis failed, using fallback response';
    } finally {
      // Clear the timeout
      clearTimeout(timeoutId);
    }

    // Calculate elapsed time
    const elapsedTime = Date.now() - startTime;
    response.elapsedTime = elapsedTime;

    // Log response and clean up
    console.log(`📤 [${requestId}] Analysis complete in ${elapsedTime}ms`);
    console.log(`📈 [${requestId}] Success: ${response.success}, Fallback: ${response.fallback}`);
    console.timeEnd(`⏱️ [${requestId}] analyzeImage POST`);

    return NextResponse.json(response);
  } catch (error) {
    // Handle any unexpected errors
    console.error(`❌ [${requestId}] Unexpected error in analyzeImage:`, error);
    
    response.success = false;
    response.fallback = true;
    response.message = 'An unexpected error occurred during image analysis.';
    response.error = error instanceof Error ? error.message : String(error);
    response.result = createFallbackResponse('unexpected_error', null, requestId);
    response.elapsedTime = Date.now() - startTime;
    
    console.timeEnd(`⏱️ [${requestId}] analyzeImage POST`);
    
    return NextResponse.json(response, { status: 500 });
  }
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