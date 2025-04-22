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
dotenv.config({ path: '.env.local' });

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

// Check each sensitive key
let hasErrors = false;
for (const key of sensitiveKeys) {
  const value = process.env[key];
  
  if (!value) {
    console.warn(`⚠️ WARNING: ${key} is not set`);
    continue;
  }
  
  // Check if value is a placeholder
  if (value.includes('[REDACTED') || value.includes('PLACEHOLDER')) {
    console.error(`❌ ERROR: ${key} contains a placeholder value: "${value}"`);
    hasErrors = true;
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
} else {
  console.log('\n✅ All sensitive environment variables appear to be properly configured!');
  console.log('Note: This script only checks formatting, not validity of API keys.');
} 