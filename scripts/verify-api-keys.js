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
let envExists = false;

// Check if .env.local exists
try {
  fs.accessSync(envPath, fs.constants.F_OK);
  envExists = true;
  dotenv.config({ path: envPath });
  console.log('🔍 Verifying API keys and sensitive information...');
} catch (error) {
  console.warn(`⚠️ WARNING: ${envPath} file not found. Creating a template...`);
  
  // Create a template .env.local file
  const templateContent = `# Environment Variables - IMPORTANT: Replace all [REDACTED_*] values with actual API keys
# OpenAI Configuration
OPENAI_API_KEY="[REDACTED_OPENAI_API_KEY]"
OPENAI_MODEL="gpt-4o"

# Nutritionix API (for food database queries)
NUTRITIONIX_API_KEY="[REDACTED_NUTRITIONIX_API_KEY]"
NUTRITIONIX_APP_ID="[REDACTED_NUTRITIONIX_APP_ID]"

# OCR Configuration
OCR_PROVIDER="google-vision"
OCR_CONFIDENCE_THRESHOLD="0.7"
USE_OCR_EXTRACTION="true"

# Google Vision API for OCR
GOOGLE_APPLICATION_CREDENTIALS="./keys/snaphealth-39b14-3f3253d44b6c.json"
GOOGLE_VISION_PRIVATE_KEY_BASE64="[REDACTED_GOOGLE_VISION_KEY]"

# Firebase Configuration - Client (public)
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyAUvJPkN2H44CCayUX9S2QEr268hykmXKc
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=snaphealth-39b14.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=snaphealth-39b14
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=snaphealth-39b14.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=740672895155
NEXT_PUBLIC_FIREBASE_APP_ID=1:740672895155:web:f088e585daca6460e9d8c6
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-HXH2KSSJPQ

# Firebase Configuration - Server (private)
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@snaphealth-39b14.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=115934821794605256140
FIREBASE_PRIVATE_KEY_BASE64="[REDACTED_FIREBASE_PRIVATE_KEY]"

# Vercel Configuration
NEXT_PUBLIC_VERCEL_URL="snap-to-health-kcj35mgim-jonah-tenner-s-projects.vercel.app"
VERCEL="1"
VERCEL_OIDC_TOKEN="[REDACTED_VERCEL_OIDC_TOKEN]"

# Feature Flags
USE_GPT4_VISION="true"
`;

  try {
    fs.writeFileSync(envPath, templateContent);
    console.log(`✅ Created template ${envPath} file. Please edit it to add your actual API keys.`);
    console.log('   Then run this script again to verify the keys.');
    process.exit(0);
  } catch (writeError) {
    console.error(`❌ ERROR: Could not create ${envPath} template: ${writeError.message}`);
    process.exit(1);
  }
}

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

// Define the keys that should be checked
const sensitiveKeys = [
  'OPENAI_API_KEY',
  'NUTRITIONIX_API_KEY',
  'NUTRITIONIX_APP_ID',
  'GOOGLE_VISION_PRIVATE_KEY_BASE64',
  'FIREBASE_PRIVATE_KEY_BASE64',
  'VERCEL_OIDC_TOKEN'
];

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