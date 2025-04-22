#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const dotenv = require('dotenv');

console.log('🚀 Starting Vercel environment update process...');

// Load environment variables from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = dotenv.parse(envContent);

// Critical environment variables that often cause 401 errors
const criticalVars = [
  'OPENAI_API_KEY',
  'FIREBASE_PRIVATE_KEY_BASE64',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_CLIENT_ID',
  'NUTRITIONIX_API_KEY',
  'NUTRITIONIX_APP_ID'
];

console.log('🔑 Updating critical API keys and credentials...');

// Update each critical environment variable
for (const key of criticalVars) {
  if (!env[key]) {
    console.log(`⚠️ ${key} not found in .env.local, skipping...`);
    continue;
  }
  
  console.log(`📝 Updating ${key}...`);
  
  try {
    // Write value to a temporary file to avoid command line length issues and special character problems
    const tempFile = path.join(process.cwd(), `temp-${key}.txt`);
    fs.writeFileSync(tempFile, env[key]);
    
    // Execute vercel env rm first to remove existing variable
    try {
      execSync(`vercel env rm ${key} --yes`, { stdio: 'inherit' });
    } catch (error) {
      // Ignore errors if the variable doesn't exist yet
      console.log(`  Variable doesn't exist yet or couldn't be removed`);
    }
    
    // Add the new variable value - specify production environment
    execSync(`vercel env add ${key} production < ${tempFile}`, { stdio: 'inherit' });
    console.log(`✅ ${key} updated successfully`);
    
    // Clean up temp file
    fs.unlinkSync(tempFile);
  } catch (error) {
    console.error(`❌ Failed to update ${key}: ${error.message}`);
  }
}

// Deploy to apply changes
console.log('🚀 Deploying to apply environment changes...');
try {
  execSync('vercel --prod', { stdio: 'inherit' });
  console.log('✅ Deployment initiated successfully');
} catch (error) {
  console.error(`❌ Deployment failed: ${error.message}`);
  process.exit(1);
} 