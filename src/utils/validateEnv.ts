/**
 * Environment variable validation utilities
 * These functions help ensure environment variables are properly configured
 */

/**
 * Validates that the Firebase service account is properly set and can be decoded
 * 
 * @throws Error if the service account is missing or invalid
 * @returns boolean true if the service account is valid
 */
export function assertFirebasePrivateKey(): boolean {
  const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
  
  // Check if the key exists
  if (!privateKeyBase64) {
    throw new Error(
      'Missing FIREBASE_PRIVATE_KEY_BASE64 environment variable. ' +
      'Please set this value using the Base-64 encoded Firebase service account JSON.'
    );
  }
  
  try {
    // Attempt to decode the Base-64 string
    const decodedServiceAccount = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
    
    // Try to parse as JSON
    try {
      const serviceAccount = JSON.parse(decodedServiceAccount);
      
      // Validate required service account fields
      if (!serviceAccount.type || serviceAccount.type !== 'service_account') {
        throw new Error('Invalid service account: missing or incorrect "type" field');
      }
      
      if (!serviceAccount.project_id) {
        throw new Error('Invalid service account: missing "project_id" field');
      }
      
      if (!serviceAccount.private_key) {
        throw new Error('Invalid service account: missing "private_key" field');
      }
      
      if (!serviceAccount.client_email) {
        throw new Error('Invalid service account: missing "client_email" field');
      }
      
      // Validate the private key format
      const hasPemHeader = serviceAccount.private_key.includes('-----BEGIN PRIVATE KEY-----');
      const hasPemFooter = serviceAccount.private_key.includes('-----END PRIVATE KEY-----');
      
      if (!hasPemHeader || !hasPemFooter) {
        throw new Error(
          'The service account contains an invalid private key. ' +
          'It should be in PEM format.'
        );
      }
      
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(
          'Failed to parse FIREBASE_PRIVATE_KEY_BASE64 as JSON. ' +
          'Please ensure it is a valid Base-64 encoded Firebase service account JSON file.'
        );
      }
      throw error;
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