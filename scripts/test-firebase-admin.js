// Test script for Firebase Admin SDK initialization
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

console.log('🔥 Firebase Admin SDK Initialization Test');
console.log('----------------------------------------');

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Extract Firebase Admin config
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

// Validate environment variables
console.log('Checking required environment variables:');
console.log(`- Project ID: ${projectId ? '✅' : '❌'}`);
console.log(`- Client Email: ${clientEmail ? '✅' : '❌'}`);
console.log(`- Private Key Base64: ${privateKeyBase64 ? '✅ (length: ' + privateKeyBase64.length + ' chars)' : '❌'}`);

if (!projectId || !clientEmail || !privateKeyBase64) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

// Decode the private key
console.log('\nDecoding private key from base64...');
try {
  const decodedPrivateKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
  
  // Validate the PEM format
  const hasPemHeader = decodedPrivateKey.includes('-----BEGIN PRIVATE KEY-----');
  const hasPemFooter = decodedPrivateKey.includes('-----END PRIVATE KEY-----');
  const hasNewlines = decodedPrivateKey.includes('\n');
  const newlineCount = (decodedPrivateKey.match(/\n/g) || []).length;
  
  console.log(`Private key validation:`);
  console.log(`- Contains PEM header: ${hasPemHeader ? '✅' : '❌'}`);
  console.log(`- Contains PEM footer: ${hasPemFooter ? '✅' : '❌'}`);
  console.log(`- Contains newlines: ${hasNewlines ? `✅ (${newlineCount} found)` : '❌'}`);
  console.log(`- Decoded length: ${decodedPrivateKey.length} characters`);
  
  if (!hasPemHeader || !hasPemFooter || !hasNewlines) {
    console.error('❌ Decoded private key is not in valid PEM format');
    process.exit(1);
  }
  
  console.log('✅ Private key has valid PEM format');
  
  // Initialize Firebase Admin
  console.log('\nInitializing Firebase Admin SDK...');
  initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: decodedPrivateKey,
    }),
    storageBucket,
  });
  
  console.log('✅ Firebase Admin initialized successfully');
  
  // Test Firestore connection
  console.log('\nTesting Firestore connection...');
  const db = getFirestore();
  
  db.collection('test').doc('admin-test')
    .set({
      timestamp: new Date(),
      test: 'Firebase Admin SDK initialization test',
    })
    .then(() => {
      console.log('✅ Successfully connected to Firestore and wrote test document');
      console.log('\n✅✅✅ All tests passed! Firebase Admin SDK is working correctly.');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Firestore write operation failed:', error);
      process.exit(1);
    });
  
} catch (error) {
  console.error('❌ Error initializing Firebase Admin SDK:', error);
  process.exit(1);
} 