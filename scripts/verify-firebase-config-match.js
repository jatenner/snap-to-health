#!/usr/bin/env node

/**
 * Verify Firebase Configuration Variables
 * 
 * This script checks that Firebase configuration is correctly set up in .env.local,
 * and creates a summary report of the configuration state.
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');

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

// Logger with color formatting
const log = {
  info: (msg) => console.log(`${colors.blue}ℹ️ ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  header: (msg) => console.log(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}\n`)
};

// Required Firebase environment variables
const requiredVars = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID'
];

// Optional Firebase environment variables
const optionalVars = [
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_CLIENT_ID',
  'FIREBASE_PRIVATE_KEY_BASE64'
];

// Results
const results = {
  present: [],
  missing: [],
  issues: []
};

/**
 * Validate a Firebase API key
 */
function validateApiKey(apiKey) {
  // Basic validation: Firebase API keys typically start with AIza
  if (!apiKey || typeof apiKey !== 'string') return false;
  return apiKey.startsWith('AIza') && apiKey.length > 20;
}

/**
 * Validate basic Firebase configuration
 */
function validateBasicConfig() {
  log.header('VALIDATING FIREBASE CONFIGURATION');
  
  // Check each required variable
  for (const varName of requiredVars) {
    const value = process.env[varName];
    
    if (!value) {
      log.error(`Missing required variable: ${varName}`);
      results.missing.push(varName);
    } else {
      log.success(`Found ${varName}`);
      results.present.push(varName);
      
      // Special validation for API key
      if (varName === 'NEXT_PUBLIC_FIREBASE_API_KEY') {
        if (validateApiKey(value)) {
          log.success(`API key appears valid: ${value.substring(0, 8)}...`);
        } else {
          log.error(`API key appears invalid: ${value.substring(0, 8)}...`);
          results.issues.push(`Invalid API key format: ${varName}`);
        }
      }
    }
  }
  
  // Check optional variables
  for (const varName of optionalVars) {
    const value = process.env[varName];
    
    if (!value) {
      log.warning(`Missing optional variable: ${varName}`);
    } else {
      log.success(`Found optional variable: ${varName}`);
      results.present.push(varName);
    }
  }
}

/**
 * Check if config in .env.local and .env.local.firebase match
 */
function checkConfigConsistency() {
  log.header('CHECKING CONFIGURATION CONSISTENCY');
  
  try {
    // Check if .env.local.firebase exists
    if (!fs.existsSync('.env.local.firebase')) {
      log.warning('.env.local.firebase not found, skipping consistency check');
      return;
    }
    
    const firebaseEnvContent = fs.readFileSync('.env.local.firebase', 'utf8');
    const envLocalContent = fs.readFileSync('.env.local', 'utf8');
    
    // Check each required variable for consistency
    for (const varName of requiredVars) {
      const varRegex = new RegExp(`${varName}=([^\\r\\n]+)`);
      
      const matchEnvLocal = envLocalContent.match(varRegex);
      const matchFirebaseEnv = firebaseEnvContent.match(varRegex);
      
      const valueEnvLocal = matchEnvLocal ? matchEnvLocal[1] : null;
      const valueFirebaseEnv = matchFirebaseEnv ? matchFirebaseEnv[1] : null;
      
      if (valueEnvLocal && valueFirebaseEnv) {
        if (valueEnvLocal === valueFirebaseEnv) {
          log.success(`${varName} matches between .env.local and .env.local.firebase`);
        } else {
          log.error(`${varName} differs between .env.local and .env.local.firebase`);
          results.issues.push(`Inconsistent ${varName} between environment files`);
        }
      } else if (valueEnvLocal && !valueFirebaseEnv) {
        log.warning(`${varName} exists in .env.local but not in .env.local.firebase`);
      } else if (!valueEnvLocal && valueFirebaseEnv) {
        log.warning(`${varName} exists in .env.local.firebase but not in .env.local`);
      }
    }
    
  } catch (error) {
    log.error(`Error checking configuration consistency: ${error.message}`);
    results.issues.push(`Config consistency check failed: ${error.message}`);
  }
}

/**
 * Print a summary of the validation results
 */
function printSummary() {
  log.header('FIREBASE CONFIGURATION SUMMARY');
  
  console.log(`${colors.green}Present variables: ${results.present.length}${colors.reset}`);
  console.log(`${colors.red}Missing variables: ${results.missing.length}${colors.reset}`);
  console.log(`${colors.yellow}Issues: ${results.issues.length}${colors.reset}`);
  
  if (results.issues.length > 0) {
    console.log('\nIssues:');
    results.issues.forEach((issue, index) => {
      console.log(`  ${index + 1}. ${issue}`);
    });
  }
  
  // Overall status
  if (results.missing.length === 0 && results.issues.length === 0) {
    log.success('\nFirebase configuration appears valid ✅');
    console.log('\nAuthentication and analytics should work correctly.');
  } else if (results.missing.length > 0) {
    log.error('\nFirebase configuration is incomplete ❌');
    console.log('\nAuthentication and analytics may not work due to missing variables.');
  } else if (results.issues.length > 0) {
    log.warning('\nFirebase configuration has potential issues ⚠️');
    console.log('\nAuthentication and analytics may have problems.');
  }
}

// Main function
function verifyFirebaseConfig() {
  console.log(`${colors.bold}${colors.cyan}Firebase Configuration Verification${colors.reset}\n`);
  
  validateBasicConfig();
  checkConfigConsistency();
  printSummary();
}

// Run the verification
verifyFirebaseConfig(); 