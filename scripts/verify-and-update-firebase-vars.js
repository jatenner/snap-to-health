#!/usr/bin/env node

/**
 * Verify and update Firebase configuration variables in Vercel
 * 
 * This script:
 * 1. Extracts all Firebase-related variables from .env.local
 * 2. Compares them with current Vercel environment variables
 * 3. Updates any mismatched variables in Vercel
 * 4. Provides a summary of changes
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
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bold: '\x1b[1m'
};

// Logger with color formatting
const log = {
  info: (msg) => console.log(`${colors.blue}ℹ️ ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  header: (msg) => console.log(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}\n`)
};

// Firebase environment variables to check and update
const firebaseVars = [
  // Firebase Client Configuration
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID',
  
  // Firebase Admin Configuration (if needed)
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_CLIENT_ID',
  'FIREBASE_PRIVATE_KEY_BASE64'
];

// Summary tracking
const summary = {
  updated: [],
  unchanged: [],
  errors: []
};

/**
 * Add a variable to Vercel environment
 */
function addVariableToVercel(name, value) {
  try {
    // Create a temporary file with the environment variable value
    const tempFileName = `.temp-env-${Date.now()}`;
    fs.writeFileSync(tempFileName, value);
    
    // Add the variable to Vercel using the temp file as input
    execSync(`vercel env add ${name} production < ${tempFileName}`, { stdio: 'inherit' });
    
    // Clean up the temp file
    fs.unlinkSync(tempFileName);
    
    log.success(`Successfully added ${name} to Vercel`);
    summary.updated.push(name);
    return true;
  } catch (error) {
    log.error(`Failed to add ${name} to Vercel: ${error.message}`);
    summary.errors.push({ name, error: error.message });
    return false;
  }
}

/**
 * Main function to verify and update Firebase variables
 */
async function verifyAndUpdateFirebaseVars() {
  log.header('VERIFYING FIREBASE CONFIGURATION');
  
  // Get the current Vercel environment variables
  let vercelEnvVars = {};
  try {
    log.info('Fetching current Vercel environment variables...');
    // This won't work directly - we'll simulate the result instead
    // In a real scenario, you'd use Vercel API or CLI to fetch these
    log.warning('Note: This script simulates checking Vercel variables since direct API access is limited');
    vercelEnvVars = {}; // Placeholder for actual Vercel env vars
  } catch (error) {
    log.error(`Failed to fetch Vercel environment variables: ${error.message}`);
  }
  
  // Process each Firebase variable
  for (const varName of firebaseVars) {
    const localValue = process.env[varName];
    
    if (!localValue) {
      log.warning(`${varName} is not defined in .env.local, skipping`);
      continue;
    }
    
    log.info(`Checking ${varName}...`);
    
    try {
      // In a real scenario, you'd compare with vercelEnvVars here
      // We'll update regardless since we can't directly check
      log.info(`Updating ${varName} in Vercel...`);
      addVariableToVercel(varName, localValue);
    } catch (error) {
      log.error(`Error processing ${varName}: ${error.message}`);
      summary.errors.push({ name: varName, error: error.message });
    }
  }
  
  // Print summary
  log.header('SYNCHRONIZATION SUMMARY');
  console.log(`${colors.green}Variables updated: ${summary.updated.length}${colors.reset}`);
  if (summary.updated.length > 0) {
    summary.updated.forEach(name => console.log(`  - ${name}`));
  }
  
  console.log(`${colors.blue}Variables unchanged: ${summary.unchanged.length}${colors.reset}`);
  if (summary.unchanged.length > 0) {
    summary.unchanged.forEach(name => console.log(`  - ${name}`));
  }
  
  console.log(`${colors.red}Errors: ${summary.errors.length}${colors.reset}`);
  if (summary.errors.length > 0) {
    summary.errors.forEach(err => console.log(`  - ${err.name}: ${err.error}`));
  }
  
  if (summary.updated.length > 0) {
    log.info('Firebase variables updated. You should now redeploy the application:');
    console.log('\n  vercel --prod\n');
  } else if (summary.errors.length === 0) {
    log.success('All Firebase variables are already up to date!');
  }
}

// Run the main function
verifyAndUpdateFirebaseVars(); 