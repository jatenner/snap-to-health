'use client';

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, onAuthStateChanged, Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, Firestore } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, FirebaseStorage } from 'firebase/storage';
import { getAnalytics, Analytics } from 'firebase/analytics';
import { ref } from 'firebase/storage';

// Force the correct storage bucket with fallback, always use firebasestorage.app domain
const STORAGE_BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'snaphealth-39b14.firebasestorage.app';

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

// Initialize Firebase - use existing app if already initialized
let app: FirebaseApp;
try {
  const apps = getApps();
  if (!apps.length) {
    // Only initialize once
    app = initializeApp(firebaseConfig);
  } else {
    app = apps[0];
    
    // This is crucial - check if we need to update the storage bucket in the existing app
    if (app && app.options && app.options.storageBucket !== STORAGE_BUCKET) {
      console.warn("⚠️ Existing app using incorrect storage bucket:", app.options.storageBucket);
      console.warn("⚠️ Should be using:", STORAGE_BUCKET);
      
      // Force re-initialization with correct bucket
      // @ts-ignore - Access internal property to delete the app
      delete (window as any).firebase?.apps?.[app.name];
      app = initializeApp(firebaseConfig);
    }
  }
  
  // Verify config is correctly set
  if (app.options.storageBucket !== STORAGE_BUCKET) {
    console.error("⚠️ CRITICAL ERROR: Storage bucket mismatch after initialization");
    console.error(`Expected: ${STORAGE_BUCKET}, Got: ${app.options.storageBucket}`);
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
    
    // Set persistence to local for better user experience
    try {
      import('firebase/auth').then(({setPersistence, browserLocalPersistence}) => {
        if (auth) {
          setPersistence(auth, browserLocalPersistence)
            .catch(err => console.error("Error setting auth persistence:", err));
        }
      });
    } catch (err) {
      console.warn("Could not set auth persistence:", err);
    }
    
    // Listen for auth state changes to log any issues
    if (auth) {
      const unsubscribe = onAuthStateChanged(auth, 
        () => {},
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
    
    // Enable offline persistence for Firestore
    try {
      import('firebase/firestore').then(({enableIndexedDbPersistence}) => {
        if (db) {
          enableIndexedDbPersistence(db)
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
    if (storage && storage.app && storage.app.options) {
      const actualBucket = storage.app.options.storageBucket;
      
      // Double-check the storage bucket is correct
      if (actualBucket !== STORAGE_BUCKET) {
        console.error("⚠️ STORAGE BUCKET MISMATCH ⚠️");
        console.error(`Expected: ${STORAGE_BUCKET}`);
        console.error(`Actual: ${actualBucket}`);
        console.error("This will likely cause CORS issues during uploads!");
        
        // Try to re-initialize storage with correct bucket
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
          }
        } catch (reinitError) {
          console.error("Error re-initializing storage:", reinitError);
        }
      }
    }
    
    // Configure storage for better reliability
    try {
      // Create a test reference (but don't use it)
      ref(storage, '_test');
    } catch (storageConfigError) {
      console.warn("Could not configure storage settings:", storageConfigError);
    }
  } catch (error) {
    console.error("Error initializing Firebase Storage:", error);
    storage = getStorage(app); // Fallback attempt
  }

  // Initialize analytics in production only
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
    try {
      analytics = getAnalytics(app);
    } catch (error) {
      console.warn("Error initializing Firebase Analytics:", error);
    }
  }

  // Use emulators in development
  if (process.env.NODE_ENV === 'development') {
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      try {
        if (auth) connectAuthEmulator(auth, 'http://localhost:9099');
        if (db) connectFirestoreEmulator(db, 'localhost', 8080);
        if (storage) connectStorageEmulator(storage, 'localhost', 9199);
      } catch (error) {
        console.error("Error connecting to Firebase emulators:", error);
      }
    }
  }
};

// Initialize Firebase services
initializeFirebaseServices();

export { app, auth, db, storage, analytics }; 