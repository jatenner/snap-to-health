#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const dotenv = require('dotenv');

console.log('🚀 Starting environment sync to Vercel...');

// Load environment variables from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = dotenv.parse(envContent);

// Count of variables synced
let syncCount = 0;

// Sync each environment variable to Vercel
console.log('Syncing environment variables to Vercel...');
for (const [key, value] of Object.entries(env)) {
  // Skip comments or empty values
  if (key.startsWith('#') || !value) continue;
  
  try {
    // Escape special characters in the value
    const escapedValue = value.replace(/"/g, '\\"');
    
    // Execute the Vercel CLI command to update the environment variable
    console.log(`Syncing ${key}...`);
    execSync(`vercel env add ${key} ${escapedValue}`, { 
      stdio: 'inherit'
    });
    
    syncCount++;
  } catch (error) {
    console.error(`Error syncing ${key}: ${error.message}`);
  }
}

console.log(`\n✅ Environment sync completed. Synced ${syncCount} variables to Vercel.`);
console.log('\nTo deploy these changes, run:');
console.log('vercel --prod'); 