const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

console.log('Firebase Config Environment Variables:');
console.log('Project ID exists:', !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
console.log('Storage Bucket exists:', !!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
console.log('Storage Bucket value:', process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);

// Get storage bucket from env variable - ALWAYS use firebasestorage.app
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'snaphealth-39b14.firebasestorage.app';
console.log('Using storage bucket:', storageBucket);

// Initialize Firebase Admin with default credentials
try {
  admin.initializeApp({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: storageBucket
  });
  console.log('Firebase Admin initialized');
} catch (error) {
  // App might already be initialized
  console.log('Firebase admin initialization error:', error.message);
}

const bucket = admin.storage().bucket();

// Read CORS configuration
const corsConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'cors.json'), 'utf8')
);

console.log(`Applying CORS settings to Firebase Storage bucket: ${storageBucket}`);
console.log('CORS Configuration:', JSON.stringify(corsConfig, null, 2));

// Apply CORS settings
bucket.setCorsConfiguration(corsConfig)
  .then(() => {
    console.log('CORS settings applied successfully!');
    console.log('Testing CORS configuration...');
    return bucket.getCorsConfiguration();
  })
  .then((corsResponse) => {
    console.log('Current CORS configuration:');
    console.log(JSON.stringify(corsResponse, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error applying CORS settings:', error);
    process.exit(1);
  }); 