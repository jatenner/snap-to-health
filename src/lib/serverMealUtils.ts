import { adminDb, adminStorage } from './firebaseAdmin';
import { Timestamp } from 'firebase-admin/firestore';

/**
 * Save meal analysis data to Firestore using Firebase Admin SDK
 * @param userId The user's ID
 * @param imageUrl The URL of the uploaded image
 * @param analysis The meal analysis result
 * @param mealName Optional name for the meal
 * @returns Promise with the document ID
 */
export const saveMealToFirestoreServer = async (
  userId: string, 
  imageUrl: string, 
  analysis: any,
  mealName: string = ''
): Promise<string> => {
  if (!userId || !imageUrl || !analysis) {
    throw new Error('UserId, imageUrl, and analysis are required');
  }
  
  if (!adminDb) {
    throw new Error('Firebase Admin Firestore is not initialized');
  }
  
  console.log(`Saving meal data for user ${userId}...`);
  
  try {
    // Create a reference to the user's meals collection
    const mealsCollection = adminDb.collection(`users/${userId}/meals`);
    console.log(`Collection path: users/${userId}/meals`);
    
    // Generate a new document ID
    const mealDocRef = mealsCollection.doc();
    console.log(`Document ID: ${mealDocRef.id}`);
    
    // Generate automatic meal name if none provided
    const autoMealName = mealName || 
      (analysis.description && analysis.description.length > 0 
        ? `${analysis.description.split('.')[0]}`
        : `Meal on ${new Date().toLocaleDateString()}`);
    
    // Prepare the meal data
    const mealData = {
      mealName: autoMealName,
      imageUrl,
      analysis,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      goalType: analysis.goalName || 'General Health',
      goalScore: analysis.goalScore || 5,
      nutrients: analysis.nutrients || [],
      goal: analysis.rawGoal || analysis.goalName || 'General Health'
    };
    
    console.log('Saving meal data:', JSON.stringify(mealData).substring(0, 100) + '...');
    
    // Save the meal data
    await mealDocRef.set(mealData);
    console.log('Meal data saved successfully!');
    
    return mealDocRef.id;
  } catch (error: any) {
    // Enhanced error logging
    console.error('Error saving meal to Firestore:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    
    // Permission error handling
    if (error.code === 'permission-denied') {
      console.error('⚠️ PERMISSION DENIED ⚠️');
      console.error('This is likely due to incorrect Firestore security rules.');
      console.error(`Ensure your firestore.rules allows authenticated users to write to users/${userId}/meals`);
    }
    
    throw new Error(`Failed to save meal data: ${error.message}`);
  }
};

/**
 * Tries to save meal data to Firestore with timeout handling (server version)
 * 
 * @param {Object} options - Save options
 * @param {string} options.userId - User ID
 * @param {any} options.analysis - Analysis result
 * @param {string} options.imageUrl - URL of the meal image
 * @param {string} [options.mealName] - Optional name for the meal
 * @param {string} [options.requestId] - Optional request ID for logging
 * @param {number} [options.timeout=5000] - Timeout in milliseconds for the save operation
 * @returns {Promise<{ success: boolean, savedMealId?: string, error?: Error, timeoutTriggered?: boolean }>}
 */
export async function trySaveMealServer({ 
  userId, 
  analysis, 
  imageUrl, 
  mealName = '',
  requestId = '',
  timeout = 5000 
}: { 
  userId: string; 
  analysis: any; 
  imageUrl: string; 
  mealName?: string;
  requestId?: string;
  timeout?: number;
}): Promise<{ 
  success: boolean; 
  savedMealId?: string; 
  error?: Error; 
  timeoutTriggered?: boolean;
}> {
  // Validate input parameters
  if (!userId) {
    console.warn(`⚠️ [${requestId}] Save to account requested but no userId provided`);
    return { 
      success: false, 
      error: new Error('Authentication required to save meals')
    };
  }

  // Only save if we have valid analysis and not a complete failure
  if (!analysis.success || analysis.fallback) {
    console.warn(`⚠️ [${requestId}] Not saving meal due to analysis issues: success=${analysis.success}, fallback=${analysis.fallback}`);
    return { 
      success: false, 
      error: new Error('Cannot save insufficient analysis results')
    };
  }

  // Create a promise that resolves with either the save operation or a timeout
  try {
    // Check if we have a valid imageUrl
    let finalImageUrl = imageUrl;
    
    // If no imageUrl was provided, use a placeholder with timestamp
    if (!finalImageUrl) {
      console.log(`⚠️ [${requestId}] No image URL provided for save operation`);
      finalImageUrl = `https://storage.googleapis.com/snaphealth-39b14.appspot.com/placeholder-meal.jpg`;
    }
    
    // Validate minimum required data before saving
    if (!finalImageUrl) {
      throw new Error('Cannot save meal without an image URL');
    }

    if (!analysis || typeof analysis !== 'object') {
      throw new Error('Cannot save meal with invalid analysis data');
    }
    
    // Create a promise race between the save operation and a timeout
    const savePromise = Promise.race([
      // Save operation
      (async () => {
        try {
          // Save the meal data to Firestore using the server version
          const savedMealId = await saveMealToFirestoreServer(userId, finalImageUrl, analysis, mealName);
          
          console.log(`✅ [${requestId}] Meal saved successfully with ID: ${savedMealId}`);
          return { 
            success: true, 
            savedMealId,
            finalImageUrl
          };
        } catch (saveError: any) {
          console.error(`❌ [${requestId}] Error saving meal to Firestore:`, saveError);
          return { 
            success: false, 
            error: saveError instanceof Error ? saveError : new Error(saveError?.message || 'Unknown save error')
          };
        }
      })(),
      
      // Timeout promise
      new Promise<{ success: false; error: Error; timeoutTriggered: true }>((resolve) => 
        setTimeout(() => {
          resolve({ 
            success: false, 
            error: new Error(`Firestore save operation timed out after ${timeout}ms`),
            timeoutTriggered: true
          });
        }, timeout)
      )
    ]);
    
    // Wait for either the save to complete or timeout
    return await savePromise;
  } catch (error: any) {
    console.error(`❌ [${requestId}] Error in save processing:`, error);
    return { 
      success: false, 
      error: error instanceof Error ? error : new Error(error?.message || 'Unknown error in save processing')
    };
  }
} 