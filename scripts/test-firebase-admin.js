// Test script for Firebase Admin SDK initialization
require('dotenv').config({ path: '.env.local.firebase' });
const admin = require('firebase-admin');

// Function to check if a string looks like a PEM private key
function isPEMPrivateKey(key) {
  return (
    key.includes('-----BEGIN PRIVATE KEY-----') &&
    key.includes('-----END PRIVATE KEY-----')
  );
}

// Extract and decode the private key from environment
const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
const privateKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');

console.log('Private key obtained from environment:');
console.log('- Base64 encoded key length:', privateKeyBase64?.length || 0);
console.log('- Decoded key length:', privateKey?.length || 0);
console.log('- Is valid PEM format:', isPEMPrivateKey(privateKey));
console.log('- First 20 chars of decoded key:', privateKey.substring(0, 20) + '...');

// Attempt to initialize Firebase Admin
try {
  console.log('\nInitializing Firebase Admin...');
  
  // Check if already initialized
  try {
    admin.app();
    console.log('Firebase Admin already initialized.');
  } catch (error) {
    // Not initialized yet, proceed with initialization
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey
      })
    });
    console.log('Firebase Admin initialized successfully.');
  }
  
  // Test Firestore access
  console.log('\nTesting Firestore access...');
  const db = admin.firestore();
  
  // Attempt to query a small collection
  db.collection('test-collection').limit(1).get()
    .then(snapshot => {
      console.log(`Firestore query successful. Found ${snapshot.size} documents.`);
      console.log('Firebase Admin initialization test completed successfully! ✅');
    })
    .catch(error => {
      console.error('Error querying Firestore:', error);
    });
    
} catch (error) {
  console.error('Error initializing Firebase Admin:', error);
} 