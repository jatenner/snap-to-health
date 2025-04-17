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
let firebaseInitializationError: Error | null = null;

// Make sure we're in the browser before initializing Firebase
if (typeof window !== 'undefined') {
  // --- BEGIN DIAGNOSTIC LOG & VALIDATION ---
  const envConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Optional
  };

  console.log(`[Startup Firebase Check] Raw Env Values:`, {
      apiKey: envConfig.apiKey ? 'Exists (masked)' : '🔴 MISSING',
      authDomain: envConfig.authDomain || '🔴 MISSING',
      projectId: envConfig.projectId || '🔴 MISSING',
      // Add others if needed for debugging
  });

  // Validate required fields *before* proceeding
  const requiredKeys: (keyof typeof envConfig)[] = [
    'apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'
  ];
  const missingKeys = requiredKeys.filter(key => !envConfig[key]);

  if (missingKeys.length > 0) {
    const errorMsg = `🔴 CRITICAL ERROR: Missing required Firebase env vars: ${missingKeys.join(', ')}. Check .env.local & Vercel.`;
    console.error(errorMsg);
    firebaseInitializationError = new Error(errorMsg); // Store error to prevent app usage
  } else if (envConfig.apiKey && !envConfig.apiKey.startsWith('AIza')) {
     const errorMsg = `🔴 CRITICAL ERROR: NEXT_PUBLIC_FIREBASE_API_KEY seems invalid (doesn't start with AIza). Value: ${envConfig.apiKey.substring(0,10)}...`;
     console.error(errorMsg);
     firebaseInitializationError = new Error(errorMsg);
  } else {
     console.log("✅ All required Firebase environment variables seem present.");
  }
  // --- END DIAGNOSTIC LOG & VALIDATION ---

  // Only proceed if no critical errors were found during validation
  if (!firebaseInitializationError) {
    try {
      // Use validated config
      const firebaseConfig = {
        apiKey: envConfig.apiKey!, // Assert non-null based on checks above
        authDomain: envConfig.authDomain!,
        projectId: envConfig.projectId!,
        storageBucket: envConfig.storageBucket!,
        messagingSenderId: envConfig.messagingSenderId!,
        appId: envConfig.appId!,
        measurementId: envConfig.measurementId, // Can be undefined
      };

      // Initialize Firebase - use existing app if already initialized
      const apps = getApps();
      if (!apps.length) {
          console.log("🔥 Initializing Firebase app for the first time...");
          // Add the requested diagnostic log just before initialization
          console.log('[Firebase Init Check]', {
            apiKey: firebaseConfig.apiKey ? `${firebaseConfig.apiKey.substring(0, 6)}... (masked)` : 'MISSING',
            projectId: firebaseConfig.projectId,
            authDomain: firebaseConfig.authDomain,
            appWasInitialized: false, // Logging before init
          });

          app = initializeApp(firebaseConfig);

          console.log("✅ Firebase app initialized.");
          console.log('[Firebase Init Check]', { // Log again after init
            apiKey: app.options.apiKey ? `${app.options.apiKey.substring(0, 6)}... (masked)` : 'MISSING',
            projectId: app.options.projectId,
            authDomain: app.options.authDomain,
            appWasInitialized: true,
          });

          // Verify API key match after initialization
          if (app.options.apiKey !== firebaseConfig.apiKey) {
             console.error("🔴 CRITICAL WARNING: API Key mismatch after initialization!");
             console.error(`   Env Var: ${firebaseConfig.apiKey.substring(0, 6)}...`);
             console.error(`   Initialized App: ${app.options.apiKey ? app.options.apiKey.substring(0, 6) + '...' : 'MISSING'}`);
          }

      } else {
        console.log("🔥 Reusing existing Firebase app instance.");
        app = apps[0];
         // Log config of existing app for comparison
         console.log('[Firebase Init Check - Existing App]', {
            apiKey: app.options.apiKey ? `${app.options.apiKey.substring(0, 6)}... (masked)` : 'MISSING',
            projectId: app.options.projectId,
            authDomain: app.options.authDomain,
            appWasInitialized: true,
         });
      }

      // Initialize Firebase services (only if app object exists)
      if (app) {
        try {
          auth = getAuth(app); // Pass the guaranteed non-null app
          console.log("✅ Firebase Auth service initialized.");
        } catch (authError: any) {
          console.error("❌ Error initializing Firebase Auth:", authError);
          if (authError.code === 'auth/invalid-api-key') {
             console.error("   🔴 Auth Error Code: auth/invalid-api-key. The API Key used is invalid. Check Vercel Environment Variables.");
          } else {
             console.error(`   Auth Error Code: ${authError.code || 'N/A'}`);
          }
          firebaseInitializationError = authError; // Store auth error
        }

        try {
          db = getFirestore(app); // Pass the guaranteed non-null app
          console.log("✅ Firestore service initialized.");
        } catch (dbError: any) {
          console.error("❌ Error initializing Firestore:", dbError);
          firebaseInitializationError = firebaseInitializationError || dbError; // Store first error
        }

        try {
          storage = getStorage(app); // Pass the guaranteed non-null app
          console.log("✅ Firebase Storage service initialized.");
        } catch (storageError: any) {          console.error("❌ Error initializing Firebase Storage:", storageError);
          firebaseInitializationError = firebaseInitializationError || storageError; // Store first error
        }

        // Initialize analytics (optional, only in production)
        if (process.env.NODE_ENV === 'production' && firebaseConfig.measurementId) {
          try {
            analytics = getAnalytics(app); // Pass the guaranteed non-null app
            console.log("✅ Firebase Analytics initialized.");
          } catch (analyticsError) {
            console.warn("Firebase Analytics initialization skipped/failed:", analyticsError);
          }
        }

        // Connect to emulators in development
        if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
          try {
            // Services might be null if their specific init failed
            if (auth) connectAuthEmulator(auth, 'http://localhost:9099');
            if (db) connectFirestoreEmulator(db, 'localhost', 8080);
            if (storage) connectStorageEmulator(storage, 'localhost', 9199);
            console.log("✅ Connected to Firebase emulators (if running).");
          } catch (emulatorError) {
            console.error("Error connecting to Firebase emulators:", emulatorError);
          }
        }
      } else {
         // This case should now be prevented by the initial validation, but added for safety
         console.error("🛑 Firebase app object is unexpectedly null after initialization check.");
         firebaseInitializationError = firebaseInitializationError || new Error("Firebase app object is null after checks.");
      }
    } catch (initError: any) {
      console.error("❌ CRITICAL ERROR during Firebase initialization block:", initError);
      firebaseInitializationError = initError; // Store the init error
    }
  } else {
      // Log that initialization was skipped due to missing env vars
      console.error("🛑 Firebase initialization skipped due to missing environment variables detected earlier.");
  }
}

// Export the potentially null services and the error state
export { app, auth, db, storage, analytics, firebaseInitializationError }; 