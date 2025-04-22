#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const envPath = path.resolve(process.cwd(), '.env.local');

// Define required environment variables with default values
const requiredEnvVars = {
  // OpenAI
  'OPENAI_API_KEY': '', // No default, must be provided
  'OPENAI_MODEL': '"gpt-4o"',
  
  // Firebase Client (Public)
  'NEXT_PUBLIC_FIREBASE_API_KEY': 'AIzaSyAUvJPkN2H44CCayUX9S2QEr268hykmXKc',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN': 'snaphealth-39b14.firebaseapp.com',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID': 'snaphealth-39b14',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET': 'snaphealth-39b14.appspot.com',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID': '740672895155',
  'NEXT_PUBLIC_FIREBASE_APP_ID': '1:740672895155:web:f088e585daca6460e9d8c6',
  'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID': 'G-HXH2KSSJPQ',
  
  // Firebase Admin (Private)
  'FIREBASE_PRIVATE_KEY_BASE64': '', // No default, must be provided
  'FIREBASE_CLIENT_EMAIL': '', // No default, must be provided
  
  // Nutritionix (Optional)
  'NUTRITIONIX_API_KEY': '',
  'NUTRITIONIX_APP_ID': ''
};

// Read existing environment variables
let existingEnvVars = {};
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split('\n');
  
  lines.forEach(line => {
    if (line.trim() && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=');
      existingEnvVars[key] = value;
    }
  });
  
  console.log('Existing .env.local file found.');
} else {
  console.log('No existing .env.local file found. Creating new file.');
}

// Merge existing and required variables, keeping existing values
const mergedEnvVars = { ...requiredEnvVars, ...existingEnvVars };

// Create output content
let outputContent = '# Environment Variables for SnapHealth\n';
outputContent += '# Last updated: ' + new Date().toISOString() + '\n\n';

// Group variables by section
outputContent += '# OpenAI Configuration\n';
outputContent += `OPENAI_API_KEY=${mergedEnvVars['OPENAI_API_KEY']}\n`;
outputContent += `OPENAI_MODEL=${mergedEnvVars['OPENAI_MODEL']}\n\n`;

outputContent += '# Firebase Client Configuration (Public)\n';
outputContent += `NEXT_PUBLIC_FIREBASE_API_KEY=${mergedEnvVars['NEXT_PUBLIC_FIREBASE_API_KEY']}\n`;
outputContent += `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${mergedEnvVars['NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN']}\n`;
outputContent += `NEXT_PUBLIC_FIREBASE_PROJECT_ID=${mergedEnvVars['NEXT_PUBLIC_FIREBASE_PROJECT_ID']}\n`;
outputContent += `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${mergedEnvVars['NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET']}\n`;
outputContent += `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${mergedEnvVars['NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID']}\n`;
outputContent += `NEXT_PUBLIC_FIREBASE_APP_ID=${mergedEnvVars['NEXT_PUBLIC_FIREBASE_APP_ID']}\n`;
outputContent += `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=${mergedEnvVars['NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID']}\n\n`;

outputContent += '# Firebase Admin Configuration (Private)\n';
outputContent += `FIREBASE_PRIVATE_KEY_BASE64=${mergedEnvVars['FIREBASE_PRIVATE_KEY_BASE64']}\n`;
outputContent += `FIREBASE_CLIENT_EMAIL=${mergedEnvVars['FIREBASE_CLIENT_EMAIL']}\n\n`;

outputContent += '# Nutritionix API (Optional)\n';
outputContent += `NUTRITIONIX_API_KEY=${mergedEnvVars['NUTRITIONIX_API_KEY']}\n`;
outputContent += `NUTRITIONIX_APP_ID=${mergedEnvVars['NUTRITIONIX_APP_ID']}\n`;

// Add any other existing variables not in our required list
for (const [key, value] of Object.entries(existingEnvVars)) {
  if (!requiredEnvVars.hasOwnProperty(key)) {
    outputContent += `${key}=${value}\n`;
  }
}

// Write to .env.local file
fs.writeFileSync(envPath, outputContent);

console.log('\n✅ Environment file updated successfully!');
console.log(`File saved to: ${envPath}`);

// Identify missing required keys
const missingKeys = [];
for (const [key, value] of Object.entries(requiredEnvVars)) {
  if (!mergedEnvVars[key] && key !== 'NUTRITIONIX_API_KEY' && key !== 'NUTRITIONIX_APP_ID') {
    missingKeys.push(key);
  }
}

if (missingKeys.length > 0) {
  console.log('\n⚠️ Warning: The following required keys are missing or empty:');
  missingKeys.forEach(key => console.log(`   - ${key}`));
  console.log('\nPlease make sure to set these variables before running the application.');
} else {
  console.log('\n✅ All required environment variables are set!');
}

// Show instructions on what to do next
console.log('\nNext steps:');
console.log(' 1. Make sure all required environment variables are set');
console.log(' 2. Run "npm run dev" to start the development server');
console.log(' 3. Run "npm run build" to verify the production build\n'); 