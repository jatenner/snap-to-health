// Test Firebase Admin SDK initialization
require('dotenv').config({ path: '.env.local' });
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

try {
  // Decode the Base64 encoded service account
  const serviceAccountBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
  if (!serviceAccountBase64) {
    throw new Error('FIREBASE_PRIVATE_KEY_BASE64 is not set');
  }
  console.log('FIREBASE_PRIVATE_KEY_BASE64 is set');
  
  const serviceAccountJson = Buffer.from(serviceAccountBase64, 'base64').toString('utf8');
  console.log('Decoded Base64 to JSON string');
  
  const serviceAccount = JSON.parse(serviceAccountJson);
  console.log('Parsed JSON successfully');
  console.log('Service Account Details:');
  console.log(`- Type: ${serviceAccount.type}`);
  console.log(`- Project ID: ${serviceAccount.project_id}`);
  console.log(`- Client Email: ${serviceAccount.client_email}`);
  console.log(`- Private Key is set: ${serviceAccount.private_key ? 'Yes' : 'No'}`);
  
  // Initialize Firebase Admin with the service account
  initializeApp({
    credential: cert(serviceAccount)
  });
  console.log('Firebase Admin SDK initialized successfully');
  
  // Test Firestore connection
  const db = getFirestore();
  console.log('Firestore initialized');
  
  console.log('Test completed successfully');
  process.exit(0);
} catch (error) {
  console.error('Error:', error);
  process.exit(1);
} 