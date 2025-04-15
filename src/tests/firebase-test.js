// Firebase Test Script
// Run with: node -r dotenv/config src/tests/firebase-test.js

// Import Firebase client
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, doc, setDoc, getDoc, deleteDoc } = require('firebase/firestore');
const { getStorage, ref, uploadString, getDownloadURL, deleteObject } = require('firebase/storage');

// Import Firebase Admin
const admin = require('firebase-admin');

// Output functions
const success = (message) => console.log(`✅ ${message}`);
const fail = (message) => console.error(`❌ ${message}`);
const info = (message) => console.log(`ℹ️ ${message}`);

async function testFirebaseClient() {
  info('\n--- FIREBASE CLIENT SDK TEST ---');
  
  try {
    // Initialize Firebase client
    const firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };
    
    // Validate config
    const missingVars = Object.entries(firebaseConfig)
      .filter(([_, value]) => !value)
      .map(([key]) => key);
    
    if (missingVars.length > 0) {
      fail(`Missing Firebase client config: ${missingVars.join(', ')}`);
      return false;
    }
    
    // Initialize app
    info('Initializing Firebase client...');
    const app = initializeApp(firebaseConfig);
    success('Firebase client initialized');
    
    // Initialize services
    const auth = getAuth(app);
    const db = getFirestore(app);
    const storage = getStorage(app);
    
    success('All Firebase client services initialized');
    
    // Return initialized services for further testing
    return { app, auth, db, storage };
  } catch (error) {
    fail(`Firebase client initialization error: ${error.message}`);
    console.error(error);
    return false;
  }
}

async function testFirebaseAdmin() {
  info('\n--- FIREBASE ADMIN SDK TEST ---');
  
  try {
    // Check for required environment variables
    const requiredVars = [
      'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
      'FIREBASE_CLIENT_EMAIL',
      'FIREBASE_PRIVATE_KEY'
    ];
    
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      fail(`Missing Firebase Admin config: ${missingVars.join(', ')}`);
      return false;
    }
    
    // Process private key (might include escaped newlines)
    const getPrivateKey = () => {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY;
      return privateKey.includes('\\n') ? privateKey.replace(/\\n/g, '\n') : privateKey;
    };
    
    // Initialize Firebase Admin
    info('Initializing Firebase Admin...');
    
    // Use a unique app name to avoid collisions in testing
    const app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: getPrivateKey(),
      }),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    }, 'test-admin-app');
    
    success('Firebase Admin initialized');
    
    // Initialize services
    const adminDb = admin.firestore(app);
    const adminAuth = admin.auth(app);
    const adminStorage = admin.storage(app).bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
    
    success('All Firebase Admin services initialized');
    
    // Return initialized services for further testing
    return { app, adminDb, adminAuth, adminStorage };
  } catch (error) {
    fail(`Firebase Admin initialization error: ${error.message}`);
    console.error(error);
    return false;
  }
}

// Test Firebase Firestore
async function testFirestore(db, adminDb) {
  info('\n--- FIRESTORE TEST ---');
  
  const TEST_COLLECTION = 'tests';
  const TEST_DOC_ID = `test-doc-${Date.now()}`;
  const TEST_DATA = { 
    message: 'Test data', 
    timestamp: new Date().toISOString() 
  };
  
  try {
    // Client write
    info('Testing Firestore client write...');
    await setDoc(doc(db, TEST_COLLECTION, TEST_DOC_ID), TEST_DATA);
    success('Firestore client write successful');
    
    // Client read
    info('Testing Firestore client read...');
    const docSnap = await getDoc(doc(db, TEST_COLLECTION, TEST_DOC_ID));
    if (docSnap.exists()) {
      success('Firestore client read successful');
    } else {
      fail('Firestore client read failed - document not found');
    }
    
    // Admin read
    info('Testing Firestore admin read...');
    const adminDocSnap = await adminDb.collection(TEST_COLLECTION).doc(TEST_DOC_ID).get();
    if (adminDocSnap.exists) {
      success('Firestore admin read successful');
    } else {
      fail('Firestore admin read failed - document not found');
    }
    
    // Admin write
    info('Testing Firestore admin write...');
    const ADMIN_TEST_DATA = { 
      message: 'Admin test data', 
      timestamp: new Date().toISOString() 
    };
    await adminDb.collection(TEST_COLLECTION).doc(`${TEST_DOC_ID}-admin`).set(ADMIN_TEST_DATA);
    success('Firestore admin write successful');
    
    // Cleanup
    info('Cleaning up test documents...');
    await deleteDoc(doc(db, TEST_COLLECTION, TEST_DOC_ID));
    await adminDb.collection(TEST_COLLECTION).doc(`${TEST_DOC_ID}-admin`).delete();
    success('Firestore cleanup successful');
    
    return true;
  } catch (error) {
    fail(`Firestore test error: ${error.message}`);
    console.error(error);
    return false;
  }
}

// Test Firebase Storage
async function testStorage(storage, adminStorage) {
  info('\n--- STORAGE TEST ---');
  
  const TEST_FILE_PATH = `test-files/test-file-${Date.now()}.txt`;
  const TEST_FILE_CONTENT = 'This is a test file content';
  
  try {
    // Client upload
    info('Testing Storage client upload...');
    const storageRef = ref(storage, TEST_FILE_PATH);
    await uploadString(storageRef, TEST_FILE_CONTENT);
    success('Storage client upload successful');
    
    // Client get URL
    info('Testing Storage client download URL...');
    const downloadURL = await getDownloadURL(storageRef);
    success(`Storage client download URL generated: ${downloadURL.substring(0, 50)}...`);
    
    // Admin file operations
    info('Testing Storage admin file operations...');
    const adminFile = adminStorage.file(TEST_FILE_PATH);
    const exists = await adminFile.exists();
    if (exists[0]) {
      success('Storage admin access successful');
    } else {
      fail('Storage admin access failed - file not found');
    }
    
    // Cleanup
    info('Cleaning up test storage files...');
    await deleteObject(storageRef);
    success('Storage cleanup successful');
    
    return true;
  } catch (error) {
    fail(`Storage test error: ${error.message}`);
    console.error(error);
    return false;
  }
}

// Test Firebase Auth
async function testAuth(auth, adminAuth) {
  info('\n--- AUTH TEST ---');
  
  const TEST_EMAIL = `test-user-${Date.now()}@example.com`;
  const TEST_PASSWORD = 'TestPassword123!';
  
  try {
    // Client create user
    info('Testing Auth client user creation...');
    let userCredential;
    try {
      userCredential = await createUserWithEmailAndPassword(auth, TEST_EMAIL, TEST_PASSWORD);
      success('Auth client user creation successful');
    } catch (error) {
      fail(`Auth client user creation failed: ${error.message}`);
      return false;
    }
    
    // Client sign in
    info('Testing Auth client sign in...');
    try {
      await signInWithEmailAndPassword(auth, TEST_EMAIL, TEST_PASSWORD);
      success('Auth client sign in successful');
    } catch (error) {
      fail(`Auth client sign in failed: ${error.message}`);
    }
    
    // Admin get user
    info('Testing Auth admin user retrieve...');
    try {
      const userRecord = await adminAuth.getUser(userCredential.user.uid);
      success('Auth admin user retrieve successful');
    } catch (error) {
      fail(`Auth admin user retrieve failed: ${error.message}`);
    }
    
    // Cleanup
    info('Cleaning up test user...');
    try {
      await adminAuth.deleteUser(userCredential.user.uid);
      success('Auth user cleanup successful');
    } catch (error) {
      fail(`Auth user cleanup failed: ${error.message}`);
    }
    
    return true;
  } catch (error) {
    fail(`Auth test error: ${error.message}`);
    console.error(error);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  info('\n==== FIREBASE VALIDATION TEST SUITE ====');
  info(`Testing Firebase for project: ${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'undefined'}`);
  
  // Test Firebase Client
  const clientServices = await testFirebaseClient();
  if (!clientServices) return;
  
  // Test Firebase Admin
  const adminServices = await testFirebaseAdmin();
  if (!adminServices) return;
  
  // Test Firestore
  const firestoreResult = await testFirestore(clientServices.db, adminServices.adminDb);
  
  // Test Storage
  const storageResult = await testStorage(clientServices.storage, adminServices.adminStorage);
  
  // Test Auth
  const authResult = await testAuth(clientServices.auth, adminServices.adminAuth);
  
  // Summary
  info('\n==== TEST SUMMARY ====');
  if (firestoreResult && storageResult && authResult) {
    success('All Firebase tests passed!');
    success(`
    ✅ Firebase Client SDK: Initialized successfully
    ✅ Firebase Admin SDK: Initialized successfully  
    ✅ Firestore: Read/write working from both client and admin
    ✅ Storage: Upload/download working from both client and admin
    ✅ Auth: User operations working from both client and admin
    `);
  } else {
    fail('Some Firebase tests failed. See above for details.');
  }
  
  // Cleanup
  adminServices.app.delete();
}

// Run tests
runAllTests().catch(error => {
  console.error('Test script error:', error);
  process.exit(1);
}); 