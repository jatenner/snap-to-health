import { ref, uploadBytes, getDownloadURL, FirebaseStorage, uploadBytesResumable } from 'firebase/storage';
import { 
  doc, 
  setDoc, 
  collection, 
  serverTimestamp, 
  getDoc, 
  query, 
  where, 
  orderBy, 
  getDocs, 
  Timestamp,
  Firestore 
} from 'firebase/firestore';
import { storage, db } from './firebase';
import { v4 as uuidv4 } from 'uuid';
// Import the CORS proxy helper functions
import { uploadFileWithCors, getFileUrlWithCors } from '@/utils/storageUtils';

/**
 * Upload a meal image to Firebase Storage
 * @param file The image file to upload
 * @param userId The user's ID
 * @param progressCallback Optional callback for upload progress
 * @returns Promise with the download URL
 */
export const uploadMealImage = async (
  file: File | Blob, 
  userId: string, 
  progressCallback?: (progress: number) => void
): Promise<string> => {
  if (!file || !userId) {
    throw new Error('File and userId are required');
  }

  if (!storage) {
    throw new Error('Firebase Storage is not initialized');
  }

  // Enhanced Storage bucket logging
  console.log('✅ UPLOAD: Firebase Storage initialization check');
  console.log('Firebase Storage bucket from env:', process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
  console.log('Firebase Storage bucket in use:', storage.app.options.storageBucket);
  
  // Check if bucket is correctly set
  const expectedBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'snaphealth-39b14.firebasestorage.app';
  if (storage.app.options.storageBucket !== expectedBucket) {
    console.error('⚠️ STORAGE BUCKET MISMATCH in uploadMealImage');
    console.error(`Expected: ${expectedBucket}`);
    console.error(`Actual: ${storage.app.options.storageBucket}`);
  } else {
    console.log('✅ Storage bucket verified for upload:', storage.app.options.storageBucket);
  }
  
  // Create a unique ID for the image
  const imageId = uuidv4();
  
  console.log(`Uploading image for user ${userId} with ID ${imageId}...`);
  console.log(`File type: ${file.type}, size: ${file.size} bytes`);
  
  // Use the storage path - use users/{userId} to match security rules
  const storagePath = `users/${userId}/mealImages/${imageId}`;
  console.log(`Storage path: ${storagePath}`);
  
  try {
    // Direct upload approach (primary method)
    // Create a reference to the storage location
    const storageRef = ref(storage as FirebaseStorage, storagePath);
    console.log('Storage reference created:', storageRef.toString());
    console.log('Full path:', storageRef.fullPath);
    console.log('Bucket:', storageRef.bucket);
  
    // Set custom metadata to help with CORS
    const metadata = {
      contentType: file.type || 'image/jpeg',
      cacheControl: 'public, max-age=3600',
      customMetadata: {
        'userId': userId,
        'uploadedFrom': typeof window !== 'undefined' ? window.location.origin : 'unknown',
        'timestamp': new Date().toISOString()
      }
    };
    
    console.log(`Starting direct upload with metadata:`, metadata);
    
    // First, try using the simpler uploadBytes method which may avoid CORS issues
    try {
      console.log('Attempting upload with uploadBytes method...');
      if (progressCallback) progressCallback(10);
      
      const snapshot = await uploadBytes(storageRef, file, metadata);
      console.log('Upload successful with uploadBytes method:', snapshot);
      
      if (progressCallback) progressCallback(90);
      
      // Get the download URL
      const downloadURL = await getDownloadURL(snapshot.ref);
      console.log('Download URL generated:', downloadURL);
      
      if (progressCallback) progressCallback(100);
      return downloadURL;
    } catch (initialError) {
      console.log('uploadBytes method failed, falling back to resumable upload:', initialError);
      // Continue with the resumable upload method as fallback
    }

    // Implement retry logic for resumable uploads
    let uploadAttempts = 0;
    const maxAttempts = 3;
    let uploadTask;
    let downloadURL = '';
    
    while (uploadAttempts < maxAttempts && !downloadURL) {
      try {
        uploadAttempts++;
        console.log(`Starting upload attempt ${uploadAttempts}/${maxAttempts}...`);
        
        // Create an upload task that we can monitor for progress
        uploadTask = uploadBytesResumable(storageRef, file, metadata);
        
        if (progressCallback) {
          // Monitor the upload progress
          uploadTask.on('state_changed', 
            (snapshot) => {
              const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
              progressCallback(progress);
              console.log(`Upload progress: ${progress.toFixed(1)}%`);
            },
            (error) => {
              console.error(`Upload progress error (attempt ${uploadAttempts}/${maxAttempts}):`, error);
              // Don't throw here, let the outer try/catch handle retries
            }
          );
        }
        
        // Wait for the upload to complete
        const snapshot = await uploadTask;
        console.log('Upload successful:', snapshot);
        
        // Get the download URL
        downloadURL = await getDownloadURL(snapshot.ref);
        console.log('Download URL generated:', downloadURL);
      } catch (error: any) {
        console.error(`Upload attempt ${uploadAttempts} failed:`, error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        
        if (uploadAttempts >= maxAttempts) {
          console.error('Maximum upload attempts reached');
          throw error; // Re-throw after max attempts
        }
        
        // Check specifically for CORS errors to handle them differently
        const isCorsError = error.message && (
          error.message.includes('CORS') || 
          error.message.includes('access-control-allow-origin') ||
          error.message.includes('cross-origin')
        );
        
        if (isCorsError) {
          console.warn('Detected CORS error, adding retry delay and modifying approach...');
          // For CORS errors, try a longer delay
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          // Wait a bit before retrying (exponential backoff)
          const delay = Math.min(1000 * (2 ** (uploadAttempts - 1)), 8000);
          console.log(`Upload attempt ${uploadAttempts} failed. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    if (!downloadURL) {
      console.error('Direct upload methods failed, trying CORS proxy method...');
      
      // If all direct methods failed, try the CORS proxy method as a last resort
      if (typeof window !== 'undefined') {
        const origin = window.location.origin;
        const isLocalhost = 
          origin.includes('localhost:3000') || 
          origin.includes('localhost:3001') || 
          origin.includes('localhost:3002') || 
          origin.includes('localhost:3003') || 
          origin.includes('localhost:3004') || 
          origin.includes('localhost:3005') || 
          origin.includes('localhost:3006') || 
          origin.includes('localhost:3007') || 
          origin.includes('localhost:3008') || 
          origin.includes('localhost:3009') || 
          origin.includes('localhost:3010');
          
        if (isLocalhost) {
          try {
            // Show upload progress (approximated since the proxy doesn't support progress)
            if (progressCallback) {
              progressCallback(10); // Started upload
              
              // Simulate progress updates
              const progressInterval = setInterval(() => {
                const randomProgress = Math.floor(Math.random() * 20) + 30; // Random progress between 30-50%
                progressCallback(randomProgress);
              }, 500);
              
              // Attempt the upload
              const downloadURL = await uploadFileWithCors(file, storagePath, progressCallback);
              
              // Clear the interval and set to 100%
              clearInterval(progressInterval);
              progressCallback(100);
              
              console.log('Upload successful with CORS proxy:', downloadURL);
              return downloadURL;
            } else {
              // Without progress callback
              const downloadURL = await uploadFileWithCors(file, storagePath);
              console.log('Upload successful with CORS proxy:', downloadURL);
              return downloadURL;
            }
          } catch (proxyError) {
            console.error('CORS proxy upload failed:', proxyError);
            throw new Error(`All upload methods failed. Please try again later.`);
          }
        } else {
          throw new Error(`Failed to upload image after ${maxAttempts} attempts`);
        }
      } else {
        throw new Error(`Failed to upload image after ${maxAttempts} attempts`);
      }
    }
    
    return downloadURL;
  } catch (error: any) {
    // Enhanced error logging
    console.error('Error uploading image:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    
    // CORS specific error handling
    if (error.message && (
        error.message.includes('CORS') || 
        error.message.includes('access-control-allow-origin') ||
        error.message.includes('cross-origin')
    )) {
      console.error('⚠️ CORS ERROR DETECTED ⚠️');
      console.error('This is likely due to missing CORS configuration on Firebase Storage.');
      console.error('Check your Storage CORS configuration in the Firebase Console or deploy CORS rules.');
      
      // Set progress to failed state if callback exists to clear any spinner
      if (progressCallback) {
        progressCallback(-1); // Use -1 to indicate failure
      }
      
      throw new Error('Network error: Unable to upload to cloud storage. CORS configuration issue detected.');
    }
    
    // Set progress to failed state if callback exists to clear any spinner
    if (progressCallback) {
      progressCallback(-1); // Use -1 to indicate failure
    }
    
    throw error;
  }
};

/**
 * Save meal analysis data to Firestore
 * @param userId The user's ID
 * @param imageUrl The URL of the uploaded image
 * @param analysis The meal analysis result
 * @param mealName Optional name for the meal
 * @returns Promise with the document ID
 */
export const saveMealToFirestore = async (
  userId: string, 
  imageUrl: string, 
  analysis: any,
  mealName: string = ''
): Promise<string> => {
  if (!userId || !imageUrl || !analysis) {
    throw new Error('UserId, imageUrl, and analysis are required');
  }
  
  if (!db) {
    throw new Error('Firebase Firestore is not initialized');
  }
  
  console.log(`Saving meal data for user ${userId}...`);
  
  try {
    // Create a reference to the user's meals collection
    const mealsCollection = collection(db as Firestore, `users/${userId}/meals`);
    console.log(`Collection path: users/${userId}/meals`);
    
    // Create a new document with an auto-generated ID
    const mealDocRef = doc(mealsCollection);
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
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      goalType: analysis.goalName || 'General Health',
      goalScore: analysis.goalScore || 5,
      nutrients: analysis.nutrients || [],
      goal: analysis.rawGoal || analysis.goalName || 'General Health'
    };
    
    console.log('Saving meal data:', JSON.stringify(mealData).substring(0, 100) + '...');
    
    // Save the meal data
    await setDoc(mealDocRef, mealData);
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
    
    // Check if client is offline
    if (error.code === 'failed-precondition' && error.message.includes('offline')) {
      console.error('⚠️ CLIENT IS OFFLINE ⚠️');
      console.error('The Firestore client is operating in offline mode or cannot connect to the backend.');
    }
    
    throw new Error(`Failed to save meal data: ${error.message}`);
  }
};

/**
 * Get a meal by ID from Firestore
 * @param userId The user's ID
 * @param mealId The meal document ID
 * @returns Promise with the meal data
 */
export const getMealById = async (userId: string, mealId: string) => {
  if (!userId || !mealId) {
    throw new Error('UserId and mealId are required');
  }
  
  if (!db) {
    throw new Error('Firebase Firestore is not initialized');
  }
  
  try {
    const mealRef = doc(db as Firestore, `users/${userId}/meals`, mealId);
    const mealSnap = await getDoc(mealRef);
    
    if (mealSnap.exists()) {
      const data = mealSnap.data();
      return {
        id: mealSnap.id,
        mealName: data.mealName || 'Unnamed Meal',
        imageUrl: data.imageUrl,
        createdAt: data.createdAt?.toDate() || new Date(),
        analysis: data.analysis || {},
        goalType: data.goalType || 'General Health',
        goalScore: data.goalScore || 5,
        nutrients: data.nutrients || [],
        goal: data.goal || data.analysis?.rawGoal || ''
      };
    } else {
      throw new Error('Meal not found');
    }
  } catch (error) {
    console.error('Error fetching meal:', error);
    throw error;
  }
};

/**
 * Get meals by date range
 * @param userId The user's ID
 * @param startDate Start date for the query
 * @param endDate End date for the query
 * @returns Promise with an array of meals
 */
export const getMealsByDateRange = async (userId: string, startDate?: Date, endDate?: Date) => {
  if (!userId) {
    throw new Error('UserId is required');
  }
  
  if (!db) {
    throw new Error('Firebase Firestore is not initialized');
  }
  
  try {
    const mealsRef = collection(db as Firestore, `users/${userId}/meals`);
    let q;
    
    if (startDate && endDate) {
      const startTimestamp = Timestamp.fromDate(startDate);
      const endTimestamp = Timestamp.fromDate(endDate);
      
      q = query(
        mealsRef,
        where('createdAt', '>=', startTimestamp),
        where('createdAt', '<=', endTimestamp),
        orderBy('createdAt', 'desc')
      );
    } else {
      q = query(mealsRef, orderBy('createdAt', 'desc'));
    }
    
    const querySnapshot = await getDocs(q);
    
    const meals: any[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      meals.push({
        id: doc.id,
        mealName: data.mealName || 'Unnamed Meal',
        imageUrl: data.imageUrl,
        createdAt: data.createdAt?.toDate() || new Date(),
        analysis: data.analysis || {},
        goalType: data.goalType || 'General Health',
        goalScore: data.goalScore || 5,
        goal: data.goal || data.analysis?.rawGoal || ''
      });
    });
    
    return meals;
  } catch (error) {
    console.error('Error fetching meals by date range:', error);
    throw error;
  }
};

// CORS proxy check: Use our own server as a CORS proxy for dev environments
const useCorsProxy = 
  typeof window !== 'undefined' && (
    window.location.origin.includes('localhost:3000') || 
    window.location.origin.includes('localhost:3006') || 
    window.location.origin.includes('localhost:3007') || 
    window.location.origin.includes('localhost:3009')
  );

console.log('Using CORS proxy for meal uploads:', useCorsProxy);

/**
 * Tries to save meal data to Firestore with timeout handling
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
export async function trySaveMeal({ 
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
          // Save the meal data to Firestore
          const savedMealId = await saveMealToFirestore(userId, finalImageUrl, analysis, mealName);
          
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