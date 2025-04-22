import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

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
      // Decode the base64 private key
      const privateKey = Buffer.from(privateKeyBase64!, 'base64').toString('utf8');
      
      // Simple validation for private key format
      const hasPemHeader = privateKey.includes('-----BEGIN PRIVATE KEY-----');
      const hasPemFooter = privateKey.includes('-----END PRIVATE KEY-----');
      
      if (!hasPemHeader || !hasPemFooter) {
        throw new Error('Invalid private key format. It should be in PEM format with proper BEGIN/END markers.');
      }
      
      console.log(`Processing Firebase credentials:
        - Project ID: ${projectId}
        - Client Email: ${clientEmail ? clientEmail.substring(0, 5) + '...' : 'missing'}
        - Private Key: Valid PEM format detected
        - Storage Bucket: ${storageBucket || 'not specified'}`);

      // Initialize Firebase Admin with direct credentials
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey
        }),
        storageBucket
      });
      
      // Initialize services
      adminDb = getFirestore();
      adminAuth = getAuth();
      adminStorage = getStorage();
      
      console.log('✅ Firebase Admin initialized successfully');
    } catch (error: any) {
      console.error('❌ Firebase Admin initialization error:', error?.message || error);
      
      // Provide specific guidance for key issues
      if (error.message?.includes('private key')) {
        console.error('Please check that your FIREBASE_PRIVATE_KEY_BASE64 environment variable:');
        console.error('1. Contains a valid base64-encoded private key');
        console.error('2. Is complete (not truncated)');
        console.error('3. Decodes to a proper PEM format private key with -----BEGIN PRIVATE KEY----- and -----END PRIVATE KEY-----');
      }
    }
  }
}

export { adminDb, adminAuth, adminStorage }; 