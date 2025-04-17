/**
 * Comprehensive Firebase Test Script
 * 
 * This script tests both Firebase Admin and Firebase Client configurations.
 * It verifies:
 * 1. Environment variables are properly set
 * 2. Firebase Admin initialization works (server-side)
 * 3. Firebase Admin can read/write to Firestore
 * 4. The private key is correctly formatted and parsed
 * 5. Firebase Client-side environment variables are properly set
 * 
 * Run with: node scripts/testFirebaseAll.js
 */

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Import required libraries
const admin = require('firebase-admin');

// Track test results
const results = {
  admin: {
    envVars: false,
    initialization: false,
    firestoreWrite: false,
    firestoreRead: false,
    privateKeyFormat: false
  },
  client: {
    envVars: false,
    configFormat: false
  }
};

// ===== ADMIN TESTS =====

// Test 1: Check Admin environment variables
function testAdminEnvVars() {
  console.log('\n🔍 Testing Firebase Admin environment variables...');
  
  const requiredVars = [
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY_BASE64'
  ];
  
  const missingVars = [];
  
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  }
  
  if (missingVars.length > 0) {
    console.error(`❌ Missing required Firebase Admin environment variables: ${missingVars.join(', ')}`);
    return false;
  }
  
  console.log('✅ All required Firebase Admin environment variables are present');
  results.admin.envVars = true;
  return true;
}

// Test 2: Check private key format
function testPrivateKeyFormat() {
  console.log('\n🔍 Testing Firebase private key format...');
  
  const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
  
  if (!privateKeyBase64) {
    console.error('❌ Missing FIREBASE_PRIVATE_KEY_BASE64');
    return null;
  }
  
  try {
    // Decode the base64 key
    const decodedKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
    
    // Check key format
    const hasPemHeader = decodedKey.includes('-----BEGIN PRIVATE KEY-----');
    const hasPemFooter = decodedKey.includes('-----END PRIVATE KEY-----');
    const hasNewlines = decodedKey.includes('\n');
    const newlineCount = (decodedKey.match(/\n/g) || []).length;
    
    console.log('Private key validation:');
    console.log(`- Contains PEM header: ${hasPemHeader ? '✅' : '❌'}`);
    console.log(`- Contains PEM footer: ${hasPemFooter ? '✅' : '❌'}`);
    console.log(`- Contains newlines: ${hasNewlines ? `✅ (${newlineCount} found)` : '❌'}`);
    console.log(`- Decoded length: ${decodedKey.length} characters`);
    
    if (!hasPemHeader || !hasPemFooter || !hasNewlines) {
      console.error('❌ Private key format invalid');
      return null;
    }
    
    console.log('✅ Private key format is valid');
    results.admin.privateKeyFormat = true;
    return decodedKey;
  } catch (error) {
    console.error('❌ Error decoding private key:', error.message);
    return null;
  }
}

// Test 3 & 4: Initialize Firebase Admin and test Firestore
async function testAdminFirestore() {
  console.log('\n🔍 Testing Firebase Admin initialization and Firestore...');
  
  // Skip if environment variables are missing
  if (!results.admin.envVars) {
    console.error('❌ Skipping Firebase Admin tests due to missing environment variables');
    return false;
  }
  
  // Test private key format
  const privateKey = testPrivateKeyFormat();
  if (!privateKey) {
    return false;
  }
  
  try {
    // Initialize Firebase Admin
    let app;
    if (admin.apps.length === 0) {
      app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey
        }),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
      });
      console.log('✅ Firebase Admin initialized successfully');
      results.admin.initialization = true;
    } else {
      console.log('✅ Firebase Admin already initialized');
      app = admin.app();
      results.admin.initialization = true;
    }
    
    // Test Firestore write
    console.log('\n🔍 Testing Firestore write...');
    const db = admin.firestore();
    const testDoc = {
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      message: 'Firebase Admin SDK connection test',
      success: true
    };
    
    const testRef = db.collection('connection_tests').doc(`test-${Date.now()}`);
    await testRef.set(testDoc);
    console.log('✅ Successfully wrote to Firestore');
    results.admin.firestoreWrite = true;
    
    // Test Firestore read
    console.log('\n🔍 Testing Firestore read...');
    const docSnapshot = await testRef.get();
    if (docSnapshot.exists) {
      const data = docSnapshot.data();
      console.log('✅ Successfully read from Firestore');
      console.log(`   - Test document data: ${JSON.stringify(data, null, 2)}`);
      results.admin.firestoreRead = true;
      return true;
    } else {
      console.error('❌ Failed to read document from Firestore');
      return false;
    }
  } catch (error) {
    console.error('❌ Firebase Admin error:', error.message);
    console.error(error);
    return false;
  }
}

// ===== CLIENT TESTS =====

// Test 5: Check client environment variables
function testClientEnvVars() {
  console.log('\n🔍 Testing Firebase Client environment variables...');
  
  const requiredVars = [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'NEXT_PUBLIC_FIREBASE_APP_ID'
  ];
  
  const missingVars = [];
  const configuredVars = {};
  
  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (!value) {
      missingVars.push(varName);
    } else {
      // Store the actual value or a masked version for sensitive values
      configuredVars[varName] = varName === 'NEXT_PUBLIC_FIREBASE_API_KEY' 
        ? `${value.substring(0, 5)}...` 
        : value;
    }
  }
  
  if (missingVars.length > 0) {
    console.error(`❌ Missing required client environment variables: ${missingVars.join(', ')}`);
    return false;
  }
  
  console.log('✅ All required client environment variables are present:');
  Object.entries(configuredVars).forEach(([key, value]) => {
    console.log(`   - ${key}: ${value}`);
  });
  
  results.client.envVars = true;
  return true;
}

// Test 6: Validate client config format
function testClientConfigFormat() {
  console.log('\n🔍 Testing Firebase Client configuration format...');
  
  // Skip if environment variables are missing
  if (!results.client.envVars) {
    console.error('❌ Skipping client config format test due to missing environment variables');
    return false;
  }
  
  // Create the config object
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  };
  
  let formatValid = true;
  
  // Validate auth domain format
  if (!firebaseConfig.authDomain.includes('.firebaseapp.com')) {
    console.warn(`⚠️ Auth domain ${firebaseConfig.authDomain} doesn't match the expected format of <project-id>.firebaseapp.com`);
    formatValid = false;
  }
  
  // Validate storage bucket format
  if (!firebaseConfig.storageBucket.includes('.appspot.com') && 
      !firebaseConfig.storageBucket.includes('.firebasestorage.googleapis.com')) {
    console.warn(`⚠️ Storage bucket ${firebaseConfig.storageBucket} doesn't match the expected format`);
    formatValid = false;
  }
  
  // Validate app ID format
  if (!firebaseConfig.appId.includes(':')) {
    console.warn(`⚠️ App ID format seems incorrect - should contain colons`);
    formatValid = false;
  }
  
  if (formatValid) {
    console.log('✅ Firebase Client configuration format is valid');
    results.client.configFormat = true;
    return true;
  } else {
    console.warn('⚠️ Firebase Client configuration has format warnings (see above)');
    results.client.configFormat = false;
    return false;
  }
}

// ===== RUN ALL TESTS =====

async function runAllTests() {
  console.log('🔥 FIREBASE COMPREHENSIVE TEST');
  console.log('=============================');
  
  // Admin Tests
  testAdminEnvVars();
  await testAdminFirestore();
  
  // Client Tests
  testClientEnvVars();
  testClientConfigFormat();
  
  // Print Summary
  console.log('\n=============================');
  console.log('📋 TEST RESULTS SUMMARY');
  console.log('=============================');
  
  console.log('\nFirebase Admin Tests:');
  console.log(`- Environment Variables: ${results.admin.envVars ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`- Private Key Format: ${results.admin.privateKeyFormat ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`- Admin Initialization: ${results.admin.initialization ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`- Firestore Write: ${results.admin.firestoreWrite ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`- Firestore Read: ${results.admin.firestoreRead ? '✅ PASS' : '❌ FAIL'}`);
  
  console.log('\nFirebase Client Tests:');
  console.log(`- Environment Variables: ${results.client.envVars ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`- Config Format: ${results.client.configFormat ? '✅ PASS' : '❌ FAIL'}`);
  
  // Overall result
  const adminSuccess = Object.values(results.admin).every(result => result);
  const clientSuccess = Object.values(results.client).every(result => result);
  const allSuccess = adminSuccess && clientSuccess;
  
  console.log('\n=============================');
  if (allSuccess) {
    console.log('✅ ALL TESTS PASSED! Firebase is correctly configured.');
  } else {
    console.log('⚠️ SOME TESTS FAILED. See details above.');
    
    if (!adminSuccess) {
      console.log('\n💡 Firebase Admin troubleshooting tips:');
      console.log('1. Make sure your service account private key is correctly base64 encoded');
      console.log('2. Check that your service account has the necessary permissions');
      console.log('3. Try regenerating your service account key from the Firebase console');
    }
    
    if (!clientSuccess) {
      console.log('\n💡 Firebase Client troubleshooting tips:');
      console.log('1. Make sure all NEXT_PUBLIC_FIREBASE_* variables are correctly set in .env.local');
      console.log('2. Verify the values match those in your Firebase console');
    }
  }
  
  return allSuccess;
}

// Run all tests
runAllTests()
  .then(() => {
    console.log('\nTest script completed.');
  })
  .catch(error => {
    console.error('\n❌ Unexpected error during tests:');
    console.error(error);
    process.exit(1);
  }); 