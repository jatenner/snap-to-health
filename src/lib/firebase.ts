'use client';

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, onAuthStateChanged, Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, Firestore } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, FirebaseStorage } from 'firebase/storage';
import { getAnalytics, Analytics } from 'firebase/analytics';
import { ref } from 'firebase/storage';

// Only initialize Firebase in the browser
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let analytics: Analytics | null = null;

// Make sure we're in the browser before initializing Firebase
if (typeof window !== 'undefined') {
  // --- BEGIN DIAGNOSTIC LOG ---
  const apiKeyFromEnv = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  console.log(
    `[Firebase Init Check] NEXT_PUBLIC_FIREBASE_API_KEY: ${apiKeyFromEnv
        ? `${apiKeyFromEnv.substring(0, 6)}... (masked)`
        : '🔴 UNDEFINED'}`
  );

  if (!apiKeyFromEnv) {
    console.warn(
      '🔴 WARNING: NEXT_PUBLIC_FIREBASE_API_KEY is missing or undefined in the browser environment!'
    );
    console.warn(
      '   This will cause "auth/api-key-not-valid" errors.'
    );
    console.warn(
      '   Verify this variable is set correctly in your Vercel project Environment Variables.'
    );
  }
  // --- END DIAGNOSTIC LOG ---

  try {
    // Explicitly log all NEXT_PUBLIC_ Firebase variables for debugging
    console.log('🔍 Firebase Client Env Var Check:');
    const envVars = {
      NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    };

    // Log each variable, indicating if it's missing
    for (const [key, value] of Object.entries(envVars)) {
      if (key === 'NEXT_PUBLIC_FIREBASE_API_KEY' && value) {
        console.log(`  ✅ ${key}: ${value.substring(0, 6)}... (masked)`);
      } else {
        console.log(`  ${value ? '✅' : '❌ MISSING:'} ${key}: ${value || 'undefined'}`);
      }
    }

    // Use the storage bucket directly from env var with fallback
    const STORAGE_BUCKET = envVars.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'snaphealth-39b14.appspot.com';

    // Firebase configuration from environment variables
    const firebaseConfig = {
      apiKey: envVars.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: envVars.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: envVars.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: STORAGE_BUCKET,
      messagingSenderId: envVars.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: envVars.NEXT_PUBLIC_FIREBASE_APP_ID,
      measurementId: envVars.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    };

    // Check all *required* Firebase config values before attempting initialization
    const missingRequiredValues = [];
    if (!firebaseConfig.apiKey) missingRequiredValues.push('NEXT_PUBLIC_FIREBASE_API_KEY');
    if (!firebaseConfig.authDomain) missingRequiredValues.push('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
    if (!firebaseConfig.projectId) missingRequiredValues.push('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
    if (!firebaseConfig.storageBucket) missingRequiredValues.push('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'); // Assuming storage is essential
    if (!firebaseConfig.messagingSenderId) missingRequiredValues.push('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID');
    if (!firebaseConfig.appId) missingRequiredValues.push('NEXT_PUBLIC_FIREBASE_APP_ID');

    if (missingRequiredValues.length > 0) {
      console.error("🛑 CRITICAL ERROR: Missing required Firebase config values:", missingRequiredValues.join(", "));
      console.error("   Firebase cannot be initialized. Check your .env.local file and Vercel environment variables.");
      // Optionally throw an error to halt further execution if Firebase is critical
      // throw new Error(`Missing Firebase config: ${missingRequiredValues.join(", ")}`);
    } else {
      console.log("✅ All required Firebase config values appear to be present.");
    }

    // Initialize Firebase - use existing app if already initialized (prevents duplicate apps)
    const apps = getApps();
    if (!apps.length) {
       // Only attempt initialization if essential variables are present
      if (firebaseConfig.apiKey && firebaseConfig.projectId) {
        console.log("🔥 Initializing Firebase app for the first time with config:");
        // Log the config being used (mask API key)
        console.log(JSON.stringify({ ...firebaseConfig, apiKey: `${firebaseConfig.apiKey.substring(0, 6)}...` }, null, 2));

        app = initializeApp(firebaseConfig);

        // Verify the app was initialized with the correct config
        console.log("🔍 Checking initialized app options:");
        console.log(`  App Name: ${app.name}`);
        console.log(`  API Key (from app.options): ${app.options.apiKey ? `${app.options.apiKey.substring(0, 6)}...` : 'MISSING'}`);
        console.log(`  Project ID (from app.options): ${app.options.projectId || 'MISSING'}`);
        console.log(`  Storage Bucket (from app.options): ${app.options.storageBucket || 'MISSING'}`);

        // Double-check API key match after initialization
        if (app.options.apiKey !== firebaseConfig.apiKey) {
           console.error("🔴 CRITICAL WARNING: API Key mismatch after initialization!");
           console.error(`   Expected: ${firebaseConfig.apiKey.substring(0, 6)}...`);
           console.error(`   Initialized with: ${app.options.apiKey ? app.options.apiKey.substring(0, 6) + '...' : 'MISSING'}`);
        }

      } else {
        console.error("🛑 Cannot initialize Firebase - API key or Project ID is missing in the config object.");
        // Handle the error appropriately, maybe set a global error state
      }
    } else {
      console.log("🔥 Reusing existing Firebase app instance.");
      app = apps[0];
       // Optionally log the existing app's config for comparison
       console.log("   Existing app Project ID:", app.options.projectId);
       console.log("   Existing app Storage Bucket:", app.options.storageBucket);
    }

    // Verify config is correctly set
    if (app && app.options.projectId !== firebaseConfig.projectId) {
      console.error(`⚠️ Project ID mismatch: Env var ${firebaseConfig.projectId}, App config ${app.options.projectId}`);
    }

    if (app && app.options.storageBucket !== STORAGE_BUCKET) {
      console.error(`⚠️ Storage bucket mismatch: Env var ${STORAGE_BUCKET}, App config ${app.options.storageBucket}`);
    } else if (app) {
      console.log(`✅ Storage bucket correctly set to: ${app.options.storageBucket}`);
    }

    // Initialize Firebase services (only if app was successfully initialized or retrieved)
    if (app) {
      try {
        auth = getAuth(app);
        console.log("✅ Firebase Auth initialized");

        // Set persistence to local for better user experience
        try {
          import('firebase/auth').then(({setPersistence, browserLocalPersistence}) => {
            if (auth) {
              setPersistence(auth, browserLocalPersistence)
                .then(() => console.log("✅ Auth persistence set to local"))
                .catch(err => console.error("Error setting auth persistence:", err));
            }
          });
        } catch (err) {
          console.warn("Could not set auth persistence:", err);
        }
      } catch (error) {
        console.error("❌ Error initializing Firebase Auth:", error);
        // Log the specific error code if available, e.g., auth/api-key-not-valid
        if ((error as any).code) {
           console.error(`   Auth Error Code: ${(error as any).code}`);
           if ((error as any).code === 'auth/invalid-api-key') {
               console.error("   🔴 This indicates the API Key passed to Firebase is invalid. Check NEXT_PUBLIC_FIREBASE_API_KEY.")
           }
        }
      }

      // Initialize other services...
      try {
        db = getFirestore(app);
        console.log("✅ Firestore initialized");
      } catch (error) {
        console.error("❌ Error initializing Firestore:", error);
      }

      try {
        storage = getStorage(app);
        console.log("✅ Firebase Storage initialized");
      } catch (error) {
        console.error("❌ Error initializing Firebase Storage:", error);
      }

      // Initialize analytics in production only
      if (process.env.NODE_ENV === 'production') {
        try {
          analytics = getAnalytics(app);
          console.log("✅ Firebase Analytics initialized");
        } catch (error) {
          console.warn("Firebase Analytics initialization skipped:", error);
        }
      }

      // Use emulators in development
      if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
        try {
          if (auth) connectAuthEmulator(auth, 'http://localhost:9099');
          if (db) connectFirestoreEmulator(db, 'localhost', 8080);
          if (storage) connectStorageEmulator(storage, 'localhost', 9199);
          console.log("✅ Connected to Firebase emulators");
        } catch (error) {
          console.error("Error connecting to Firebase emulators:", error);
        }
      }
    } else {
       console.error("🛑 Firebase app object is null, cannot initialize services.");
    }
  } catch (error) {
    console.error("❌ CRITICAL ERROR during Firebase initialization process:", error);
  }
}

export { app, auth, db, storage, analytics }; 