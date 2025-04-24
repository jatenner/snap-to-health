#!/usr/bin/env node

/**
 * Script to update Vercel environment variables for GPT-4o Vision
 * Ensures that the correct environment variables are set for production
 */

// Run with: node src/scripts/update-vercel-env.js

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Define the critical environment variables for GPT-4o Vision
const criticalVars = [
  { name: 'USE_GPT4_VISION', value: 'true' },
  { name: 'USE_OCR_EXTRACTION', value: 'true' },
  { name: 'OPENAI_MODEL', value: 'gpt-4o' }
];

console.log('🚀 Updating Vercel environment variables for GPT-4o Vision');

// Check if the Vercel CLI is installed
try {
  execSync('vercel --version', { stdio: 'pipe' });
} catch (error) {
  console.error('❌ Vercel CLI not found. Please install it with: npm i -g vercel');
  process.exit(1);
}

// Check if the user is logged in to Vercel
try {
  execSync('vercel whoami', { stdio: 'pipe' });
} catch (error) {
  console.error('❌ Not logged in to Vercel. Please run: vercel login');
  process.exit(1);
}

// Update environment variables
console.log('\n📝 Updating GPT-4o Vision environment variables:');

criticalVars.forEach(variable => {
  try {
    console.log(`- Setting ${variable.name}=${variable.value}`);
    
    // Create a temporary file with the value
    const tempFile = path.join(__dirname, `temp-${variable.name}.txt`);
    fs.writeFileSync(tempFile, variable.value);
    
    // Remove existing variable if it exists
    try {
      execSync(`vercel env rm ${variable.name} --yes`, { stdio: 'inherit' });
    } catch (error) {
      // Ignore errors if the variable doesn't exist yet
    }
    
    // Add the new variable for production
    execSync(`vercel env add ${variable.name} production < ${tempFile}`, { stdio: 'inherit' });
    console.log(`  ✅ ${variable.name} updated successfully`);
    
    // Clean up temp file
    fs.unlinkSync(tempFile);
  } catch (error) {
    console.error(`  ❌ Failed to update ${variable.name}: ${error.message}`);
  }
});

// Remind user to deploy and verify
console.log('\n🔍 Next steps:');
console.log('1. Deploy to Vercel with: vercel --prod');
console.log('2. Verify the configuration with: node src/scripts/verify-vision-ocr.js https://your-vercel-url.vercel.app');
console.log('\n✅ Environment variables updated successfully');

// Deployment instructions
console.log('\n🚀 To deploy to Vercel, run:');
console.log('   vercel --prod');
console.log('\n🔧 To verify deployment, run:');
console.log('   node src/scripts/verify-vision-ocr.js https://your-vercel-url.vercel.app'); 