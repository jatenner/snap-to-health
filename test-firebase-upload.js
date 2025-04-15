// Test script to verify Firebase Storage uploads
const { initializeApp } = require('firebase/app');
const { getStorage, ref, uploadBytes, getDownloadURL } = require('firebase/storage');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env.local
const result = dotenv.config({ path: '.env.local' });
if (result.error) {
  console.error('Error loading .env.local file:', result.error);
}

// Log environment variables (partial, without sensitive values)
console.log('Firebase Config Environment Variables:');
console.log('API Key exists:', !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY);
console.log('Auth Domain exists:', !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN);
console.log('Project ID exists:', !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
console.log('Storage Bucket exists:', !!process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);

// Set Firebase configuration from environment variables or fallback to hardcoded values for testing
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyAUvJPkN2H44CCayUX9S2QEr268hykmXKc',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'snaphealth-39b14.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'snaphealth-39b14',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'snaphealth-39b14.appspot.com',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

console.log('Initializing Firebase with config:', {
  ...firebaseConfig,
  apiKey: firebaseConfig.apiKey ? '[HIDDEN]' : undefined
});

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

console.log('Firebase Storage initialized');

async function testUpload() {
  try {
    // Create a test file if it doesn't exist
    const testFilePath = path.join(__dirname, 'test-image.txt');
    
    if (!fs.existsSync(testFilePath)) {
      fs.writeFileSync(testFilePath, 'This is a test file for Firebase Storage upload test.');
      console.log('Created test file:', testFilePath);
    }
    
    // Read the test file
    const fileContent = fs.readFileSync(testFilePath);
    console.log('Test file content:', fileContent.toString().substring(0, 50) + '...');
    
    // Create a storage reference
    const testStoragePath = `tests/test-${Date.now()}.txt`;
    const storageRef = ref(storage, testStoragePath);
    console.log('Storage reference created:', storageRef.fullPath);
    
    // Set metadata
    const metadata = {
      contentType: 'text/plain',
      customMetadata: {
        'test': 'true',
        'timestamp': new Date().toISOString()
      }
    };
    console.log('Using metadata:', metadata);
    
    // Upload the file
    console.log('Starting upload...');
    const snapshot = await uploadBytes(storageRef, fileContent, metadata);
    console.log('Upload completed successfully!');
    console.log('Upload snapshot:', {
      metadata: snapshot.metadata,
      ref: snapshot.ref.fullPath,
      totalBytes: snapshot.totalBytes
    });
    
    // Get the download URL
    const downloadURL = await getDownloadURL(snapshot.ref);
    console.log('Download URL:', downloadURL);
    
    // Report success
    console.log('✅ TEST SUCCESSFUL: Firebase Storage upload and URL generation worked!');
    console.log('This confirms that your CORS configuration is properly set up.');
    console.log(`File was uploaded to: gs://${firebaseConfig.storageBucket}/${testStoragePath}`);
    
    return {
      success: true,
      path: testStoragePath,
      downloadURL
    };
  } catch (error) {
    console.error('❌ TEST FAILED: Error during Firebase Storage upload test');
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    
    if (error.message && error.message.includes('CORS')) {
      console.error('CORS ERROR: This indicates a CORS configuration issue with Firebase Storage.');
      console.error('Please ensure your Firebase Storage CORS settings include the necessary origins.');
    }
    
    if (error.code === 'storage/unauthorized') {
      console.error('PERMISSION ERROR: Check your Firebase Storage security rules.');
      console.error('Current storage rules may not allow uploads without authentication.');
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the test
testUpload().then(result => {
  console.log('Test completed with result:', result.success ? 'SUCCESS' : 'FAILURE');
  process.exit(result.success ? 0 : 1);
}); 