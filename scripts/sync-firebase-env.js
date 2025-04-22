#!/usr/bin/env node

/**
 * Firebase Environment Variables Verification and Sync
 * 
 * This script:
 * 1. Verifies that Firebase environment variables in .env.local are consistent
 * 2. Generates Vercel CLI commands to sync them
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

// Logging helpers
const log = {
  info: (msg) => console.log(`${colors.blue}ℹ️ ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  header: (msg) => console.log(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}\n`)
};

// Required Firebase environment variables
const FIREBASE_ENV_VARS = [
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

// Load environment variables from .env.local
function loadEnvFile() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    log.error(`${envPath} not found. Please create this file with your Firebase configuration.`);
    process.exit(1);
  }

  const envFile = fs.readFileSync(envPath, 'utf8');
  const envVars = {};

  // Parse env file
  envFile.split('\n').forEach(line => {
    // Skip comments and empty lines
    if (line.startsWith('#') || !line.trim()) return;
    
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length) {
      envVars[key.trim()] = valueParts.join('=').trim();
    }
  });

  return envVars;
}

// Check if environment variables are present
function verifyEnvVars(envVars) {
  log.header('VERIFYING FIREBASE ENVIRONMENT VARIABLES');
  
  const results = {
    present: [],
    missing: [],
    values: {}
  };

  FIREBASE_ENV_VARS.forEach(key => {
    if (envVars[key]) {
      results.present.push(key);
      
      // Store the value (mask sensitive values for logging)
      if (key.includes('KEY') || key.includes('SECRET') || key.includes('PASSWORD') || key.includes('PRIVATE')) {
        const value = envVars[key];
        const maskedValue = value.length > 10 
          ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}`
          : '[MASKED]';
        results.values[key] = { 
          value: envVars[key],
          masked: maskedValue 
        };
        log.success(`${key}: ${maskedValue}`);
      } else {
        results.values[key] = { 
          value: envVars[key],
          masked: envVars[key]
        };
        log.success(`${key}: ${envVars[key]}`);
      }
    } else {
      results.missing.push(key);
      log.error(`${key}: MISSING`);
    }
  });

  return results;
}

// Generate Vercel environment setup commands
function generateVercelCommands(envResults) {
  log.header('VERCEL SYNC COMMANDS');
  
  if (envResults.missing.length > 0) {
    log.error(`Cannot generate Vercel commands - ${envResults.missing.length} environment variables are missing.`);
    return;
  }

  console.log(`# Execute these commands to sync environment variables with Vercel:`);
  console.log(`# If you get 'command not found', install Vercel CLI first: npm i -g vercel\n`);
  
  // Login reminder
  console.log(`# Make sure you're logged in to Vercel:`);
  console.log(`vercel login\n`);
  
  // Generate commands for each environment variable
  console.log(`# Add environment variables (you'll be prompted for values):`);
  Object.keys(envResults.values).forEach(key => {
    console.log(`vercel env add ${key}`);
  });
  
  console.log(`\n# Or use these one-line commands (values included):`);
  Object.keys(envResults.values).forEach(key => {
    // Skip the private key since it's too large for a command line
    if (key === 'FIREBASE_PRIVATE_KEY_BASE64') {
      console.log(`# FIREBASE_PRIVATE_KEY_BASE64 is too large - set it manually in the Vercel dashboard`);
    } else {
      const value = envResults.values[key].value.replace(/"/g, '\\"'); // Escape quotes
      console.log(`vercel env add ${key} "${value}" production`);
    }
  });
  
  // Special instructions for long keys
  console.log(`\n# For FIREBASE_PRIVATE_KEY_BASE64:`);
  console.log(`# 1. Copy the key from .env.local file`);
  console.log(`# 2. Add it manually in the Vercel dashboard under Settings > Environment Variables`);
  
  // Add deployment instructions
  console.log(`\n# After adding all environment variables, deploy to production:`);
  console.log(`vercel --prod`);
}

// Main function
function main() {
  log.header('FIREBASE ENVIRONMENT VERIFICATION AND SYNC');
  
  try {
    // Load environment variables
    const envVars = loadEnvFile();
    
    // Check if variables exist
    const envResults = verifyEnvVars(envVars);
    
    // Print summary
    log.header('SUMMARY');
    log.info(`Found: ${envResults.present.length}/${FIREBASE_ENV_VARS.length} required variables`);
    
    if (envResults.missing.length > 0) {
      log.error(`Missing: ${envResults.missing.join(', ')}`);
      console.log(`\nPlease add the missing environment variables to your .env.local file and run this script again.`);
      process.exit(1);
    } else {
      log.success('All required Firebase environment variables are present!');
      generateVercelCommands(envResults);
    }
  } catch (error) {
    log.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main(); 