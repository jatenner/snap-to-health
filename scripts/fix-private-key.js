#!/usr/bin/env node

// Script to fix the Firebase private key encoding
// This extracts the private key from a service account JSON and encodes it properly

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Path to the service account file
const serviceAccountPath = process.argv[2] || '/Users/jonahtenner/Downloads/snaphealth-39b14-firebase-adminsdk-fbsvc-d32fe5731b.json';

// Read the service account file
try {
  console.log(`Reading service account file: ${serviceAccountPath}`);
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath));
  
  // Extract the private key
  const privateKey = serviceAccount.private_key;
  
  // Check if the private key is in the correct format
  if (!privateKey.startsWith('-----BEGIN PRIVATE KEY-----') || !privateKey.endsWith('-----END PRIVATE KEY-----\n')) {
    console.error('ERROR: Private key is not in the expected PEM format.');
    process.exit(1);
  }
  
  // Encode to base64
  const base64PrivateKey = Buffer.from(privateKey).toString('base64');
  
  // Output the result
  console.log('\nService account details:');
  console.log(`- project_id: ${serviceAccount.project_id}`);
  console.log(`- client_email: ${serviceAccount.client_email}`);
  console.log(`- client_id: ${serviceAccount.client_id}`);
  
  console.log('\nBase64 encoded private key:');
  console.log(base64PrivateKey);
  
  console.log('\nVerification:');
  // Verify by decoding back
  const decodedKey = Buffer.from(base64PrivateKey, 'base64').toString();
  console.log(`- Contains header: ${decodedKey.includes('-----BEGIN PRIVATE KEY-----') ? 'Yes' : 'No'}`);
  console.log(`- Contains footer: ${decodedKey.includes('-----END PRIVATE KEY-----') ? 'Yes' : 'No'}`);
  console.log(`- Original key length: ${privateKey.length}`);
  console.log(`- Decoded key length: ${decodedKey.length}`);
  
  console.log('\nAdd this to your .env.local, .env.local.firebase, and .env.local.example:');
  console.log(`FIREBASE_PRIVATE_KEY_BASE64=${base64PrivateKey}`);
  
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
} 