import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { assertFirebasePrivateKey } from '../utils/validateEnv';

// Initialize Firebase Admin only if the required environment variables are available
const apps = getApps();
let adminDb: any;
let adminAuth: any;
let adminStorage: any;

if (!apps.length) {
  // Check if we have the necessary credentials
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  
  // Check for missing required environment variables
  const missingVars = [];
  if (!projectId) missingVars.push('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  if (!clientEmail) missingVars.push('FIREBASE_CLIENT_EMAIL');
  if (!privateKeyBase64) missingVars.push('FIREBASE_PRIVATE_KEY_BASE64');
  
  if (missingVars.length > 0) {
    const errorMessage = `Firebase Admin SDK initialization failed: Missing required environment variables: ${missingVars.join(', ')}`;
    console.error(errorMessage);
    // Continue execution but Firebase Admin services won't be available
  } else {
    try {
      // Validate the Firebase private key using our new validation function
      try {
        assertFirebasePrivateKey();
        console.log('✅ Firebase private key validation passed');
      } catch (error: any) {
        console.error('❌ Firebase private key validation failed:', error.message);
        throw error; // Re-throw to prevent initialization
      }
      
      // Decode the base64 encoded service account JSON
      const decodedServiceAccount = Buffer.from(privateKeyBase64!, 'base64').toString('utf8');
      
      // Parse the JSON string into an object
      const serviceAccount = JSON.parse(decodedServiceAccount);
      
      // Add diagnostic logging for the base64 key (without revealing the full key)
      const keyLength = privateKeyBase64?.length || 0;
      console.log(`Processing Firebase service account (base64 length: ${keyLength} chars)`);
      
      // Simple logging (without revealing sensitive key information)
      console.log(`Initializing Firebase Admin with: 
        - Project ID: ${serviceAccount.project_id || projectId}
        - Client Email: ${serviceAccount.client_email ? serviceAccount.client_email.substring(0, 5) + '...' : 'missing'}
        - Service Account Type: ${serviceAccount.type || 'unknown'}
        - Storage Bucket: ${storageBucket || 'not specified'}`);

      // Initialize Firebase Admin with the service account
      initializeApp({
        credential: cert(serviceAccount),
        storageBucket,
      });
      
      // Initialize services
      adminDb = getFirestore();
      adminAuth = getAuth();
      adminStorage = getStorage();
      
      console.log('✅ Firebase Admin initialized successfully');
    } catch (error: any) {
      console.error('❌ Firebase Admin initialization error:', error?.message || error);
      
      // Provide specific guidance for base64 key issues
      if (error.message?.includes('private key') || error.message?.includes('Firebase') || error.message?.includes('JSON')) {
        console.error('Please check that your FIREBASE_PRIVATE_KEY_BASE64 environment variable:');
        console.error('1. Contains a valid base64-encoded Firebase service account JSON');
        console.error('2. Is complete (not truncated)');
        console.error('3. Was generated with: cat firebase-service-account.json | base64');
      }
    }
  }
}

export { adminDb, adminAuth, adminStorage }; 