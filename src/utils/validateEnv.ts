/**
 * Environment variable validation utilities
 * These functions help ensure environment variables are properly configured
 */

/**
 * Validates that the Firebase private key is properly set and can be decoded
 * 
 * @throws Error if the private key is missing or invalid
 * @returns boolean true if the private key is valid
 */
export function assertFirebasePrivateKey(): boolean {
  const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
  
  // Check if the key exists
  if (!privateKeyBase64) {
    throw new Error(
      'Missing FIREBASE_PRIVATE_KEY_BASE64 environment variable. ' +
      'Please set this value using the Base-64 encoded private key from your Firebase service account.'
    );
  }
  
  try {
    // Attempt to decode the Base-64 string
    const decodedKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
    
    // Validate the decoded key format
    const hasPemHeader = decodedKey.includes('-----BEGIN PRIVATE KEY-----');
    const hasPemFooter = decodedKey.includes('-----END PRIVATE KEY-----');
    
    if (!hasPemHeader || !hasPemFooter) {
      throw new Error(
        'The decoded FIREBASE_PRIVATE_KEY_BASE64 is not in valid PEM format. ' +
        'It should be a Base-64 encoded string of a PEM private key.'
      );
    }
    
    // Check the key length as a basic sanity check
    // A typical Firebase private key should be over 1000 characters
    if (decodedKey.length < 1000) {
      throw new Error(
        'The decoded FIREBASE_PRIVATE_KEY_BASE64 appears to be too short. ' +
        'Please verify that the full private key was encoded correctly.'
      );
    }
    
    return true;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('FIREBASE_PRIVATE_KEY_BASE64')) {
        // Re-throw validation errors
        throw error;
      }
      
      // Handle decoding errors
      throw new Error(
        `Failed to decode FIREBASE_PRIVATE_KEY_BASE64: ${error.message}. ` +
        'Please ensure it is a valid Base-64 encoded string.'
      );
    }
    
    // Fallback for non-Error exceptions
    throw new Error('Unknown error validating FIREBASE_PRIVATE_KEY_BASE64');
  }
}

/**
 * Validates that all required environment variables are set and valid
 * 
 * @throws Error if any required environment variable is missing or invalid
 * @returns boolean true if all environment variables are valid
 */
export function validateRequiredEnvVars(): boolean {
  // Validate Firebase Admin config
  assertFirebasePrivateKey();
  
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  
  if (!projectId) {
    throw new Error('Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID environment variable');
  }
  
  if (!clientEmail) {
    throw new Error('Missing FIREBASE_CLIENT_EMAIL environment variable');
  }
  
  return true;
} 