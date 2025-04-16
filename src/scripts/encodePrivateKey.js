#!/usr/bin/env node
/**
 * This script encodes a Firebase private key as Base64
 * Run it with: node encodePrivateKey.js path/to/private-key.txt
 * 
 * The private key should be in a text file with the actual newlines
 * You can copy it directly from your Firebase service account JSON file
 */

const fs = require('fs');

// Check if a file path is provided
if (process.argv.length < 3) {
  console.log('Usage: node encodePrivateKey.js path/to/private-key.txt');
  console.log('\nOr paste your private key directly when prompted:');
  console.log('node encodePrivateKey.js --paste');
  process.exit(1);
}

// Function to encode the key
const encodeKey = (key) => {
  try {
    // Check if the key looks like a PEM private key
    if (!key.includes('-----BEGIN PRIVATE KEY-----') || !key.includes('-----END PRIVATE KEY-----')) {
      console.warn('⚠️ WARNING: The provided key does not appear to be a valid PEM private key.');
      console.warn('Make sure it contains "-----BEGIN PRIVATE KEY-----" and "-----END PRIVATE KEY-----"');
    }
    
    // Encode the key as Base64
    const encoded = Buffer.from(key).toString('base64');
    return encoded;
  } catch (error) {
    console.error('❌ Error encoding the key:', error.message);
    process.exit(1);
  }
};

const handlePaste = () => {
  console.log('Paste your private key below (press Ctrl+D or Ctrl+Z when done):');
  let input = '';
  
  process.stdin.on('data', (data) => {
    input += data;
  });
  
  process.stdin.on('end', () => {
    const trimmedInput = input.trim();
    const encoded = encodeKey(trimmedInput);
    outputResult(trimmedInput, encoded);
  });
  
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
};

const outputResult = (original, encoded) => {
  console.log('\n===== ORIGINAL KEY =====');
  console.log(`Length: ${original.length} characters`);
  console.log(`First few characters: ${original.substring(0, 30)}...`);
  console.log(`Contains newlines: ${original.includes('\n')}`);
  
  console.log('\n===== BASE64 ENCODED KEY =====');
  console.log(encoded);
  console.log(`\nLength: ${encoded.length} characters`);
  
  console.log('\n===== HOW TO USE =====');
  console.log('1. Add this to your .env file:');
  console.log(`FIREBASE_PRIVATE_KEY_BASE64="${encoded}"`);
  console.log('\n2. In your firebaseAdmin.ts, make sure you have the code to decode it:');
  console.log(`
const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
let privateKey = '';

if (privateKeyBase64) {
  try {
    privateKey = Buffer.from(privateKeyBase64, 'base64').toString();
  } catch (e) {
    privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
  }
} else {
  privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
}
  `);
};

// Check if we should handle paste mode
if (process.argv[2] === '--paste') {
  handlePaste();
} else {
  // Read the file
  const filePath = process.argv[2];
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`❌ File not found: ${filePath}`);
      process.exit(1);
    }
    
    const key = fs.readFileSync(filePath, 'utf8');
    const encoded = encodeKey(key);
    outputResult(key, encoded);
  } catch (error) {
    console.error('❌ Error reading the file:', error.message);
    process.exit(1);
  }
} 