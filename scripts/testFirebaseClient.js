/**
 * Script to test Firebase client-side initialization
 * This is a server-side script that checks if the environment variables needed 
 * for client-side Firebase are correctly configured.
 * 
 * Run with: node scripts/testFirebaseClient.js
 */

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

// Function to validate environment variables
function checkClientEnvironmentVars() {
  console.log('\n🔍 Checking Firebase client environment variables...');
  
  const requiredVars = [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'NEXT_PUBLIC_FIREBASE_APP_ID'
  ];
  
  const optionalVars = [
    'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID'
  ];
  
  const missingVars = [];
  const configuredVars = {};
  
  // Check required vars
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
  
  // Check optional vars
  for (const varName of optionalVars) {
    const value = process.env[varName];
    if (value) {
      configuredVars[varName] = value;
    }
  }
  
  // Report results
  if (missingVars.length > 0) {
    console.error(`❌ Missing required client environment variables: ${missingVars.join(', ')}`);
    return false;
  }
  
  console.log('✅ All required client environment variables are present:');
  Object.entries(configuredVars).forEach(([key, value]) => {
    console.log(`   - ${key}: ${value}`);
  });
  
  return true;
}

// Full validation of Firebase client configuration
function validateClientConfig() {
  console.log('\n🔍 Validating Firebase client configuration...');
  
  // Check environment variables first
  if (!checkClientEnvironmentVars()) {
    return false;
  }
  
  // Create a "mock" Firebase config to validate
  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  };
  
  // Validate auth domain format
  if (!firebaseConfig.authDomain.includes('.firebaseapp.com')) {
    console.warn(`⚠️ Auth domain ${firebaseConfig.authDomain} doesn't match the expected format of <project-id>.firebaseapp.com`);
  }
  
  // Validate storage bucket format
  if (!firebaseConfig.storageBucket.includes('.appspot.com') && 
      !firebaseConfig.storageBucket.includes('.firebasestorage.googleapis.com')) {
    console.warn(`⚠️ Storage bucket ${firebaseConfig.storageBucket} doesn't match the expected format`);
  }
  
  // Validate app ID format
  if (!firebaseConfig.appId.includes(':')) {
    console.warn(`⚠️ App ID format seems incorrect - should contain colons`);
  }
  
  console.log('✅ Firebase client configuration validated');
  return true;
}

// Test overall Firebase configuration
function testFirebaseConfig() {
  console.log('🔥 Testing Firebase Configuration');
  console.log('===============================');
  
  // Check client environment variables
  const clientValid = validateClientConfig();
  
  // Provide summary
  console.log('\n📋 Summary:');
  console.log(`   - Client config: ${clientValid ? '✅ Valid' : '❌ Invalid'}`);
  
  // Return overall success
  return clientValid;
}

// Run the test
const success = testFirebaseConfig();

console.log('\n===============================');
if (success) {
  console.log('✅ All Firebase configuration tests passed!');
  console.log('   Your app should be able to initialize Firebase client correctly.');
  console.log('   To verify client operation in the browser, visit:');
  console.log('   http://localhost:3000/debug/firebase-client-check');
} else {
  console.log('❌ Some Firebase configuration tests failed.');
  console.log('   Please fix the issues above before continuing.');
} 