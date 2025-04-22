#!/usr/bin/env node

/**
 * This script updates the OpenAI API key in the Vercel environment.
 * It reads the API key from .env.local and updates the Vercel environment.
 * 
 * Run with: node scripts/update-vercel-api-key.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// Function to extract variables from .env file
function parseEnvFile(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const variables = {};
    
    fileContent.split('\n').forEach(line => {
      // Skip comments and empty lines
      if (!line || line.startsWith('#')) return;
      
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        variables[key] = value;
      }
    });
    
    return variables;
  } catch (error) {
    console.error(`Error reading .env file: ${error.message}`);
    return {};
  }
}

// Function to interactively update Vercel environment variables
function updateVercelEnv(name, value) {
  try {
    // Create an interactive process that simulates typing
    const command = `vercel env add ${name}`;
    const proc = require('child_process').spawn(command, { shell: true, stdio: ['pipe', process.stdout, process.stderr] });
    
    proc.stdin.write(value);
    proc.stdin.end();
    
    return new Promise((resolve, reject) => {
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Command exited with code ${code}`));
        }
      });
    });
  } catch (error) {
    throw error;
  }
}

// Main function
async function main() {
  console.log('🔑 Updating OpenAI API key in Vercel environment...');
  
  try {
    // Read variables from .env.local
    const envPath = path.resolve(process.cwd(), '.env.local');
    const envVars = parseEnvFile(envPath);
    
    // Check if OpenAI API key exists
    if (!envVars.OPENAI_API_KEY) {
      console.error('❌ OpenAI API key not found in .env.local');
      process.exit(1);
    }
    
    const apiKey = envVars.OPENAI_API_KEY;
    console.log(`✅ Found OpenAI API key in .env.local - length: ${apiKey.length} chars`);
    console.log(`🔑 Key starts with: ${apiKey.substring(0, 7)}...${apiKey.substring(apiKey.length - 5)}`);
    
    // Save API key to file for manual update
    const tempFilePath = path.resolve(process.cwd(), '.vercel-apikey-temp');
    fs.writeFileSync(tempFilePath, apiKey);
    
    console.log('⚠️ Due to Vercel CLI limitations, we need to use the manual process.');
    console.log('📋 The OpenAI API key has been saved to .vercel-apikey-temp');
    console.log('\n📝 Please run the following commands manually:');
    console.log('1. vercel env rm OPENAI_API_KEY --yes');
    console.log('2. vercel env add OPENAI_API_KEY');
    console.log(`   (When prompted, paste the API key: ${apiKey.substring(0, 10)}...)`);
    console.log('3. vercel --prod');
    
    console.log('\n🧹 After you have completed these steps, delete the temporary file:');
    console.log('   rm .vercel-apikey-temp');
    
    console.log('\n✅ Instructions completed.');
  } catch (error) {
    console.error(`❌ Error updating API key: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
main(); 