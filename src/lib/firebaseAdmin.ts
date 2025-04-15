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
  try {
    // Check if we have the necessary credentials
    if (
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
    ) {
      // Function to properly process the private key
      const getPrivateKey = () => {
        const privateKey = process.env.FIREBASE_PRIVATE_KEY;
        // Handle different formats of the private key
        if (privateKey?.includes('\\n')) {
          return privateKey.replace(/\\n/g, '\n');
        }
        return privateKey;
      };

      initializeApp({
        credential: cert({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: getPrivateKey(),
        }),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      });
      
      adminDb = getFirestore();
      adminAuth = getAuth();
      adminStorage = getStorage();
      
      console.log('Firebase Admin initialized successfully');
    } else {
      const missingVars = [];
      if (!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) missingVars.push('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
      if (!process.env.FIREBASE_CLIENT_EMAIL) missingVars.push('FIREBASE_CLIENT_EMAIL');
      if (!process.env.FIREBASE_PRIVATE_KEY) missingVars.push('FIREBASE_PRIVATE_KEY');
      
      console.warn(`Firebase Admin SDK not initialized: Missing environment variables: ${missingVars.join(', ')}`);
    }
  } catch (error) {
    console.error('Firebase Admin initialization error:', error);
  }
}

export { adminDb, adminAuth, adminStorage }; 