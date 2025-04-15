// src/utils/storageUtils.ts
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { app } from "@/lib/firebase";

// Initialize Firebase Storage
const storage = getStorage(app);

/**
 * Upload a file to Firebase Storage with CORS proxy support for local development
 * @param file The file to upload
 * @param path The path to upload the file to
 * @param progressCallback Optional callback for upload progress
 * @returns The download URL for the uploaded file
 */
export async function uploadFileWithCors(file: File | Blob, path: string, progressCallback?: (progress: number) => void) {
  try {
    console.log('uploadFileWithCors: Starting upload process via CORS proxy helper');
    console.log(`File type: ${file.type}, size: ${file.size} bytes, path: ${path}`);
    
    // Let the caller know we're starting
    if (progressCallback) {
      progressCallback(10);
    }
    
    // Log storage bucket information
    console.log('Storage bucket from env:', process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
    console.log('Storage bucket in use:', storage.app.options.storageBucket);
    
    // Check if bucket is correctly set
    const expectedBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'snaphealth-39b14.firebasestorage.app';
    if (storage.app.options.storageBucket !== expectedBucket) {
      console.error('⚠️ STORAGE BUCKET MISMATCH in uploadFileWithCors');
      console.error(`Expected: ${expectedBucket}`);
      console.error(`Actual: ${storage.app.options.storageBucket}`);
    } else {
      console.log('✅ Storage bucket verified for CORS upload:', storage.app.options.storageBucket);
    }
    
    // Create a storage reference
    const storageRef = ref(storage, path);
    console.log('Storage reference created for CORS upload:', storageRef.toString());
    console.log('Full path:', storageRef.fullPath);
    console.log('Bucket:', storageRef.bucket);
    
    // Set proper metadata
    const metadata = {
      contentType: file.type || 'image/jpeg',
      cacheControl: 'public, max-age=3600'
    };
    console.log('Metadata:', metadata);
    
    // Let the caller know we're uploading
    if (progressCallback) {
      progressCallback(30);
    }
    
    // Upload the file
    console.log('Uploading file to Firebase Storage...');
    const snapshot = await uploadBytes(storageRef, file, metadata);
    console.log('Upload successful, getting download URL...');
    
    // Let the caller know we're finishing up
    if (progressCallback) {
      progressCallback(80);
    }
    
    // Get the download URL
    let downloadUrl = await getDownloadURL(snapshot.ref);
    console.log('Download URL obtained:', downloadUrl);
    
    // Use CORS proxy for local development
    const useCorsProxy =
      typeof window !== 'undefined' &&
      (window.location.origin.includes('localhost:3000') ||
        window.location.origin.includes('localhost:3006') ||
        window.location.origin.includes('localhost:3007') ||
        window.location.origin.includes('localhost:3009'));

    console.log('Using CORS proxy for file upload:', useCorsProxy);
    
    // In development on localhost ports, use the proxy
    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
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
        // Replace the Firebase Storage URL with our proxy URL
        const originalUrl = downloadUrl;
        downloadUrl = `/api/proxy/storage?url=${encodeURIComponent(downloadUrl)}`;
        console.log(`Proxied URL: Original: ${originalUrl} -> Proxied: ${downloadUrl}`);
      }
    }
    
    // Let the caller know we're done
    if (progressCallback) {
      progressCallback(100);
    }
    
    console.log('CORS proxy upload completed successfully');
    return downloadUrl;
  } catch (error: any) {
    console.error('Error in uploadFileWithCors:', error);
    if (error.code) console.error('Error code:', error.code);
    
    // Try to detect common error patterns
    if (error.message && error.message.includes('CORS')) {
      console.error('CORS error detected in upload helper');
    } else if (error.code === 'storage/unauthorized') {
      console.error('Storage permission error - check Firebase storage rules');
    } else if (error.code === 'storage/canceled') {
      console.error('Upload was canceled');
    } else if (error.code === 'storage/unknown') {
      console.error('Unknown storage error - check browser console for more details');
    }
    
    // Inform caller of failure
    if (progressCallback) {
      progressCallback(-1); // Use -1 to indicate failure as in uploadMealImage
    }
    
    throw error;
  }
}

/**
 * Get a download URL for a file in Firebase Storage with CORS proxy support
 * @param path The path to the file in Firebase Storage
 * @returns The download URL for the file
 */
export async function getFileUrlWithCors(path: string) {
  try {
    console.log('getFileUrlWithCors: Retrieving file URL with CORS proxy support');
    console.log(`Path: ${path}`);
    
    // Log storage bucket information
    console.log('Storage bucket from env:', process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
    console.log('Storage bucket in use:', storage.app.options.storageBucket);
    
    // Check if bucket is correctly set
    const expectedBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'snaphealth-39b14.firebasestorage.app';
    if (storage.app.options.storageBucket !== expectedBucket) {
      console.error('⚠️ STORAGE BUCKET MISMATCH in getFileUrlWithCors');
      console.error(`Expected: ${expectedBucket}`);
      console.error(`Actual: ${storage.app.options.storageBucket}`);
    } else {
      console.log('✅ Storage bucket verified for URL retrieval:', storage.app.options.storageBucket);
    }
    
    // Create a storage reference
    const storageRef = ref(storage, path);
    console.log('Storage reference created for URL retrieval:', storageRef.toString());
    console.log('Full path:', storageRef.fullPath);
    console.log('Bucket:', storageRef.bucket);
    
    // Get the download URL
    let downloadUrl = await getDownloadURL(storageRef);
    console.log('Original download URL:', downloadUrl);
    
    // Use CORS proxy for local development
    const useCorsProxy =
      typeof window !== 'undefined' &&
      (window.location.origin.includes('localhost:3000') ||
        window.location.origin.includes('localhost:3006') ||
        window.location.origin.includes('localhost:3007') ||
        window.location.origin.includes('localhost:3009'));

    console.log('Using CORS proxy for URL retrieval:', useCorsProxy);
    
    // In development on localhost ports, use the proxy
    if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
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
        // Replace the Firebase Storage URL with our proxy URL
        const originalUrl = downloadUrl;
        downloadUrl = `/api/proxy/storage?url=${encodeURIComponent(downloadUrl)}`;
        console.log(`Proxied URL: Original: ${originalUrl} -> Proxied: ${downloadUrl}`);
      }
    }
    
    return downloadUrl;
  } catch (error: any) {
    console.error('Error in getFileUrlWithCors:', error);
    if (error.code) console.error('Error code:', error.code);
    
    if (error.code === 'storage/object-not-found') {
      console.error('File not found in storage');
    } else if (error.code === 'storage/unauthorized') {
      console.error('Not authorized to access file');
    }
    
    throw error;
  }
}
