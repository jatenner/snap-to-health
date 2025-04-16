#!/usr/bin/env node
// Script to test by directly loading .env.local
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Explicitly load .env.local file
const envLocalPath = path.resolve(process.cwd(), '.env.local');
console.log(`Attempting to load: ${envLocalPath}`);

if (fs.existsSync(envLocalPath)) {
  console.log(`Found .env.local file at ${envLocalPath}`);
  const envConfig = dotenv.parse(fs.readFileSync(envLocalPath));
  
  // Apply loaded env vars to process.env
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
  
  console.log('Environment variables loaded from .env.local');
} else {
  console.error('.env.local file not found!');
  process.exit(1);
}

// Now check the base64 key
const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64 || '';

console.log('\n===== FIREBASE BASE64 PRIVATE KEY DIAGNOSTIC =====');
console.log(`Base64 key length: ${privateKeyBase64.length} characters`);
console.log(`Base64 key exists: ${privateKeyBase64.length > 0 ? 'Yes' : 'No'}`);

if (privateKeyBase64.length === 0) {
  console.log('❌ FIREBASE_PRIVATE_KEY_BASE64 is not set in .env.local');
  process.exit(1);
}

// Show part of the base64 string for verification
console.log(`Base64 key (first 30 chars): ${privateKeyBase64.substring(0, 30)}...`);

// Decode the base64 key
try {
  const decodedKey = Buffer.from(privateKeyBase64, 'base64').toString();
  
  console.log('\n===== DECODED KEY =====');
  console.log(`Decoded key length: ${decodedKey.length} characters`);
  console.log(`First 30 characters: "${decodedKey.substring(0, 30)}..."`);
  console.log(`Contains "-----BEGIN PRIVATE KEY-----": ${decodedKey.includes('-----BEGIN PRIVATE KEY-----')}`);
  console.log(`Contains "-----END PRIVATE KEY-----": ${decodedKey.includes('-----END PRIVATE KEY-----')}`);
  console.log(`Contains newlines: ${decodedKey.includes('\n')}`);
  console.log(`Number of newlines: ${(decodedKey.match(/\n/g) || []).length}`);
  
  // Check if it's a valid PEM format
  const isPem = decodedKey.includes('-----BEGIN PRIVATE KEY-----') && 
                decodedKey.includes('-----END PRIVATE KEY-----') &&
                decodedKey.includes('\n');
  
  console.log('\n===== VALIDATION RESULT =====');
  if (isPem) {
    console.log('✅ Successfully decoded a valid PEM format private key');
    console.log('Firebase Admin SDK should be able to use this key correctly.');
  } else {
    console.log('❌ The decoded key does not appear to be in valid PEM format:');
    console.log(`  - Has BEGIN marker: ${decodedKey.includes('-----BEGIN PRIVATE KEY-----')}`);
    console.log(`  - Has END marker: ${decodedKey.includes('-----END PRIVATE KEY-----')}`);
    console.log(`  - Has newlines: ${decodedKey.includes('\n')}`);
  }
} catch (error) {
  console.error('❌ Error decoding base64 key:', error.message);
  process.exit(1);
} 