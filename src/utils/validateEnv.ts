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
      'Please set this value using a Base-64 encoded private key.'
    );
  }
  
  try {
    // Attempt to decode the Base-64 string
    const privateKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
    
    // Validate the private key format
    const hasPemHeader = privateKey.includes('-----BEGIN PRIVATE KEY-----');
    const hasPemFooter = privateKey.includes('-----END PRIVATE KEY-----');
    
    if (!hasPemHeader || !hasPemFooter) {
      throw new Error(
        'Invalid private key format. ' +
        'It should be in PEM format with -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY----- markers.'
      );
    }
    
    return true;
  } catch (error) {
    if (error instanceof Error) {
      // Re-throw validation errors
      if (error.message.includes('Invalid private key format')) {
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