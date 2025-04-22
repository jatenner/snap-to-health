#!/usr/bin/env node

/**
 * This script verifies that all sensitive API keys are properly formatted
 * and not accidentally exposed in plaintext or committed to Git.
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { execSync } = require('child_process');

// Load environment variables
const envPath = '.env.local';
dotenv.config({ path: envPath });

console.log('🔍 Verifying API keys and sensitive information...');

// Define the keys that should be checked
const sensitiveKeys = [
  'OPENAI_API_KEY',
  'NUTRITIONIX_API_KEY',
  'NUTRITIONIX_APP_ID',
  'GOOGLE_VISION_PRIVATE_KEY_BASE64',
  'FIREBASE_PRIVATE_KEY_BASE64',
  'VERCEL_OIDC_TOKEN'
];

// Check if .env.local is being tracked by Git
try {
  const gitTracked = execSync('git ls-files --error-unmatch .env.local', { stdio: ['pipe', 'pipe', 'pipe'] });
  console.error('❌ ERROR: .env.local is tracked by Git! This is a security risk.');
  console.error('   Run: git rm --cached .env.local');
  console.error('   Add .env.local to .gitignore if not already there.');
  process.exit(1);
} catch (error) {
  console.log('✅ .env.local is not tracked by Git (good)');
}

// Check if .env.local is in .gitignore
const gitignorePath = path.join(process.cwd(), '.gitignore');
if (fs.existsSync(gitignorePath)) {
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
  if (!gitignoreContent.split('\n').some(line => line.trim() === '.env.local')) {
    console.warn('⚠️ WARNING: .env.local is not explicitly listed in .gitignore');
  } else {
    console.log('✅ .env.local is listed in .gitignore');
  }
} else {
  console.warn('⚠️ WARNING: No .gitignore file found');
}

// Read the actual contents of .env.local to check for placeholders
let envFileContent = '';
try {
  envFileContent = fs.readFileSync(envPath, 'utf8');
} catch (error) {
  console.error(`❌ ERROR: Could not read ${envPath}: ${error.message}`);
  process.exit(1);
}

// Check for placeholders in the file content
const placeholderRegex = /\[(REDACTED|PLACEHOLDER).*\]/i;
let containsPlaceholders = false;

// Check each sensitive key
let hasErrors = false;
let hasPlaceholders = false;

for (const key of sensitiveKeys) {
  // Get value from environment and from file
  const value = process.env[key];
  
  // Directly check the file content for placeholders for this key
  const keyRegex = new RegExp(`${key}=["']?\\[(REDACTED|PLACEHOLDER).*\\]`, 'i');
  const hasPlaceholderInFile = keyRegex.test(envFileContent);
  
  if (hasPlaceholderInFile) {
    console.warn(`⚠️ WARNING: ${key} contains a placeholder value in .env.local file`);
    hasPlaceholders = true;
    continue;
  }
  
  if (!value) {
    console.warn(`⚠️ WARNING: ${key} is not set in the environment`);
    continue;
  }
  
  // Check if value is a placeholder
  if (placeholderRegex.test(value)) {
    console.warn(`⚠️ WARNING: ${key} contains a placeholder value: "${value}"`);
    hasPlaceholders = true;
    continue;
  }
  
  // For OpenAI API keys
  if (key === 'OPENAI_API_KEY') {
    if (!value.startsWith('sk-')) {
      console.error(`❌ ERROR: ${key} does not have the correct format (should start with 'sk-')`);
      hasErrors = true;
    } else {
      console.log(`✅ ${key} appears to be properly formatted`);
    }
  }
  
  // For Base64 encoded keys
  if (key.includes('_BASE64')) {
    try {
      const decoded = Buffer.from(value, 'base64').toString('utf8');
      if (decoded.length < 10) {
        console.error(`❌ ERROR: ${key} does not appear to be properly base64 encoded`);
        hasErrors = true;
      } else {
        console.log(`✅ ${key} is properly base64 encoded`);
      }
    } catch (error) {
      console.error(`❌ ERROR: ${key} is not valid base64: ${error.message}`);
      hasErrors = true;
    }
  }
}

if (hasErrors) {
  console.error('\n❌ There were errors in your environment setup. Please fix them before continuing.');
  process.exit(1);
} else if (hasPlaceholders) {
  console.warn('\n⚠️ Your .env.local file contains placeholder values. This is okay for development or demonstration');
  console.warn('   purposes, but you will need to replace them with real values before deploying or using the application.');
  console.warn('   If this is a production environment, replace the placeholders with actual API keys.');
} else {
  console.log('\n✅ All sensitive environment variables appear to be properly configured!');
  console.log('Note: This script only checks formatting, not validity of API keys.');
} 