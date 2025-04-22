#!/usr/bin/env node

/**
 * Update all Firebase environment variables in Vercel
 * 
 * This script updates all Firebase-related environment variables in Vercel
 * to match those in .env.local.
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
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

// Logger functions
const log = {
  info: (msg) => console.log(`${colors.blue}ℹ️ ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  header: (msg) => console.log(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}\n`)
};

// Firebase variables to update
const firebaseVars = [
  // Firebase Client Configuration
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID',
  
  // Optional: Firebase Admin Configuration if needed for authentication
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_CLIENT_ID',
  'FIREBASE_PRIVATE_KEY_BASE64'
];

// Track results
const results = {
  updated: [],
  failed: [],
  skipped: []
};

/**
 * Update a single environment variable in Vercel
 */
function updateVariable(name) {
  const value = process.env[name];
  
  if (!value) {
    log.warning(`Variable ${name} not found in .env.local, skipping`);
    results.skipped.push(name);
    return;
  }
  
  log.info(`Updating ${name}...`);
  
  // Create a temporary file for the value
  const tempFileName = `.temp-env-${Date.now()}-${name}`;
  fs.writeFileSync(tempFileName, value);
  
  try {
    // First try to remove the existing variable
    try {
      execSync(`vercel env rm ${name} production -y`, { stdio: 'inherit' });
    } catch (error) {
      log.warning(`Could not remove existing variable ${name}. Continuing with update.`);
    }
    
    // Add the variable to Vercel
    execSync(`vercel env add ${name} production < ${tempFileName}`, { stdio: 'inherit' });
    log.success(`Updated ${name} in Vercel`);
    results.updated.push(name);
  } catch (error) {
    log.error(`Failed to update ${name}: ${error.message}`);
    results.failed.push({ name, error: error.message });
  } finally {
    // Clean up the temporary file
    fs.unlinkSync(tempFileName);
  }
}

// Main function to update all variables
async function updateAllVariables() {
  log.header('UPDATING FIREBASE ENVIRONMENT VARIABLES IN VERCEL');
  
  // Update each variable
  for (const varName of firebaseVars) {
    updateVariable(varName);
  }
  
  // Print summary
  log.header('UPDATE SUMMARY');
  
  console.log(`${colors.green}Variables updated: ${results.updated.length}${colors.reset}`);
  if (results.updated.length > 0) {
    results.updated.forEach(name => console.log(`  - ${name}`));
  }
  
  console.log(`${colors.yellow}Variables skipped: ${results.skipped.length}${colors.reset}`);
  if (results.skipped.length > 0) {
    results.skipped.forEach(name => console.log(`  - ${name}`));
  }
  
  console.log(`${colors.red}Variables failed: ${results.failed.length}${colors.reset}`);
  if (results.failed.length > 0) {
    results.failed.forEach(item => console.log(`  - ${item.name}: ${item.error}`));
  }
  
  if (results.updated.length > 0) {
    log.info('Firebase environment variables updated. You should now redeploy your application:');
    console.log(`\n  vercel --prod\n`);
  }
}

// Run the main function
updateAllVariables(); 