#!/usr/bin/env node

// This script tests Firebase Admin initialization using environment variables
// Usage: node scripts/testFirebaseAdminInit.js

// Load environment variables
require('dotenv').config({ path: '.env.local' });
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

/**
 * Process the private key from base64 and handle any needed transformations
 */
function getPrivateKey() {
  const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
  
  if (!privateKeyBase64) {
    console.error('❌ ERROR: FIREBASE_PRIVATE_KEY_BASE64 is not defined');
    return null;
  }
  
  console.log(`Private key base64 length: ${privateKeyBase64.length} characters`);
  console.log(`First 10 chars: ${privateKeyBase64.substring(0, 10)}...`);
  
  try {
    // Standard decoding
    let privateKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
    
    // Handle escaped newlines if present
    if (privateKey.includes('\\n')) {
      console.log('Found escaped newlines (\\n), replacing with actual newlines');
      privateKey = privateKey.replace(/\\n/g, '\n');
    }
    
    // Print diagnostic info about the key
    console.log(`Decoded key length: ${privateKey.length} characters`);
    console.log(`Has PEM header: ${privateKey.includes('-----BEGIN PRIVATE KEY-----') ? '✅' : '❌'}`);
    console.log(`Has PEM footer: ${privateKey.includes('-----END PRIVATE KEY-----') ? '✅' : '❌'}`);
    console.log(`Contains newlines: ${privateKey.includes('\n') ? '✅' : '❌'}`);
    
    // Return the processed key
    return privateKey;
  } catch (error) {
    console.error('❌ ERROR: Failed to decode private key:', error);
    return null;
  }
}

/**
 * Initialize Firebase Admin and test a basic Firestore operation
 */
async function testFirebaseAdmin() {
  console.log('\n🔄 TESTING FIREBASE ADMIN INITIALIZATION');
  console.log('=======================================');
  
  // Check for required environment variables
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  
  if (!projectId || !clientEmail) {
    console.error('❌ ERROR: Missing required environment variables:');
    if (!projectId) console.error('- NEXT_PUBLIC_FIREBASE_PROJECT_ID');
    if (!clientEmail) console.error('- FIREBASE_CLIENT_EMAIL');
    return false;
  }
  
  console.log(`Project ID: ${projectId}`);
  console.log(`Client Email: ${clientEmail}`);
  console.log(`Storage Bucket: ${storageBucket || 'Not specified'}`);
  
  // Get and validate the private key
  const privateKey = getPrivateKey();
  if (!privateKey) {
    return false;
  }
  
  try {
    // Initialize Firebase Admin
    console.log('\n🔄 Initializing Firebase Admin...');
    
    const app = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      storageBucket,
    });
    
    console.log('✅ Firebase Admin initialized successfully!');
    
    // Test Firestore connection
    console.log('\n🔄 Testing Firestore connection...');
    
    const db = getFirestore();
    const timestamp = new Date().toISOString();
    
    // Try to write a test document
    const docRef = db.collection('admin_tests').doc('connection_test');
    await docRef.set({
      timestamp,
      success: true,
      message: 'Firebase Admin connection test successful'
    });
    
    console.log(`✅ Successfully wrote to Firestore at ${timestamp}`);
    console.log('✅ ALL TESTS PASSED - Firebase Admin is correctly configured');
    return true;
  } catch (error) {
    console.error('❌ ERROR: Firebase Admin initialization failed:', error);
    
    // Provide specific guidance based on error message
    if (error.message?.includes('private key')) {
      console.error('\n🔍 This appears to be a private key format issue:');
      console.error('1. Your private key might not be correctly formatted with proper newlines');
      console.error('2. Try regenerating your service account key in the Firebase console');
      console.error('3. Use the conversion script: node src/scripts/convertServiceAccountToEnv.js');
    } else if (error.message?.includes('Permission denied')) {
      console.error('\n🔍 This appears to be a permissions issue:');
      console.error('1. Make sure your service account has the necessary permissions');
      console.error('2. Check if your project ID matches the service account');
    }
    
    return false;
  }
}

// Run the test
testFirebaseAdmin()
  .then(success => {
    if (!success) {
      console.log('\n❌ Firebase Admin test failed - check the errors above');
      process.exit(1);
    } else {
      console.log('\n🎉 Firebase Admin is correctly configured and operational');
    }
  })
  .catch(error => {
    console.error('Unhandled error in test:', error);
    process.exit(1);
  }); 