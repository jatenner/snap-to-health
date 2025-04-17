#!/usr/bin/env node

/**
 * This script reads a Firebase service account JSON file, extracts the private key,
 * encodes it as a Base-64 string, and generates a Vercel CLI command to add it as an
 * environment variable.
 */

const fs = require('fs');
const path = require('path');

// Path to the service account JSON file
const serviceAccountPath = path.resolve(__dirname, '../keys/snaphealth-d32fe57.json');

try {
  // Read and parse the service account file
  console.log(`Reading service account file: ${serviceAccountPath}`);
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  
  // Extract the private key
  const privateKey = serviceAccount.private_key;
  
  // Check if the private key is in the correct format
  if (!privateKey || !privateKey.startsWith('-----BEGIN PRIVATE KEY-----') || !privateKey.includes('-----END PRIVATE KEY-----')) {
    console.error('ERROR: Private key is not found or not in the expected PEM format.');
    process.exit(1);
  }
  
  // Encode the private key to base64
  const base64PrivateKey = Buffer.from(privateKey).toString('base64');
  
  // Output important information about the service account
  console.log('\nService account details:');
  console.log(`- project_id: ${serviceAccount.project_id}`);
  console.log(`- client_email: ${serviceAccount.client_email}`);
  console.log(`- private_key_id: ${serviceAccount.private_key_id}`);
  
  // Print verification of the Base-64 encoding
  console.log('\nVerification:');
  const decodedKey = Buffer.from(base64PrivateKey, 'base64').toString();
  console.log(`- Original key length: ${privateKey.length} characters`);
  console.log(`- Base64 key length: ${base64PrivateKey.length} characters`);
  console.log(`- Decoded key matches original: ${decodedKey === privateKey ? 'Yes ✓' : 'No ✗'}`);
  
  // Print the Base-64 encoded private key
  console.log('\n--- Base-64 Encoded Private Key ---');
  console.log(base64PrivateKey);
  console.log('-----------------------------------');
  
  // Print the Vercel CLI command
  console.log('\n--- Vercel CLI Command ---');
  console.log(`vercel env add FIREBASE_PRIVATE_KEY_BASE64 "${base64PrivateKey}"`);
  console.log('--------------------------');
  
  // Also save to a file for backup
  const outputPath = path.resolve(__dirname, '../keys/firebase-private-key-base64.txt');
  fs.writeFileSync(outputPath, base64PrivateKey);
  console.log(`\nBase-64 encoded private key also saved to: ${outputPath}`);
  
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
} 