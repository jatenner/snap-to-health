/**
 * Firebase Storage utility functions
 */

import { adminStorage } from './firebaseAdmin';
import crypto from 'crypto';

/**
 * Uploads a base64 image to Firebase Storage
 * @param base64Image Base64 encoded image data
 * @param userId User ID to associate with the upload
 * @param requestId Request ID for tracking
 * @returns URL of the uploaded image or null on failure
 */
export async function uploadImageToFirebase(
  base64Image: string, 
  userId: string, 
  requestId: string
): Promise<string | null> {
  // Ensure there's a valid image and userId
  if (!base64Image || !userId) {
    console.error(`❌ [${requestId}] Missing image data or userId for Firebase upload`);
    return null;
  }
  
  console.time(`⏱️ [${requestId}] uploadImageToFirebase`);
  console.log(`🔄 [${requestId}] Uploading image to Firebase for user ${userId}`);
  
  try {
    // Generate a unique filename
    const filename = `${userId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.jpg`;
    const imagePath = `uploads/${userId}/${filename}`;
    
    // Remove the data:image/xyz;base64, prefix if present
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
    
    // Safely create buffer - wrap in try/catch to prevent crashes
    let buffer: Buffer;
    try {
      buffer = Buffer.from(base64Data, 'base64');
      
      // Validate the buffer has actual content
      if (!buffer || buffer.length === 0) {
        console.error(`❌ [${requestId}] Created buffer is empty or invalid`);
        return null;
      }
    } catch (bufferError) {
      console.error(`❌ [${requestId}] Failed to create buffer from base64 data:`, bufferError);
      return null;
    }
    
    // Upload to Firebase Storage using Admin SDK
    const bucket = adminStorage.bucket();
    
    // Validate bucket exists
    if (!bucket) {
      console.error(`❌ [${requestId}] Firebase Storage bucket is not available`);
      return null;
    }
    
    const file_ref = bucket.file(imagePath);
    
    // Upload options
    const options = {
      metadata: {
        contentType: 'image/jpeg',
        metadata: {
          createdBy: 'api',
          userId: userId,
          uploadedAt: new Date().toISOString()
        }
      }
    };
    
    await file_ref.save(buffer, options);
    
    // Get signed URL for download
    const [url] = await file_ref.getSignedUrl({
      action: 'read',
      expires: '03-01-2500', // Far future expiration
    });
    
    console.log(`✅ [${requestId}] Image uploaded successfully: ${url.substring(0, 50)}...`);
    console.timeEnd(`⏱️ [${requestId}] uploadImageToFirebase`);
    return url;
  } catch (error) {
    console.error(`❌ [${requestId}] Failed to upload image to Firebase:`, error);
    console.timeEnd(`⏱️ [${requestId}] uploadImageToFirebase`);
    return null;
  }
} 