// Test script to verify Firebase Admin SDK connection
require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

// Function to decode base64 private key
function getPrivateKey() {
  const base64Key = process.env.FIREBASE_PRIVATE_KEY_BASE64;
  if (!base64Key) {
    throw new Error('FIREBASE_PRIVATE_KEY_BASE64 is not defined in environment variables');
  }
  
  try {
    // Decode base64 to UTF-8 string
    const privateKey = Buffer.from(base64Key, 'base64').toString('utf8');
    console.log('Successfully decoded private key');
    console.log(`Private key length: ${privateKey.length}`);
    console.log(`Private key starts with: ${privateKey.substring(0, 20)}...`);
    return privateKey;
  } catch (e) {
    console.error('Error decoding private key:', e);
    throw e;
  }
}

// Initialize Firebase Admin
try {
  if (admin.apps.length === 0) {
    console.log('Initializing Firebase Admin...');
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: getPrivateKey(),
      }),
      databaseURL: `https://${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.firebaseio.com`,
    });
    console.log('Firebase Admin initialized successfully!');
  }
  
  // Test a simple Firestore operation
  console.log('Testing Firestore connection...');
  admin.firestore().collection('connection_tests').doc('test').set({
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    message: 'Connection test successful'
  })
  .then(() => {
    console.log('Successfully wrote to Firestore!');
    console.log('Firebase connection test completed successfully.');
  })
  .catch(error => {
    console.error('Error writing to Firestore:', error);
  });
  
} catch (error) {
  console.error('Error initializing Firebase Admin:', error);
} 