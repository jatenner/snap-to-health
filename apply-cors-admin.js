/**
 * apply-cors-admin.js
 * 
 * A script to apply CORS configuration to Firebase Storage bucket
 * using Firebase Admin SDK with service account credentials.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Constants
const PROJECT_ID = 'snaphealth-39b14';
const STORAGE_BUCKET = 'snaphealth-39b14.appspot.com';
const CORS_CONFIG_PATH = path.join(__dirname, 'firebase', 'cors.json');
const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'service-account.json');

console.log('Firebase CORS Configuration Utility');
console.log('===================================');

// Load service account
let serviceAccount;
try {
  console.log(`Loading service account from: ${SERVICE_ACCOUNT_PATH}`);
  serviceAccount = require(SERVICE_ACCOUNT_PATH);
  console.log('Service account loaded successfully');
} catch (error) {
  console.error('Error loading service account:', error.message);
  process.exit(1);
}

// Load CORS configuration
let corsConfig;
try {
  console.log(`Loading CORS configuration from: ${CORS_CONFIG_PATH}`);
  corsConfig = JSON.parse(fs.readFileSync(CORS_CONFIG_PATH, 'utf8'));
  console.log('CORS configuration loaded successfully:');
  console.log(JSON.stringify(corsConfig, null, 2));
} catch (error) {
  console.error('Error loading CORS configuration:', error.message);
  process.exit(1);
}

// Initialize Firebase Admin SDK
try {
  console.log(`Initializing Firebase Admin SDK for project: ${PROJECT_ID}`);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: STORAGE_BUCKET
  });
  console.log('Firebase Admin SDK initialized successfully');
} catch (error) {
  console.error('Error initializing Firebase Admin SDK:', error.message);
  process.exit(1);
}

// Get a reference to the storage bucket
const bucket = admin.storage().bucket();
console.log(`Getting reference to storage bucket: ${STORAGE_BUCKET}`);

// Apply CORS configuration
console.log('Applying CORS configuration...');
bucket.setCorsConfiguration(corsConfig)
  .then(() => {
    console.log('✅ CORS configuration applied successfully!');
    
    // Verify the configuration
    console.log('Retrieving current CORS configuration to verify...');
    return bucket.getCorsConfiguration();
  })
  .then((config) => {
    console.log('Current CORS configuration:');
    console.log(JSON.stringify(config, null, 2));
    
    console.log('\n✅ CORS configuration has been updated to allow access from:');
    config[0].origin.forEach(origin => {
      console.log(`  - ${origin}`);
    });
    
    console.log('\nMethods allowed:');
    config[0].method.forEach(method => {
      console.log(`  - ${method}`);
    });
    
    console.log('\nResponse headers:');
    config[0].responseHeader.forEach(header => {
      console.log(`  - ${header}`);
    });
    
    console.log('\nConfiguration successfully applied and verified!');
    console.log('You can now use the application on both localhost:3000 and localhost:3009');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error applying CORS configuration:', error);
    console.error('\nTroubleshooting tips:');
    console.error('1. Verify your service account has correct permissions for Cloud Storage');
    console.error('2. Make sure your storage bucket name is correct');
    console.error('3. Check for network connectivity issues');
    process.exit(1);
  }); 