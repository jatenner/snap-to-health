#!/usr/bin/env node

/**
 * Script to update Vercel with Firebase environment variables from .env.local
 * This script generates Vercel CLI commands to update Firebase variables.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = dotenv.parse(envContent);

// Firebase environment variables
const firebaseVars = [
  // Firebase Client Configuration
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID',
  
  // Firebase Admin Configuration
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_CLIENT_ID',
  'FIREBASE_PRIVATE_KEY_BASE64'
];

console.log('Vercel Firebase Environment Update Commands');
console.log('==========================================');
console.log('Run these commands to update Firebase variables in Vercel:');
console.log('\n');

// Generate update commands for each Firebase variable
firebaseVars.forEach(key => {
  const value = env[key];
  if (value) {
    console.log(`# Update ${key}:`);
    console.log(`vercel env rm ${key} production`);
    console.log(`vercel env add ${key} production`);
    
    // Special handling for the private key (it's very long)
    if (key === 'FIREBASE_PRIVATE_KEY_BASE64') {
      console.log(`# Use this value (note: it's very long):`);
      console.log(`${value}`);
    } else {
      console.log(`# Use this value: ${value}`);
    }
    console.log('');
  } else {
    console.log(`⚠️ Warning: ${key} not found in .env.local`);
    console.log('');
  }
});

console.log('Once you have updated all environment variables, deploy the application:');
console.log('vercel --prod'); 