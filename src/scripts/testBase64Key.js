#!/usr/bin/env node
// Script to test base64 encoded Firebase private key
// Run with: node src/scripts/testBase64Key.js

// Load environment variables from .env file if present
try {
  require('dotenv').config();
} catch (e) {
  console.log('dotenv not installed, skipping .env load');
}

// Get the base64 encoded private key from environment
const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64 || '';

console.log('===== FIREBASE BASE64 PRIVATE KEY DIAGNOSTIC =====');
console.log(`Base64 key length: ${privateKeyBase64.length} characters`);
console.log(`Base64 key exists: ${privateKeyBase64.length > 0 ? 'Yes' : 'No'}`);

if (privateKeyBase64.length === 0) {
  console.log('❌ FIREBASE_PRIVATE_KEY_BASE64 is not set in your environment');
  process.exit(1);
}

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