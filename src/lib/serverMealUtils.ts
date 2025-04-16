import { adminDb, adminStorage } from './firebaseAdmin';
import { Timestamp } from 'firebase-admin/firestore';
import { isValidAnalysis, createFallbackAnalysis } from './utils/analysisValidator';

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
  
  // ABSOLUTE FINAL SAFETY CHECK: This is the last line of defense before touching Firestore
  // Block any invalid analysis data from being saved, no matter what upstream logic did
  if (!analysis?.description || !Array.isArray(analysis.nutrients) || analysis.nutrients.length === 0) {
    // Log detailed information about what's missing
    const missingFields = [];
    if (!analysis?.description) missingFields.push('description');
    if (!Array.isArray(analysis?.nutrients)) missingFields.push('nutrients array');
    else if (analysis.nutrients.length === 0) missingFields.push('non-empty nutrients');
    
    console.error(`🔥 CRITICAL SAFETY BLOCK: Rejected Firestore write in saveMealToFirestoreServer - Missing fields:`, missingFields);
    console.error(`🛡️ FIRESTORE GUARDIAN: Invalid analysis data will NOT be saved to the database`);
    console.error("FINAL SAVE BLOCKER TRIGGERED - Firestore write completely blocked");
    console.error(`🧠 DEBUG - Analysis dump in saveMealToFirestoreServer:`, JSON.stringify(analysis, null, 2).substring(0, 300) + '...');
    
    // Throw detailed error to prevent any further processing
    throw new Error(`🔥 BLOCKED SAVE — missing fields at final step: ${missingFields.join(', ')}`);
  }
  
  console.log("🧠 STEP: Reached Firestore save - All validation checks passed");
  console.log("🧠 GPT Analysis Snapshot:", JSON.stringify(analysis, null, 2).substring(0, 200) + '...');
  
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
  console.log(`🧠 STEP: Entered trySaveMealServer with requestId=${requestId}`);
  
  // ABSOLUTE KILL-SWITCH: First line of defense
  if (!analysis?.description || !Array.isArray(analysis.nutrients) || analysis.nutrients.length === 0) {
    console.error("🚨 BLOCKING SAVE — Missing GPT fields in trySaveMealServer");
    
    // Log the analysis for debugging
    console.error(`🚨 [${requestId}] DEBUG - Analysis dump in trySaveMealServer:`, JSON.stringify(analysis, null, 2).substring(0, 300) + '...');
    
    // Log exactly what's missing
    const missingParts = [];
    if (!analysis?.description) missingParts.push('description');
    if (!Array.isArray(analysis?.nutrients)) missingParts.push('nutrients array');
    else if (analysis.nutrients.length === 0) missingParts.push('non-empty nutrients');
    
    console.error(`🚨 [${requestId}] DEBUG - Missing fields in trySaveMealServer:`, missingParts);
    
    return { 
      success: false, 
      error: new Error(`KILL-SWITCH ENGAGED: Blocked invalid GPT result with missing ${missingParts.join(', ')}`)
    };
  }
  
  // CRITICAL SAFEGUARD: Block any attempt to save with invalid analysis
  if (!isValidAnalysis(analysis)) {
    console.warn(`⚠️ [${requestId}] Not saving meal due to invalid analysis structure`);
    console.error(`⚠️ [${requestId}] Invalid analysis data:`, JSON.stringify(analysis, null, 2).substring(0, 500) + '...');
    return {
      success: false,
      error: new Error('Invalid analysis data: missing required fields')
    };
  }

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