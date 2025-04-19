import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import crypto from 'crypto';
import { adminStorage } from '@/lib/firebaseAdmin';
import { trySaveMealServer } from '@/lib/serverMealUtils';
import { uploadImageToFirebase } from '@/lib/firebaseStorage';
import { extractBase64Image } from '@/lib/imageProcessing';
import { getNutritionData, createNutrientAnalysis, NutritionData } from '@/lib/nutritionixApi';
import { createEmptyFallbackAnalysis } from '@/lib/analyzeImageWithOCR';
import { runOCR, OCRResult } from '@/lib/runOCR';
import { analyzeMealTextOnly, MealAnalysisResult } from '@/lib/analyzeMealTextOnly';
import { API_CONFIG } from '@/lib/constants';
import { createAnalysisDiagnostics, checkOCRConfig, checkNutritionixCredentials } from '@/lib/diagnostics';

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
  result: AnalysisResult | null;
  error: string | null;
  elapsedTime: number;
  diagnostics: any | null;
}

interface AnalysisResult {
  description: string;
  nutrients: Array<{
    name: string;
    value: string | number;
    unit: string;
    isHighlight: boolean;
    percentOfDailyValue?: number;
    amount?: number;
  }>;
  feedback: string[];
  suggestions: string[];
  detailedIngredients: Array<{
    name: string;
    category: string;
    confidence: number;
    confidenceEmoji?: string;
  }>;
  goalScore: {
    overall: number;
    specific: Record<string, number>;
  };
  goalName?: string;
  modelInfo?: {
    model: string;
    usedFallback: boolean;
    ocrExtracted: boolean;
  };
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

  // Create diagnostics session for tracking the analysis pipeline
  const { diagnostics, recordStage, complete } = createAnalysisDiagnostics(requestId);
  
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
    elapsedTime: 0,
    diagnostics: null // Will be populated at the end
  };

  try {
    // Check OCR configuration first
    const ocrConfig = await recordStage('check-ocr-config', async () => {
      return checkOCRConfig();
    });
    
    console.log(`📋 [${requestId}] OCR configuration: ${JSON.stringify(ocrConfig)}`);
    
    // Parse request body based on content type
    let formData: FormData | Record<string, any> | null = null;
    let healthGoals: string[] = [];
    let userId: string | null = null;
    let dietaryPreferences: string[] = [];
    
    // Extract request data
    await recordStage('extract-request-data', async () => {
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
      
      return { userId, healthGoals, dietaryPreferences, formDataReceived: !!formData };
    });
    
    // Extract base64 from the image
    const base64Image = await recordStage('extract-base64-image', async () => {
      try {
        console.log(`🔍 [${requestId}] Extracting base64 from image`);
        const base64 = await extractBase64Image(formData!, requestId);
        console.log(`✅ [${requestId}] Base64 extraction successful (${base64.length} chars)`);
        return base64;
      } catch (error) {
        console.error(`❌ [${requestId}] Failed to extract base64 from image:`, error);
        throw new Error(`Failed to process image: ${error}`);
      }
    });
    
    // Upload image to Firebase if userId is provided
    let imageUrl = null;
    if (userId) {
      try {
        imageUrl = await recordStage('upload-to-firebase', async () => {
          console.log(`🔄 [${requestId}] Uploading image to Firebase for user ${userId}`);
          const url = await uploadImageToFirebase(base64Image, userId!, requestId);
          console.log(`✅ [${requestId}] Image upload successful: ${url}`);
          response.imageUrl = url;
          return url;
        });
      } catch (error) {
        console.error(`❌ [${requestId}] Firebase upload failed:`, error);
        // Continue with analysis even if upload fails
      }
    }
    
    // Set up timeout controller
    const controller = new AbortController();
    const globalTimeoutMs = parseInt(process.env.OPENAI_TIMEOUT_MS || '', 10) || API_CONFIG.DEFAULT_TIMEOUT_MS;
    const signal = controller.signal;

    console.log(`⏱️ [${requestId}] Setting global timeout: ${globalTimeoutMs}ms (${globalTimeoutMs/1000} seconds)`);

    // Set global timeout
    const timeoutId = setTimeout(() => {
      console.warn(`⏱️ [${requestId}] Global timeout reached after ${globalTimeoutMs}ms`);
      controller.abort('Global timeout reached');
    }, globalTimeoutMs);

    // Process the image with text-based analysis using OCR
    let extractedText = '';
    let mealAnalysis: MealAnalysisResult | null = null;
    let nutritionData: NutritionData | null = null;
    let analysisFailed = false;
    let failureReason = '';
    let isTimeout = false;

    try {
      // Check Nutritionix credentials
      await recordStage('check-nutritionix-credentials', async () => {
        const credentialCheck = await checkNutritionixCredentials();
        console.log(`📋 [${requestId}] Nutritionix credential check:`, 
          `Success: ${credentialCheck.success}, ` +
          `App ID: ${credentialCheck.appId ? 'valid' : 'missing'}, ` +
          `API Key: ${credentialCheck.apiKey ? 'present' : 'missing'}`
        );
        
        if (!credentialCheck.success) {
          console.warn(`⚠️ [${requestId}] Nutritionix credential issue: ${credentialCheck.error}`);
        }
        
        return credentialCheck;
      });
      
      // Step a: Run OCR on the image to extract text
      extractedText = await recordStage('run-ocr', async () => {
        console.log(`🔍 [${requestId}] Running OCR to extract text from image`);
        const ocrResult: OCRResult = await runOCR(base64Image, requestId);
        
        if (!ocrResult.success || !ocrResult.text) {
          console.warn(`⚠️ [${requestId}] OCR extraction failed or returned no text: ${ocrResult.error || 'No text extracted'}`);
          throw new Error(ocrResult.error || 'Failed to extract text from image');
        }
        
        const text = ocrResult.text;
        console.log(`✅ [${requestId}] OCR successful, extracted ${text.length} characters`);
        console.log(`📋 [${requestId}] Extracted text: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
        return text;
      });
      
      // Step b: Analyze the extracted text with GPT
      mealAnalysis = await recordStage('analyze-text', async () => {
        console.log(`🔍 [${requestId}] Analyzing extracted text to identify meal components`);
        
        // Convert health goals and dietary preferences to the expected format
        const healthGoalsObj = {
          primary: healthGoals.length > 0 ? healthGoals[0] : 'general health',
          additional: healthGoals.slice(1)
        };
        
        const dietaryPreferencesObj = {
          allergies: dietaryPreferences.filter(p => p.toLowerCase().includes('allergy') || p.toLowerCase().includes('allergic')),
          avoidances: dietaryPreferences.filter(p => !p.toLowerCase().includes('allergy') && !p.toLowerCase().includes('allergic'))
        };
        
        const analysis = await analyzeMealTextOnly(
          extractedText, 
          healthGoalsObj, 
          dietaryPreferencesObj, 
          requestId
        );
        
        if (!analysis.success && analysis.error) {
          console.warn(`⚠️ [${requestId}] Text analysis failed: ${analysis.error}`);
          throw new Error(analysis.error);
        }
        
        console.log(`✅ [${requestId}] Text analysis successful`);
        console.log(`📋 [${requestId}] Identified meal: ${analysis.description}`);
        console.log(`📋 [${requestId}] Identified ingredients: ${analysis.ingredients.map(i => i.name).join(', ')}`);
        
        return analysis;
      });
      
      // Step c: Get nutrition data based on identified ingredients
      if (mealAnalysis && mealAnalysis.ingredients.length > 0) {
        try {
          nutritionData = await recordStage('get-nutrition-data', async () => {
            console.log(`🔍 [${requestId}] Getting nutrition data for identified ingredients`);
            
            // Join ingredients for Nutritionix query
            const ingredientsText = mealAnalysis!.ingredients.map(i => i.name).join(', ');
            const nutritionResult = await getNutritionData(ingredientsText, requestId);
            
            if (nutritionResult.success && nutritionResult.data) {
              console.log(`✅ [${requestId}] Nutrition data retrieved successfully`);
              return nutritionResult.data;
            } else {
              console.warn(`⚠️ [${requestId}] Nutrition data fetch failed: ${nutritionResult.error}`);
              throw new Error(nutritionResult.error || 'Failed to retrieve nutrition data');
            }
          });
        } catch (error) {
          console.warn(`⚠️ [${requestId}] Failed to get nutrition data: ${error instanceof Error ? error.message : String(error)}`);
          // Continue without nutrition data
        }
      }
      
      // Step d: Create the final analysis result
      const analysisResult = await recordStage('create-final-analysis', async () => {
        const healthGoalString = healthGoals.length > 0 ? healthGoals[0] : 'general health';
        
        // Ensure mealAnalysis is not null before accessing properties
        if (!mealAnalysis) {
          throw new Error('Meal analysis failed or returned null');
        }
        
        // Combine extracted text, meal analysis, and nutrition data
        let result: AnalysisResult = {
          description: mealAnalysis.description,
          nutrients: nutritionData?.nutrients || mealAnalysis.nutrients || [],
          detailedIngredients: mealAnalysis.ingredients,
          feedback: [],
          suggestions: [],
          goalScore: {
            overall: 5,
            specific: {}
          },
          modelInfo: {
            model: 'ocr-text-analysis',
            usedFallback: false,
            ocrExtracted: true
          }
        };
        
        // Add nutrient analysis based on goals if we have nutrition data
        if (nutritionData) {
          const goalAnalysis = createNutrientAnalysis(
            nutritionData.nutrients,
            healthGoals,
            requestId
          );
          
          result = {
            ...result,
            feedback: goalAnalysis.feedback,
            suggestions: goalAnalysis.suggestions,
            goalScore: goalAnalysis.goalScore,
            goalName: formatGoalName(healthGoalString)
          };
        } else {
          // Use feedback and suggestions from meal analysis if available
          result.feedback = mealAnalysis.feedback || [
            "We analyzed your meal based on text extracted from your image.",
            "For more specific nutrition advice, try taking a clearer photo."
          ];
          result.suggestions = mealAnalysis.suggestions || [
            "Include all food items in the frame",
            "Take photos in good lighting"
          ];
          result.goalScore.overall = 5; // Neutral score
          result.goalName = formatGoalName(healthGoalString);
        }
        
        return result;
      });
      
      // Mark as successful
      response.success = true;
      response.result = analysisResult;
      response.message = 'Analysis completed successfully with text extraction';
      
      // Save to user's data if we have a userId and imageUrl
      if (userId && imageUrl && mealAnalysis) {
        try {
          await recordStage('save-to-firestore', async () => {
            console.log(`🔄 [${requestId}] Saving meal to Firestore for user ${userId}`);
            const saveResult = await trySaveMealServer({
              userId: userId!,
              analysis: analysisResult,
              imageUrl,
              requestId,
              mealName: mealAnalysis.description.split(',')[0] // Use first part of description as meal name
            });
            
            if (saveResult.success) {
              console.log(`✅ [${requestId}] Meal saved successfully with ID: ${saveResult.savedMealId}`);
              response.message = 'Analysis completed and meal saved successfully';
              return saveResult.savedMealId;
            } else {
              console.warn(`⚠️ [${requestId}] Failed to save meal: ${saveResult.error}`);
              throw new Error(saveResult.error?.message || 'Failed to save meal');
            }
          });
        } catch (saveError) {
          console.error(`❌ [${requestId}] Error saving meal:`, saveError);
          // Continue without failing the whole response
        }
      }
    } catch (error: any) {
      console.error(`❌ [${requestId}] Analysis failed:`, error);
      analysisFailed = true;
      failureReason = error.message || 'Unknown error during analysis';
      
      // Check if it was a timeout
      isTimeout = error.name === 'AbortError' || failureReason.includes('timeout');
      
      // Create fallback response
      const fallbackResponse = createEmptyFallbackAnalysis(requestId, "text_extraction", failureReason);
      
      response.success = false;
      response.fallback = true;
      response.result = fallbackResponse;
      response.error = failureReason;
      response.message = 'Analysis failed, using fallback response';
    } finally {
      // Clear the timeout
      clearTimeout(timeoutId);
    }

    // Complete diagnostics
    const diagResults = complete(response.success);
    response.diagnostics = diagResults;

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ [${requestId}] Unexpected error in analyze route:`, errorMessage);
    
    // Complete diagnostics with failure
    const diagResults = complete(false);
    
    response.success = false;
    response.error = errorMessage;
    response.message = 'An unexpected error occurred during analysis';
    response.elapsedTime = Date.now() - startTime;
    response.diagnostics = diagResults;
    
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