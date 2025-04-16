import { trySaveMealServer } from '@/lib/serverMealUtils';

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
  saveResult: { success: boolean; mealId?: string; error?: string }
): void {
  if (saveResult.success) {
    responseData.debug.processingSteps.push('Meal saved successfully');
    responseData.mealSaved = true;
    responseData.mealId = saveResult.mealId;
  } else {
    responseData.debug.processingSteps.push(`Meal save failed: ${saveResult.error}`);
    responseData.mealSaved = false;
  }
} 