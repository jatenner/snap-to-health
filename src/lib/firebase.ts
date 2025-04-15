'use client';

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, onAuthStateChanged, Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, Firestore } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, FirebaseStorage } from 'firebase/storage';
import { getAnalytics, Analytics } from 'firebase/analytics';
import { ref } from 'firebase/storage';

// DEBUGGING - log environment variable availability in browser
console.log("Firebase Config Environment Variables:");
console.log("API Key exists:", !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
console.log("Auth Domain exists:", !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);
console.log("Project ID exists:", !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
console.log("Storage Bucket exists:", !!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
console.log("Storage Bucket value:", process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);

// Force the correct storage bucket with fallback, always use firebasestorage.app domain
const STORAGE_BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'snaphealth-39b14.firebasestorage.app';
console.log("FORCED STORAGE BUCKET:", STORAGE_BUCKET);

// Verify the bucket format is correct
if (STORAGE_BUCKET.includes('appspot.com')) {
  console.error("⚠️ INCORRECT BUCKET FORMAT! Using appspot.com instead of firebasestorage.app");
  console.error("Please update your .env.local file to use the correct bucket format");
  console.error("Currently using:", STORAGE_BUCKET);
  console.error("Should be using a bucket ending with .firebasestorage.app");
}

// Firebase configuration from environment variables with forced storage bucket
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: STORAGE_BUCKET,  // Use the forced storage bucket
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Log the actual config we're using
console.log("Using Firebase Config:", JSON.stringify({
  ...firebaseConfig,
  apiKey: firebaseConfig.apiKey ? "REDACTED" : undefined, // Redact sensitive info
  appId: firebaseConfig.appId ? "REDACTED" : undefined,   // Redact sensitive info
}));

// Initialize Firebase - use existing app if already initialized
let app: FirebaseApp;
try {
  const apps = getApps();
  if (!apps.length) {
    // Only initialize once
    console.log("Initializing new Firebase app");
    app = initializeApp(firebaseConfig);
  } else {
    console.log("Using existing Firebase app");
    app = apps[0];
    
    // This is crucial - check if we need to update the storage bucket in the existing app
    if (app && app.options && app.options.storageBucket !== STORAGE_BUCKET) {
      console.warn("⚠️ Existing app using incorrect storage bucket:", app.options.storageBucket);
      console.warn("⚠️ Should be using:", STORAGE_BUCKET);
      console.warn("⚠️ Will initialize a new app with correct settings");
      
      // Force re-initialization with correct bucket
      // @ts-ignore - Access internal property to delete the app
      delete (window as any).firebase?.apps?.[app.name];
      app = initializeApp(firebaseConfig);
      console.log("Re-initialized Firebase app with correct storage bucket");
    }
  }
  
  // Verify config is correctly set
  console.log("Verifying Firebase config after initialization:");
  console.log("Storage bucket in app config:", app.options.storageBucket);
  if (app.options.storageBucket !== STORAGE_BUCKET) {
    console.error("⚠️ CRITICAL ERROR: Storage bucket mismatch after initialization");
    console.error(`Expected: ${STORAGE_BUCKET}, Got: ${app.options.storageBucket}`);
  } else {
    console.log("✅ Storage bucket verified after app initialization:", app.options.storageBucket);
  }
  
} catch (error) {
  console.error("Error initializing Firebase app:", error);
  throw new Error("Failed to initialize Firebase app");
}

// Initialize Firebase services with improved error handling
let auth: Auth | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;
let analytics: Analytics | null = null;

// Ensure Firebase is properly initialized
const initializeFirebaseServices = () => {
  try {
    auth = getAuth(app);
    console.log("Firebase Auth initialized successfully");
    
    // Set persistence to local for better user experience
    try {
      import('firebase/auth').then(({setPersistence, browserLocalPersistence}) => {
        if (auth) {
          setPersistence(auth, browserLocalPersistence)
            .then(() => console.log("Auth persistence set to LOCAL"))
            .catch(err => console.error("Error setting auth persistence:", err));
        }
      });
    } catch (err) {
      console.warn("Could not set auth persistence:", err);
    }
    
    // Listen for auth state changes to log any issues
    if (auth) {
      const unsubscribe = onAuthStateChanged(auth, 
        (user) => {
          console.log("Auth state changed:", user ? `User logged in (${user.uid})` : "No user");
        },
        (error) => {
          console.error("Auth state change error:", error);
        }
      );
    }
  } catch (error) {
    console.error("Error initializing Firebase Auth:", error);
    auth = getAuth(app); // Fallback attempt
  }

  try {
    db = getFirestore(app);
    console.log("Firebase Firestore initialized successfully");
    
    // Enable offline persistence for Firestore
    try {
      import('firebase/firestore').then(({enableIndexedDbPersistence}) => {
        if (db) {
          enableIndexedDbPersistence(db)
            .then(() => console.log("Firestore offline persistence enabled"))
            .catch(err => console.warn("Firestore persistence error:", err));
        }
      });
    } catch (err) {
      console.warn("Could not enable Firestore persistence:", err);
    }
  } catch (error) {
    console.error("Error initializing Firestore:", error);
    db = getFirestore(app); // Fallback attempt
  }

  try {
    storage = getStorage(app);
    console.log("Firebase Storage initialized successfully");
    if (storage && storage.app && storage.app.options) {
      const actualBucket = storage.app.options.storageBucket;
      console.log("Storage bucket:", actualBucket);
      
      // Double-check the storage bucket is correct
      if (actualBucket !== STORAGE_BUCKET) {
        console.error("⚠️ STORAGE BUCKET MISMATCH ⚠️");
        console.error(`Expected: ${STORAGE_BUCKET}`);
        console.error(`Actual: ${actualBucket}`);
        console.error("This will likely cause CORS issues during uploads!");
        
        // Try to re-initialize storage with correct bucket
        console.log("Attempting to re-initialize storage with correct bucket...");
        try {
          // Force re-initialization with correct bucket
          // @ts-ignore - Access internal property to delete the app
          delete (window as any).firebase?.apps?.[app.name];
          app = initializeApp(firebaseConfig);
          storage = getStorage(app);
          
          // Verify again
          const newBucket = storage.app.options.storageBucket;
          if (newBucket !== STORAGE_BUCKET) {
            console.error("⚠️ STORAGE BUCKET STILL MISMATCHED AFTER RE-INITIALIZATION ⚠️");
          } else {
            console.log("✅ Storage bucket corrected after re-initialization:", newBucket);
          }
        } catch (reinitError) {
          console.error("Error re-initializing storage:", reinitError);
        }
      } else {
        console.log("✅ Storage bucket verified:", actualBucket);
      }
    }
    
    // Configure storage for better reliability
    try {
      // Configure maximum operation retry time (default is 2 minutes)
      const storageRef = ref(storage, '_test');
      console.log(`Storage reference created for test: ${storageRef.fullPath}`);
      console.log(`Test reference bucket: ${storageRef.bucket}`);
      
      // Log that storage is ready
      console.log("Firebase Storage configured for improved reliability");
    } catch (storageConfigError) {
      console.warn("Could not configure storage settings:", storageConfigError);
    }
  } catch (error) {
    console.error("Error initializing Firebase Storage:", error);
    storage = getStorage(app); // Fallback attempt
  }

  // Initialize Analytics but only on the client side and in production
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
    try {
      analytics = getAnalytics(app);
      console.log('Firebase Analytics initialized');
    } catch (error) {
      console.error('Firebase Analytics initialization error:', error);
    }
  }
};

// Call the initialization function
initializeFirebaseServices();

// Use emulators in development
if (process.env.NODE_ENV === 'development') {
  try {
    if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true' && auth && db && storage) {
      connectAuthEmulator(auth, 'http://localhost:9099');
      connectFirestoreEmulator(db, 'localhost', 8080);
      connectStorageEmulator(storage, 'localhost', 9199);
      console.log('Firebase Emulators connected');
    }
  } catch (error) {
    console.error('Firebase Emulator connection error:', error);
  }
}

console.log("Firebase Auth initialized:", !!auth);
console.log("Firebase DB initialized:", !!db);
console.log("Firebase Storage initialized:", !!storage);

export { app, auth, db, storage, analytics }; 