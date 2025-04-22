#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });
const dotenv = require('dotenv');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const localEnv = dotenv.parse(envContent);

// List of Firebase-related environment variables to check
const firebaseEnvVars = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_CLIENT_ID',
  'FIREBASE_PRIVATE_KEY_BASE64'
];

console.log('🔍 Checking Firebase configuration...');

// Verify all required Firebase variables exist in .env.local
let missingVars = [];
for (const varName of firebaseEnvVars) {
  if (!localEnv[varName]) {
    missingVars.push(varName);
  }
}

if (missingVars.length > 0) {
  console.error(`❌ Missing Firebase configuration variables in .env.local: ${missingVars.join(', ')}`);
  process.exit(1);
}

console.log('✅ All Firebase environment variables found in .env.local');

// Get current Vercel environment variables
try {
  console.log('📋 Fetching current Vercel environment variables...');
  const vercelEnvOutput = execSync('vercel env pull --yes').toString();
  console.log('✅ Successfully pulled Vercel environment variables');
  
  // Since we can't parse JSON from the output, we'll check .env file directly
  const pulledEnvPath = path.resolve(process.cwd(), '.env');
  let pulledEnv = {};
  
  if (fs.existsSync(pulledEnvPath)) {
    const pulledEnvContent = fs.readFileSync(pulledEnvPath, 'utf8');
    pulledEnv = dotenv.parse(pulledEnvContent);
  }
  
  // Check for Firebase variables that need to be updated or added
  let updatedVars = [];
  
  for (const varName of firebaseEnvVars) {
    if (!pulledEnv[varName]) {
      console.log(`➕ Adding missing Firebase variable to Vercel: ${varName}`);
      
      // Create a temporary file with the value
      const tempFilePath = path.resolve(process.cwd(), `.env-${varName}-temp`);
      fs.writeFileSync(tempFilePath, localEnv[varName]);
      
      try {
        execSync(`vercel env add ${varName} production < ${tempFilePath}`, { stdio: 'inherit' });
        console.log(`✅ Added ${varName} to Vercel`);
        updatedVars.push(varName);
      } catch (err) {
        console.error(`❌ Failed to add ${varName}: ${err.message}`);
      } finally {
        // Clean up temp file
        fs.unlinkSync(tempFilePath);
      }
    } else {
      console.log(`✓ ${varName} already exists in Vercel`);
    }
  }
  
  // If we updated any variables, trigger a deployment
  if (updatedVars.length > 0) {
    console.log(`🚀 Deploying to Vercel to apply changes for: ${updatedVars.join(', ')}`);
    execSync('vercel --prod', { stdio: 'inherit' });
    console.log('✅ Deployment triggered successfully');
  } else {
    console.log('✅ No Firebase configuration changes needed in Vercel');
  }
  
} catch (error) {
  console.error('❌ Failed to check/update Firebase configuration:', error.message);
  process.exit(1);
} 