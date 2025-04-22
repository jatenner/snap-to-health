#!/usr/bin/env node

/**
 * Script to sync all Firebase variables from .env.local to Vercel
 * This script automates the process of adding Firebase variables to Vercel.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { execSync } = require('child_process');

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

console.log('Syncing Firebase Environment Variables to Vercel');
console.log('==============================================');

// Handle each Firebase variable
firebaseVars.forEach(key => {
  const value = env[key];
  if (value) {
    try {
      console.log(`\n📤 Syncing ${key}...`);
      
      // Remove existing variable (if any)
      try {
        console.log(`  - Removing existing variable...`);
        execSync(`vercel env rm ${key} production -y`, { stdio: 'inherit' });
      } catch (e) {
        console.log(`  - No existing variable to remove or error removing.`);
      }
      
      // Add new variable using a temporary file
      console.log(`  - Adding new variable...`);
      
      // Create a temporary file with the variable value
      const tempFileName = `.temp-env-${Date.now()}`;
      fs.writeFileSync(tempFileName, value);
      
      // Add the variable to Vercel
      execSync(`vercel env add ${key} production < ${tempFileName}`, { stdio: 'inherit' });
      
      // Clean up the temporary file
      fs.unlinkSync(tempFileName);
      
      console.log(`✅ Successfully synced ${key}`);
    } catch (error) {
      console.error(`❌ Error syncing ${key}: ${error.message}`);
    }
  } else {
    console.log(`⚠️ Warning: ${key} not found in .env.local, skipping`);
  }
});

console.log('\n🚀 All Firebase variables have been synced to Vercel!');
console.log('To deploy the application, run: vercel --prod'); 