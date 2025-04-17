// src/utils/storageUtils.ts
import { getStorage, ref, uploadBytes, getDownloadURL, UploadMetadata, FirebaseStorage } from "firebase/storage";
import { app } from "@/lib/firebase"; // app can be null
import axios from 'axios';

// Initialize Firebase Storage lazily inside functions after checking app
let storage: FirebaseStorage | null = null;

function getInitializedStorage(): FirebaseStorage {
  if (!app) {
    console.error("Firebase app is not initialized. Cannot get Storage instance.");
    throw new Error('[Firebase] App is null. Storage operations cannot proceed.');
  }
  if (!storage) {
    storage = getStorage(app);
  }
  return storage;
}

/**
 * Upload a file to Firebase Storage with CORS proxy support for local development
 * @param file The file to upload
 * @param path The path to upload the file to
 * @param progressCallback Optional callback for upload progress
 * @returns The download URL for the uploaded file
 */
export async function uploadFileWithCors(file: File | Blob, path: string, progressCallback?: (progress: number) => void) {
  if (!file || !path) {
    throw new Error('File and path are required');
  }
  
  const currentStorage = getInitializedStorage(); // Get or initialize storage safely
  
  // Create a storage reference
  const storageRef = ref(currentStorage, path);
  
  // Set default metadata if not provided
  const finalMetadata = {
    contentType: file.type || 'application/octet-stream',
    cacheControl: 'public, max-age=3600'
  };
  
  try {
    // Upload the file to Firebase Storage
    const snapshot = await uploadBytes(storageRef, file, finalMetadata);
    
    // Get the download URL
    const downloadUrl = await getDownloadURL(snapshot.ref);
    return downloadUrl;
  } catch (error: any) {
    // Check for CORS error
    if (error.code === 'storage/unauthorized' || 
        (error.message && error.message.includes('CORS'))) {
      console.error('CORS error detected while uploading to Firebase Storage:', error);
      
      // Use CORS proxy for local development
      try {
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
            console.warn('Using CORS proxy for Firebase Storage upload');
            const formData = new FormData();
            formData.append('file', file);
            formData.append('path', path);
            
            if (finalMetadata) {
              formData.append('metadata', JSON.stringify(finalMetadata));
            }
            
            const proxyResponse = await axios.post('/api/proxy/storage', formData, {
              headers: {
                'Content-Type': 'multipart/form-data',
              },
            });
            
            if (proxyResponse.data && proxyResponse.data.downloadUrl) {
              return proxyResponse.data.downloadUrl;
            } else {
              throw new Error('Proxy upload failed: No download URL returned');
            }
          }
        }
      } catch (proxyError) {
        console.error('CORS proxy upload failed:', proxyError);
      }
    }
    
    // Re-throw the original error if proxy failed or not applicable
    throw error;
  }
}

/**
 * Get a download URL for a file in Firebase Storage with CORS proxy support
 * @param path The path to the file in Firebase Storage
 * @returns The download URL for the file
 */
export async function getFileUrlWithCors(path: string) {
  if (!path) {
    throw new Error('Path is required');
  }
  
  const currentStorage = getInitializedStorage(); // Get or initialize storage safely
  
  // Create a storage reference
  const storageRef = ref(currentStorage, path);
  
  try {
    // Get the download URL
    return await getDownloadURL(storageRef);
  } catch (error: any) {
    // Check for CORS error
    if (error.code === 'storage/unauthorized' || 
        (error.message && error.message.includes('CORS'))) {
      console.error('CORS error detected while getting file URL:', error);
      
      // Use CORS proxy for local development
      try {
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
            console.warn('Using CORS proxy for Firebase Storage URL');
            const proxyResponse = await axios.get(`/api/proxy/storage?path=${encodeURIComponent(path)}`);
            
            if (proxyResponse.data && proxyResponse.data.downloadUrl) {
              return proxyResponse.data.downloadUrl;
            } else {
              throw new Error('Proxy URL retrieval failed: No download URL returned');
            }
          }
        }
      } catch (proxyError) {
        console.error('CORS proxy URL retrieval failed:', proxyError);
      }
    }
    
    // Re-throw the original error if proxy failed or not applicable
    throw error;
  }
}
