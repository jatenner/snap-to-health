#!/usr/bin/env node
/**
 * This script checks and updates Firebase environment variables in Vercel
 * It ensures FIREBASE_PRIVATE_KEY_BASE64 is set and removes FIREBASE_PRIVATE_KEY
 * 
 * Usage: 
 * 1. Install Vercel CLI: npm i -g vercel
 * 2. Login: vercel login
 * 3. Run: node vercel-env-check.js
 */

const { execSync } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Function to get user input
function question(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

// Function to execute commands with error handling
function execCommand(command, options = {}) {
  try {
    const output = execSync(command, { encoding: 'utf8', ...options });
    return { success: true, output };
  } catch (error) {
    return { 
      success: false, 
      error: error.message,
      output: error.stdout?.toString() || ''
    };
  }
}

async function main() {
  console.log('🔐 Vercel Firebase Environment Variables Checker');
  console.log('================================================');
  
  // Check if Vercel CLI is installed
  const vercelCheck = execCommand('vercel --version');
  if (!vercelCheck.success) {
    console.error('❌ Vercel CLI is not installed or not in PATH');
    console.log('Please install it with: npm i -g vercel');
    return;
  }
  
  console.log(`✅ Vercel CLI detected: ${vercelCheck.output.trim()}`);
  
  // Check if user is logged in
  const loginCheck = execCommand('vercel whoami');
  if (!loginCheck.success) {
    console.error('❌ Not logged in to Vercel CLI');
    console.log('Please login with: vercel login');
    return;
  }
  
  console.log(`✅ Logged in as: ${loginCheck.output.trim()}`);
  
  // Get Vercel project name
  const projectInfo = execCommand('vercel project ls');
  if (!projectInfo.success) {
    console.error('❌ Could not list Vercel projects');
    return;
  }
  
  console.log('\n📋 Vercel Projects:');
  console.log(projectInfo.output);
  
  const projectName = await question('Enter the project name: ');
  if (!projectName) {
    console.error('❌ Project name is required');
    return;
  }
  
  // Pull project env variables
  console.log(`\n🔍 Checking environment variables for project: ${projectName}`);
  
  // Check for existing environment variables
  const environments = ['production', 'preview', 'development'];
  
  for (const env of environments) {
    console.log(`\n📊 Environment: ${env.toUpperCase()}`);
    
    // List existing env variables
    const envList = execCommand(`vercel env ls ${projectName} ${env}`);
    if (!envList.success) {
      console.error(`❌ Could not list environment variables for ${env}`);
      console.log(envList.error);
      continue;
    }
    
    // Check for FIREBASE_PRIVATE_KEY and FIREBASE_PRIVATE_KEY_BASE64
    const hasOldKey = envList.output.includes('FIREBASE_PRIVATE_KEY');
    const hasBase64Key = envList.output.includes('FIREBASE_PRIVATE_KEY_BASE64');
    
    console.log(`FIREBASE_PRIVATE_KEY: ${hasOldKey ? '🔴 Found (should be removed)' : '✅ Not found (good)'}`);
    console.log(`FIREBASE_PRIVATE_KEY_BASE64: ${hasBase64Key ? '✅ Found' : '🔴 Not found (needs to be added)'}`);
    
    // Ask user what action to take
    if (hasOldKey) {
      const shouldRemove = await question(`Do you want to remove FIREBASE_PRIVATE_KEY from ${env}? (yes/no): `);
      if (shouldRemove.toLowerCase() === 'yes') {
        console.log(`Removing FIREBASE_PRIVATE_KEY from ${env}...`);
        const removeResult = execCommand(`vercel env rm FIREBASE_PRIVATE_KEY ${env} -y`);
        if (removeResult.success) {
          console.log('✅ Successfully removed FIREBASE_PRIVATE_KEY');
        } else {
          console.error('❌ Failed to remove FIREBASE_PRIVATE_KEY');
          console.log(removeResult.error);
        }
      }
    }
    
    if (!hasBase64Key) {
      const shouldAdd = await question(`Do you want to add FIREBASE_PRIVATE_KEY_BASE64 to ${env}? (yes/no): `);
      if (shouldAdd.toLowerCase() === 'yes') {
        const base64Key = await question(`Enter the base64 encoded private key for ${env}: `);
        if (!base64Key) {
          console.error('❌ Base64 key is required');
          continue;
        }
        
        // Create a temporary file with the key
        const tempFile = path.join(process.cwd(), '.temp_key');
        fs.writeFileSync(tempFile, base64Key);
        
        // Add the environment variable
        console.log(`Adding FIREBASE_PRIVATE_KEY_BASE64 to ${env}...`);
        const addResult = execCommand(`vercel env add FIREBASE_PRIVATE_KEY_BASE64 ${env} < ${tempFile}`);
        
        // Remove the temporary file
        fs.unlinkSync(tempFile);
        
        if (addResult.success) {
          console.log('✅ Successfully added FIREBASE_PRIVATE_KEY_BASE64');
        } else {
          console.error('❌ Failed to add FIREBASE_PRIVATE_KEY_BASE64');
          console.log(addResult.error);
        }
      }
    }
  }
  
  console.log('\n🚀 Environment variables check completed!');
  console.log('To deploy your changes:');
  console.log('vercel --prod');
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
}); 