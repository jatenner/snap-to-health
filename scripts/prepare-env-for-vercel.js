// Prepare environment variables for Vercel
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = dotenv.parse(envContent);

console.log('Vercel Environment Variables');
console.log('==========================');
console.log('Copy the following commands to set environment variables in Vercel:');
console.log('\n');

// Generate Vercel CLI commands for each environment variable
for (const [key, value] of Object.entries(env)) {
  // Skip comments
  if (key.startsWith('#')) continue;
  
  // Escape any quotes in the value
  const escapedValue = value.replace(/"/g, '\\"');
  
  // Format the command
  console.log(`vercel env add ${key} production`);
}

// Especially highlight the Firebase private key
console.log('\n');
console.log('For FIREBASE_PRIVATE_KEY_BASE64, copy this value:');
console.log(env.FIREBASE_PRIVATE_KEY_BASE64);

console.log('\n');
console.log('Alternatively, you can manually set these variables in the Vercel dashboard.');
console.log('Project Settings > Environment Variables'); 