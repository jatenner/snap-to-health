/**
 * Server-side Firebase Storage utilities
 * This module provides a safe way to interact with Firebase Storage on the server
 * by avoiding problematic imports that cause webpack bundling issues.
 */

import { getApps, cert, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

// Cache for the initialized app
let storage: any = null;

/**
 * Get a reference to Firebase Storage
 * Safely initializes Firebase Admin if needed
 */
export async function getServerStorage() {
  // If already initialized, return the cached instance
  if (storage) {
    return storage;
  }

  // Initialize Firebase Admin if not already initialized
  const apps = getApps();
  if (!apps.length) {
    try {
      // Get Firebase Admin credentials from environment variables
      const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
      const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
      const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
      
      // Check for missing environment variables
      const missingVars = [];
      if (!projectId) missingVars.push('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
      if (!clientEmail) missingVars.push('FIREBASE_CLIENT_EMAIL');
      if (!privateKeyBase64) missingVars.push('FIREBASE_PRIVATE_KEY_BASE64');
      
      if (missingVars.length > 0) {
        throw new Error(`Firebase Admin initialization failed: Missing environment variables: ${missingVars.join(', ')}`);
      }
      
      // Decode the base64 encoded service account JSON
      const decodedServiceAccount = Buffer.from(privateKeyBase64!, 'base64').toString('utf8');
      
      // Parse the JSON string into an object
      const serviceAccount = JSON.parse(decodedServiceAccount);
      
      // Initialize Firebase Admin with the service account
      initializeApp({
        credential: cert(serviceAccount),
        storageBucket,
      });
      
      console.log('✅ Firebase Admin initialized for server storage operations');
    } catch (error: any) {
      console.error('❌ Server storage initialization error:', error?.message || error);
      throw error;
    }
  }
  
  // Get the Storage instance
  try {
    storage = getStorage();
    return storage;
  } catch (error: any) {
    console.error('❌ Failed to get Firebase Storage:', error?.message || error);
    throw error;
  }
}

/**
 * Upload a file to Firebase Storage
 */
export async function uploadFileToStorage(
  filePath: string, 
  fileData: Buffer | string | Blob,
  metadata: any = {}
) {
  const storage = await getServerStorage();
  const bucket = storage.bucket();
  const file = bucket.file(filePath);
  
  try {
    await file.save(fileData, {
      metadata,
      contentType: metadata.contentType || 'application/octet-stream',
    });
    
    // Make the file publicly accessible
    await file.makePublic();
    
    // Get the public URL
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    return { success: true, url: publicUrl, path: filePath };
  } catch (error: any) {
    console.error('❌ Error uploading file to storage:', error?.message || error);
    throw error;
  }
}

/**
 * Get a download URL for a file in Firebase Storage
 */
export async function getFileDownloadUrl(filePath: string) {
  const storage = await getServerStorage();
  const bucket = storage.bucket();
  const file = bucket.file(filePath);
  
  try {
    // Check if the file exists
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error(`File ${filePath} does not exist`);
    }
    
    // Make the file publicly accessible
    await file.makePublic();
    
    // Get the public URL
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    return { success: true, url: publicUrl };
  } catch (error: any) {
    console.error('❌ Error getting file download URL:', error?.message || error);
    throw error;
  }
} 