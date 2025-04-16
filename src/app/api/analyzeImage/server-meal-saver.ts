import { trySaveMealServer } from '@/lib/serverMealUtils';
import { isValidAnalysis, createFallbackAnalysis } from '@/lib/utils/analysisValidator';

/**
 * Saves a meal to Firestore using the server-side Admin SDK
 * 
 * @param params Object containing all data needed to save the meal
 * @returns Object with success status and additional information
 */
export async function saveMealToFirestore(params: {
  userId: string;
  imageUrl: string;
  analysis: any;
  requestId: string;
  requestData?: FormData | null;
  jsonData?: any;
}): Promise<{
  success: boolean;
  mealId?: string;
  error?: string;
  message?: string;
}> {
  const { userId, imageUrl, analysis, requestId, requestData, jsonData } = params;
  
  // Skip if missing required data
  if (!userId || !imageUrl || !analysis) {
    console.log(`[${requestId}] Missing data for meal save`);
    
    const missingData = [];
    if (!userId) missingData.push('userId');
    if (!imageUrl) missingData.push('imageUrl');
    if (!analysis) missingData.push('analysis');
    
    return {
      success: false,
      error: `Cannot save meal: missing ${missingData.join(', ')}`
    };
  }
  
  // CRITICAL SAFETY CHECK: Block any invalid analysis at the service layer
  if (
    !analysis?.description ||
    !Array.isArray(analysis.nutrients) ||
    analysis.nutrients.length === 0
  ) {
    console.error(`❌ [${requestId}] BLOCKING SAVE — Missing GPT fields in server-meal-saver`);
    console.log("🧠 STEP: Invalid analysis caught in server-meal-saver critical check");
    
    // Log detailed information about what's missing
    const missingParts = [];
    if (!analysis?.description) missingParts.push('description');
    if (!Array.isArray(analysis?.nutrients)) missingParts.push('nutrients array');
    else if (analysis.nutrients.length === 0) missingParts.push('non-empty nutrients');
    
    console.error(`❌ [${requestId}] DEBUG - Missing fields in server-meal-saver:`, missingParts);
    console.error(`❌ [${requestId}] DEBUG - Analysis dump:`, JSON.stringify(analysis, null, 2).substring(0, 300) + '...');
    
    return { 
      success: false, 
      message: "Invalid analysis – save blocked",
      error: `Missing required fields: ${missingParts.join(', ')}`
    };
  }
  
  console.log(`🧠 [${requestId}] STEP: First critical check passed in server-meal-saver`);
  
  // SAFETY GUARD 1: Validate analysis is a proper object
  if (!analysis || typeof analysis !== 'object') {
    console.error(`[${requestId}] ❌ Critical: Analysis is not a valid object`);
    return {
      success: false,
      error: "Invalid analysis format: not an object",
      message: "Invalid analysis format: not an object"
    };
  }
  
  // SAFETY GUARD 2: Check for explicit fallback flag from upstream code
  if (analysis.fallback === true) {
    console.error(`[${requestId}] ❌ Critical: Attempted to save fallback analysis data`);
    return {
      success: false,
      error: "Cannot save fallback analysis results",
      message: "Cannot save fallback analysis results"
    };
  }
  
  // SAFETY GUARD 3: Use isValidAnalysis utility
  if (!isValidAnalysis(analysis)) {
    console.warn(`[${requestId}] ❌ Invalid analysis data received for save:`, JSON.stringify(analysis).substring(0, 200) + '...');
    return {
      success: false,
      error: "Invalid analysis format: missing description or nutrients",
      message: "Invalid analysis format: missing description or nutrients"
    };
  }
  
  // SAFETY GUARD 4: Redundant manual check for critical fields
  if (!analysis.description || !Array.isArray(analysis.nutrients) || analysis.nutrients.length === 0) {
    console.error(`[${requestId}] 🚨 CRITICAL: Invalid analysis bypassed top-level guard:`, JSON.stringify(analysis).substring(0, 200) + '...');
    return {
      success: false,
      error: "Invalid analysis format: critical data missing",
      message: "Invalid analysis format: critical data missing"
    };
  }
  
  try {
    console.log(`[${requestId}] Attempting to save meal to Firestore for user ${userId}`);
    
    // Extract meal name from request or use analysis description as fallback
    let mealName = 'Unnamed Meal';
    
    // Try to get meal name from FormData if available
    if (requestData && typeof requestData.get === 'function') {
      const mealNameFromForm = requestData.get('mealName');
      if (mealNameFromForm) mealName = mealNameFromForm.toString();
    } 
    // Try to get meal name from JSON data if available
    else if (jsonData && jsonData.mealName) {
      mealName = jsonData.mealName;
    } 
    // Use the food description from analysis as a fallback
    else if (analysis && analysis.description) {
      mealName = analysis.description;
    }
    
    // Call the trySaveMealServer function
    const saveResult = await trySaveMealServer({
      userId,
      imageUrl,
      analysis,
      mealName,
      requestId,
      timeout: 5000 // 5 second timeout
    });
    
    if (saveResult.success) {
      console.log(`[${requestId}] Meal saved successfully: ${saveResult.savedMealId}`);
      return {
        success: true,
        mealId: saveResult.savedMealId
      };
    } else {
      const errorMessage = saveResult.error ? 
        (typeof saveResult.error === 'string' ? saveResult.error : saveResult.error.message) : 
        'Unknown error saving meal';
        
      console.error(`[${requestId}] Meal save failed: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage
      };
    }
  } catch (error: any) {
    const errorMessage = error?.message || 'Unknown error';
    console.error(`[${requestId}] Error saving meal: ${errorMessage}`);
    return {
      success: false,
      error: `Failed to save meal: ${errorMessage}`
    };
  }
}

/**
 * Utility function to update a response object with meal saving results
 */
export function updateResponseWithSaveResult(
  responseData: any, 
  saveResult: { success: boolean; mealId?: string; error?: string; message?: string }
): void {
  if (saveResult.success) {
    responseData.debug.processingSteps.push('Meal saved successfully');
    responseData.mealSaved = true;
    responseData.mealId = saveResult.mealId;
  } else {
    // Use the specific error message if available
    const errorMessage = saveResult.message || saveResult.error || 'unknown error';
    responseData.debug.processingSteps.push(`Meal save failed: ${errorMessage}`);
    responseData.mealSaved = false;
    // Optionally store the specific error in the response if needed
    responseData.saveError = errorMessage;
  }
} 