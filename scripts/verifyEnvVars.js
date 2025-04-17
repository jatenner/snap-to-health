/**
 * Script to verify Firebase environment variables in .env files
 * Run with: node scripts/verifyEnvVars.js
 */

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Check Firebase client environment variables
console.log('🔍 Checking Firebase client environment variables');
console.log('==============================================');

const requiredEnvVars = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID'
];

const optionalEnvVars = [
  'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID'
];

// Check and display the required environment variables
let missingRequired = false;
console.log('\nRequired Environment Variables:');
console.log('-----------------------------');
requiredEnvVars.forEach(envVar => {
  const value = process.env[envVar];
  if (!value) {
    console.log(`❌ ${envVar}: MISSING`);
    missingRequired = true;
  } else {
    // Mask API key for security
    if (envVar === 'NEXT_PUBLIC_FIREBASE_API_KEY') {
      console.log(`✅ ${envVar}: ${value.substring(0, 6)}...${value.substring(value.length - 4)}`);
    } else {
      console.log(`✅ ${envVar}: ${value}`);
    }
  }
});

// Check and display the optional environment variables
console.log('\nOptional Environment Variables:');
console.log('-----------------------------');
optionalEnvVars.forEach(envVar => {
  const value = process.env[envVar];
  if (!value) {
    console.log(`⚠️ ${envVar}: MISSING (optional)`);
  } else {
    console.log(`✅ ${envVar}: ${value}`);
  }
});

// Show summary
console.log('\nEnvironment Variable Check Summary:');
console.log('----------------------------------');

if (missingRequired) {
  console.error('❌ FAILED: Missing required environment variables');
  console.error('   Please update your .env.local file or Vercel environment variables');
} else {
  console.log('✅ SUCCESS: All required environment variables are set');
}

// Check for API Key validity
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
if (apiKey) {
  // Basic format check for Firebase API keys
  if (apiKey.startsWith('AIza') && apiKey.length > 30) {
    console.log('✅ API Key appears to be in the correct format');
  } else {
    console.error('❌ API Key does not match expected format (should start with "AIza" and be ~39 chars)');
  }
}

// Create mock Firebase config
console.log('\nFirebase Configuration Object:');
console.log('-----------------------------');
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Display config (masking API key)
const configForDisplay = {
  ...firebaseConfig,
  apiKey: firebaseConfig.apiKey ? `${firebaseConfig.apiKey.substring(0, 6)}...` : undefined
};
console.log(JSON.stringify(configForDisplay, null, 2));

console.log('\n✅ Verification complete');
console.log('Run this script in your deployment environment to verify variables are set correctly'); 