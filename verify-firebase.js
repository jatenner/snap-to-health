#!/usr/bin/env node

// Direct file reading to diagnose environment variable issues
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

console.log('🔍 Verifying Application Configuration...\n');

// Read .env.local file directly
const envPath = path.resolve(process.cwd(), '.env.local');
let envVars = {};

if (fs.existsSync(envPath)) {
  console.log(`Found .env.local file at: ${envPath}`);
  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split('\n');
  
  lines.forEach(line => {
    if (line.trim() && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key) {
        const value = valueParts.join('=');
        envVars[key.trim()] = value.trim();
      }
    }
  });
  console.log(`Loaded ${Object.keys(envVars).length} environment variables from file\n`);
} else {
  console.log(`❌ .env.local file not found at ${envPath}`);
  process.exit(1);
}

// Also load environment variables using dotenv for comparison
require('dotenv').config({ path: '.env.local' });

// Check OpenAI configuration
console.log('OpenAI Configuration:');
const openaiKeys = [
  'OPENAI_API_KEY',
  'OPENAI_MODEL'
];

let openaiConfigValid = true;
openaiKeys.forEach(key => {
  const envValue = process.env[key];
  const fileValue = envVars[key];
  
  if (fileValue) {
    console.log(`✅ ${key} (in file): ${key === 'OPENAI_API_KEY' ? (fileValue.substring(0, 10) + '...') : fileValue}`);
  } else {
    console.log(`❌ ${key} (in file): Not set`);
    if (key === 'OPENAI_API_KEY') {
      openaiConfigValid = false;
    }
  }
  
  if (envValue) {
    console.log(`✅ ${key} (in process.env): ${key === 'OPENAI_API_KEY' ? (envValue.substring(0, 10) + '...') : envValue}`);
  } else {
    console.log(`❌ ${key} (in process.env): Not set`);
    if (key === 'OPENAI_API_KEY') {
      openaiConfigValid = false;
    }
  }
});

if (!openaiConfigValid) {
  console.log('\n⚠️ OpenAI API configuration is incomplete. The OpenAI API key is required.');
} else {
  console.log('\n✅ OpenAI API configuration is complete.');
}

// Check client-side Firebase config
console.log('\nFirebase Client Configuration:');
const clientKeys = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID'
];

let clientConfigValid = true;
clientKeys.forEach(key => {
  const envValue = process.env[key];
  const fileValue = envVars[key];
  
  if (fileValue) {
    console.log(`✅ ${key} (in file): ${key.includes('KEY') ? fileValue.substring(0, 10) + '...' : fileValue}`);
  } else {
    console.log(`❌ ${key} (in file): Not set`);
    clientConfigValid = false;
  }
  
  if (envValue) {
    console.log(`✅ ${key} (in process.env): ${key.includes('KEY') ? envValue.substring(0, 10) + '...' : envValue}`);
  } else {
    console.log(`❌ ${key} (in process.env): Not set`);
    clientConfigValid = false;
  }
});

if (!clientConfigValid) {
  console.log('\n⚠️ Firebase client configuration is incomplete. Please update your .env.local file.');
} else {
  console.log('\n✅ Firebase client configuration is complete.');
}

// Check server-side Firebase Admin config
console.log('\nFirebase Admin Configuration:');
const adminKeys = [
  'FIREBASE_PRIVATE_KEY_BASE64',
  'FIREBASE_CLIENT_EMAIL'
];

let adminConfigValid = true;
adminKeys.forEach(key => {
  const envValue = process.env[key];
  const fileValue = envVars[key];
  
  if (fileValue) {
    console.log(`✅ ${key} (in file): ${key.includes('KEY') ? '********' : fileValue}`);
  } else {
    console.log(`❌ ${key} (in file): Not set`);
    adminConfigValid = false;
  }
  
  if (envValue) {
    console.log(`✅ ${key} (in process.env): ${key.includes('KEY') ? '********' : envValue}`);
  } else {
    console.log(`❌ ${key} (in process.env): Not set`);
    adminConfigValid = false;
  }
});

if (!adminConfigValid) {
  console.log('\n⚠️ Firebase Admin configuration is incomplete. Please update your .env.local file.');
  process.exit(1);
}

console.log('\n🔍 Attempting to initialize Firebase Admin SDK...');

// Decode private key if it exists
let privateKey;
if (process.env.FIREBASE_PRIVATE_KEY_BASE64) {
  try {
    privateKey = Buffer.from(process.env.FIREBASE_PRIVATE_KEY_BASE64, 'base64').toString('utf8');
    console.log('✅ Successfully decoded private key');
    
    // Check if the private key is in the correct format
    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
      console.log('⚠️ Private key does not appear to be in PEM format. It should start with "-----BEGIN PRIVATE KEY-----"');
      adminConfigValid = false;
    }
  } catch (error) {
    console.log(`❌ Failed to decode private key: ${error.message}`);
    adminConfigValid = false;
  }
}

// Try to initialize Firebase Admin
if (adminConfigValid) {
  try {
    let firebaseApp;
    
    // Check if Firebase is already initialized
    try {
      firebaseApp = admin.app();
      console.log('✅ Firebase Admin already initialized');
    } catch (error) {
      // Initialize Firebase Admin
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey
        })
      });
      console.log('✅ Firebase Admin initialized successfully');
    }
    
    // Test Firestore connection
    console.log('\n🔍 Testing Firestore connection...');
    const db = admin.firestore();
    db.collection('_test_connection').doc('test').get()
      .then(() => {
        console.log('✅ Successfully connected to Firestore');
        console.log('\n🎉 Firebase configuration is valid and working!');
        
        // Check other configurations
        let configSummary = [];
        if (openaiConfigValid) {
          configSummary.push('✅ OpenAI API');
        } else {
          configSummary.push('❌ OpenAI API');
        }
        
        configSummary.push('✅ Firebase Client');
        configSummary.push('✅ Firebase Admin');
        
        console.log('\nConfiguration Summary:');
        configSummary.forEach(item => console.log(item));
        
        console.log('\nNext steps:');
        if (!openaiConfigValid) {
          console.log('1. Set up your OpenAI API key in .env.local');
          console.log('   Run: node setup-env.js');
        }
        console.log(`${openaiConfigValid ? '1' : '2'}. Run the application:`);
        console.log(`   npm run dev   # for development`);
        console.log(`   npm run build # for production`);
      })
      .catch(error => {
        console.log(`❌ Failed to connect to Firestore: ${error.message}`);
      });
  } catch (error) {
    console.log(`❌ Failed to initialize Firebase Admin: ${error.message}`);
  }
} else {
  console.log('\n❌ Cannot initialize Firebase Admin due to configuration issues');
} 