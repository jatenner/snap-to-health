#!/usr/bin/env node

/**
 * Check and update Firebase API key in Vercel
 * 
 * This script verifies if the NEXT_PUBLIC_FIREBASE_API_KEY in Vercel
 * matches the local value and updates it if needed.
 */

require('dotenv').config({ path: '.env.local' });
const { execSync } = require('child_process');
const fs = require('fs');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m'
};

// Get local Firebase API key
const localApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

console.log(`${colors.blue}Checking Firebase API Key...${colors.reset}`);
console.log(`Local API Key (.env.local): ${localApiKey}`);

// Also check .env.local.firebase if it exists
try {
  const firebaseEnvContent = fs.readFileSync('.env.local.firebase', 'utf8');
  const firebaseApiKeyMatch = firebaseEnvContent.match(/NEXT_PUBLIC_FIREBASE_API_KEY=([^\r\n]+)/);
  const firebaseApiKey = firebaseApiKeyMatch ? firebaseApiKeyMatch[1] : null;
  
  console.log(`Firebase API Key (.env.local.firebase): ${firebaseApiKey}`);
  
  if (firebaseApiKey && firebaseApiKey !== localApiKey) {
    console.log(`${colors.yellow}Warning: API keys differ between .env.local and .env.local.firebase${colors.reset}`);
    console.log(`${colors.yellow}Please ensure you're using the correct API key for authentication.${colors.reset}`);
  }
} catch (error) {
  console.log(`${colors.yellow}Note: .env.local.firebase not found or couldn't be read.${colors.reset}`);
}

if (!localApiKey) {
  console.log(`${colors.red}Error: NEXT_PUBLIC_FIREBASE_API_KEY is not defined in .env.local${colors.reset}`);
  process.exit(1);
}

// First, remove the existing variable from Vercel
console.log(`\n${colors.yellow}Removing existing API key from Vercel...${colors.reset}`);
try {
  execSync('vercel env rm NEXT_PUBLIC_FIREBASE_API_KEY production -y', { stdio: 'inherit' });
} catch (error) {
  console.log(`${colors.yellow}Warning: Could not remove existing API key. Proceeding with update.${colors.reset}`);
}

// Add the new API key to Vercel
console.log(`\n${colors.blue}Adding updated API key to Vercel...${colors.reset}`);

// Create a temporary file with the API key
const tempFileName = `.temp-api-key-${Date.now()}`;
fs.writeFileSync(tempFileName, localApiKey);

try {
  // Add the variable to Vercel
  execSync(`vercel env add NEXT_PUBLIC_FIREBASE_API_KEY production < ${tempFileName}`, { stdio: 'inherit' });
  console.log(`\n${colors.green}✅ Successfully updated Firebase API key in Vercel.${colors.reset}`);
} catch (error) {
  console.log(`\n${colors.red}❌ Failed to update Firebase API key: ${error.message}${colors.reset}`);
} finally {
  // Clean up the temporary file
  fs.unlinkSync(tempFileName);
}

console.log(`\n${colors.bold}Now redeploy your application:${colors.reset}`);
console.log(`vercel --prod`); 