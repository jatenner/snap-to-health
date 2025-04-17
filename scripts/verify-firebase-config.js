#!/usr/bin/env node

/**
 * Firebase Configuration Verification Script
 * 
 * This script checks that your Firebase configuration is properly set up
 * by examining environment variables and attempting key validation.
 */

require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

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

// Color-coded logging functions
const log = {
  info: (msg) => console.log(`${colors.blue}ℹ️ ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  header: (msg) => console.log(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}\n`)
};

// Required Firebase environment variables
const requiredVars = [
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY_BASE64',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET'
];

// Optional but recommended Firebase environment variables
const optionalVars = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID'
];

/**
 * Validate a base64 encoded string
 */
function validateBase64(str) {
  if (!str) return false;
  // Check if it's a valid base64 format with standard character set
  return /^[A-Za-z0-9+/=]+$/.test(str);
}

/**
 * Safely decode a base64 string and check if it looks like a private key
 */
function validatePrivateKeyFormat(base64Str) {
  try {
    if (!base64Str) return { valid: false, reason: 'Empty key string' };
    
    // Attempt to decode
    const decoded = Buffer.from(base64Str, 'base64').toString('utf8');
    
    // Check for common PEM format indicators
    const hasPemHeader = decoded.includes('-----BEGIN PRIVATE KEY-----');
    const hasPemFooter = decoded.includes('-----END PRIVATE KEY-----');
    const hasNewlines = decoded.includes('\n');
    
    // PEM format validation
    if (!hasPemHeader || !hasPemFooter) {
      return { 
        valid: false, 
        reason: 'Decoded string is not in PEM format',
        details: {
          hasPemHeader,
          hasPemFooter
        }
      };
    }
    
    // Length check - private keys should be reasonably long
    if (decoded.length < 1000) {
      return { 
        valid: false, 
        reason: 'Decoded private key appears too short',
        length: decoded.length
      };
    }
    
    return { 
      valid: true,
      details: {
        format: 'PEM',
        hasNewlines,
        length: decoded.length
      }
    };
  } catch (error) {
    return { 
      valid: false, 
      reason: `Decoding error: ${error.message}` 
    };
  }
}

/**
 * Validate all required environment variables
 */
function checkEnvironmentVariables() {
  log.header('CHECKING FIREBASE ENVIRONMENT VARIABLES');
  
  let missingRequired = [];
  let missingOptional = [];
  let present = [];
  
  // Check required variables
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missingRequired.push(varName);
      log.error(`Missing required variable: ${varName}`);
    } else {
      present.push(varName);
      log.success(`Found ${varName}`);
    }
  }
  
  // Check optional variables
  for (const varName of optionalVars) {
    if (!process.env[varName]) {
      missingOptional.push(varName);
      log.warning(`Missing optional variable: ${varName}`);
    } else {
      present.push(varName);
      log.success(`Found ${varName}`);
    }
  }
  
  return {
    allRequiredPresent: missingRequired.length === 0,
    missingRequired,
    missingOptional,
    present
  };
}

/**
 * Validate the Firebase private key specifically
 */
function validateFirebasePrivateKey() {
  log.header('VALIDATING FIREBASE PRIVATE KEY');
  
  const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
  
  if (!privateKeyBase64) {
    log.error('FIREBASE_PRIVATE_KEY_BASE64 is not set');
    return { valid: false };
  }
  
  // Check if it's a valid base64 format
  if (!validateBase64(privateKeyBase64)) {
    log.error('FIREBASE_PRIVATE_KEY_BASE64 is not valid base64 format');
    return { valid: false, reason: 'Invalid base64 format' };
  }
  
  log.success('Private key is valid base64 format');
  log.info(`Private key length: ${privateKeyBase64.length} characters`);
  
  // Validate the decoded content
  const validationResult = validatePrivateKeyFormat(privateKeyBase64);
  
  if (validationResult.valid) {
    log.success('Private key decoded successfully and appears to be in valid PEM format');
    return { valid: true };
  } else {
    log.error(`Private key validation failed: ${validationResult.reason}`);
    return { valid: false, details: validationResult };
  }
}

/**
 * Main verification function
 */
function verifyFirebaseConfiguration() {
  console.log(`${colors.magenta}${colors.bold}Firebase Configuration Verification${colors.reset}\n`);
  
  // Step 1: Check environment variables
  const envCheckResult = checkEnvironmentVariables();
  
  if (!envCheckResult.allRequiredPresent) {
    log.error('Missing required environment variables. Cannot proceed with verification.');
    process.exit(1);
  }
  
  // Step 2: Validate private key
  const keyValidationResult = validateFirebasePrivateKey();
  
  if (!keyValidationResult.valid) {
    log.error('Firebase private key validation failed');
    process.exit(1);
  }
  
  // Final report
  log.header('VERIFICATION SUMMARY');
  
  if (envCheckResult.allRequiredPresent && keyValidationResult.valid) {
    log.success('Firebase configuration appears valid and correctly formatted');
    log.info('You should now be able to initialize Firebase Admin SDK successfully');
  } else {
    log.error('Firebase configuration is incomplete or invalid');
    
    if (envCheckResult.missingRequired.length > 0) {
      log.error(`Missing required variables: ${envCheckResult.missingRequired.join(', ')}`);
    }
    
    if (!keyValidationResult.valid) {
      log.error('Private key validation failed. Check the format and encoding');
    }
  }
}

// Run the verification
verifyFirebaseConfiguration(); 