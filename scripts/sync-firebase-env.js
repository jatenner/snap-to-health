#!/usr/bin/env node

/**
 * Script to sync Firebase environment variables to Vercel
 * This script compares .env.local.firebase with .env.local and identifies mismatches
 * that need to be updated in Vercel.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env.local.firebase
const envPath = path.resolve(process.cwd(), '.env.local.firebase');
const envContent = fs.readFileSync(envPath, 'utf8');
const firebaseEnv = dotenv.parse(envContent);

// Load current environment variables from .env.local for comparison
const currentEnvPath = path.resolve(process.cwd(), '.env.local');
const currentEnvContent = fs.readFileSync(currentEnvPath, 'utf8');
const currentEnv = dotenv.parse(currentEnvContent);

console.log('Firebase Environment Variables Sync Report');
console.log('==========================================');
console.log('Comparing .env.local.firebase with .env.local');
console.log('\n');

// Track mismatches
let mismatches = [];
let matches = [];

// Firebase Client Configuration
const clientVars = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID'
];

clientVars.forEach(key => {
  const firebaseValue = firebaseEnv[key];
  const currentValue = currentEnv[key];
  
  if (firebaseValue !== currentValue) {
    mismatches.push({
      key,
      firebaseValue,
      currentValue
    });
  } else {
    matches.push(key);
  }
});

// Firebase Admin Configuration
const adminVars = [
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_CLIENT_ID',
  'FIREBASE_PRIVATE_KEY_BASE64'
];

adminVars.forEach(key => {
  const firebaseValue = firebaseEnv[key];
  const currentValue = currentEnv[key];
  
  if (firebaseValue !== currentValue) {
    mismatches.push({
      key,
      firebaseValue,
      currentValue
    });
  } else {
    matches.push(key);
  }
});

// Display summary
console.log(`Matching variables: ${matches.length}/${clientVars.length + adminVars.length}`);
console.log(`Mismatched variables: ${mismatches.length}/${clientVars.length + adminVars.length}`);
console.log('\n');

// Display mismatches
if (mismatches.length > 0) {
  console.log('MISMATCHED VARIABLES:');
  console.log('====================');
  
  mismatches.forEach(mismatch => {
    console.log(`Variable: ${mismatch.key}`);
    
    // Mask sensitive values partially (show first 4 and last 4 chars)
    const maskValue = (value) => {
      if (!value) return 'undefined';
      if (value.length <= 8) return value;
      return `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
    };
    
    // For non-sensitive variables, show full values
    const isSensitive = mismatch.key.includes('KEY') || 
                        mismatch.key.includes('PRIVATE') || 
                        mismatch.key.includes('SECRET');
    
    if (isSensitive) {
      console.log(`  .env.local.firebase: ${maskValue(mismatch.firebaseValue)}`);
      console.log(`  .env.local:         ${maskValue(mismatch.currentValue)}`);
    } else {
      console.log(`  .env.local.firebase: ${mismatch.firebaseValue}`);
      console.log(`  .env.local:         ${mismatch.currentValue}`);
    }
    console.log('');
  });
  
  console.log('VERCEL UPDATE COMMANDS:');
  console.log('======================');
  mismatches.forEach(mismatch => {
    console.log(`# Update ${mismatch.key}:`);
    console.log(`vercel env rm ${mismatch.key} production`);
    console.log(`vercel env add ${mismatch.key} production`);
    
    if (mismatch.key === 'FIREBASE_PRIVATE_KEY_BASE64' || mismatch.key.includes('PRIVATE')) {
      console.log(`# Use the value from .env.local.firebase (too long to display here)`);
    } else {
      console.log(`# Use this value: ${mismatch.firebaseValue}`);
    }
    console.log('');
  });
} else {
  console.log('✅ All Firebase environment variables in .env.local match .env.local.firebase!');
  console.log('No updates needed.');
}

console.log('\nNext steps:');
console.log('1. If there are mismatches, update .env.local with values from .env.local.firebase');
console.log('2. Use the Vercel commands above to update environment variables in Vercel');
console.log('3. Deploy with: vercel --prod'); 