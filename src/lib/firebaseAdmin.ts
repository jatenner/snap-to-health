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
      
      // Decode the base64 encoded private key
      const decodedPrivateKey = Buffer.from(privateKeyBase64!, 'base64').toString('utf8');
      
      // Add diagnostic logging for the base64 key (without revealing the full key)
      const keyLength = privateKeyBase64?.length || 0;
      console.log(`Processing Firebase private key (base64 length: ${keyLength} chars)`);
      
      // Simple logging (without revealing sensitive key information)
      console.log(`Initializing Firebase Admin with: 
        - Project ID: ${projectId}
        - Client Email: ${clientEmail ? clientEmail.substring(0, 5) + '...' : 'missing'}
        - Private Key: Successfully decoded (PEM format)
        - Storage Bucket: ${storageBucket || 'not specified'}`);

      // Initialize Firebase Admin with the decoded private key
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: decodedPrivateKey,
        }),
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
      if (error.message?.includes('private key') || error.message?.includes('Firebase')) {
        console.error('Please check that your FIREBASE_PRIVATE_KEY_BASE64 environment variable:');
        console.error('1. Contains a valid base64-encoded Firebase service account private key');
        console.error('2. Is complete (not truncated)');
        console.error('3. Was generated with: node scripts/generate-firebase-key.js');
      }
    }
  }
}

export { adminDb, adminAuth, adminStorage }; 