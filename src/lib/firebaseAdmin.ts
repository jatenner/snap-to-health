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
      // Decode the base64 encoded private key
      let decodedPrivateKey: string;
      try {
        // Add diagnostic logging for the base64 key (without revealing the full key)
        const keyLength = privateKeyBase64?.length || 0;
        console.log(`Processing Firebase private key (base64 length: ${keyLength} chars)`);
        
        if (keyLength < 100) {
          console.warn('⚠️ WARNING: The base64 private key seems unusually short');
        }
        
        decodedPrivateKey = Buffer.from(privateKeyBase64!, 'base64').toString('utf8');
        
        // Enhanced validation of the decoded key format
        const hasPemHeader = decodedPrivateKey.includes('-----BEGIN PRIVATE KEY-----');
        const hasPemFooter = decodedPrivateKey.includes('-----END PRIVATE KEY-----');
        const hasNewlines = decodedPrivateKey.includes('\n');
        const newlineCount = (decodedPrivateKey.match(/\n/g) || []).length;
        
        console.log(`Decoded private key validation:
          - Contains PEM header: ${hasPemHeader ? '✅' : '❌'}
          - Contains PEM footer: ${hasPemFooter ? '✅' : '❌'}
          - Contains newlines: ${hasNewlines ? `✅ (${newlineCount} found)` : '❌'}
          - Decoded length: ${decodedPrivateKey.length} characters
        `);
        
        if (!hasPemHeader || !hasPemFooter || !hasNewlines) {
          throw new Error('Decoded private key is not in valid PEM format');
        }
        
        console.log('✅ Successfully decoded base64 private key');
      } catch (error: any) {
        const errorMessage = `Failed to decode Firebase private key from base64: ${error?.message || 'Unknown error'}`;
        console.error(errorMessage);
        throw new Error(errorMessage);
      }
      
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
        console.error('3. Was generated with: node src/scripts/convertServiceAccountToEnv.js');
      }
    }
  }
}

export { adminDb, adminAuth, adminStorage }; 