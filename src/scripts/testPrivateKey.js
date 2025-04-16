#!/usr/bin/env node
// Simple script to test Firebase private key parsing
// Run with: node testPrivateKey.js
// Make sure your .env file is properly loaded or pass the key directly

// Load environment variables from .env file if present
try {
  require('dotenv').config();
} catch (e) {
  console.log('dotenv not installed, skipping .env load');
}

// Get the private key from environment
const privateKey = process.env.FIREBASE_PRIVATE_KEY || '';

console.log('===== FIREBASE PRIVATE KEY DIAGNOSTIC =====');
console.log(`Key length: ${privateKey.length} characters`);
console.log(`Key starts with: "${privateKey.substring(0, 30)}..."`);
console.log(`Key contains "\\n": ${privateKey.includes('\\n')}`);
console.log(`Key contains "\n": ${privateKey.includes('\n')}`);
console.log(`Key contains "-----BEGIN": ${privateKey.includes('-----BEGIN')}`);

// Process key - simple replacement
const processedKey = privateKey.replace(/\\n/g, '\n');
console.log('\n===== PROCESSED KEY =====');
console.log(`Processed key length: ${processedKey.length} characters`);
console.log(`Processed key starts with: "${processedKey.substring(0, 30)}..."`);
console.log(`Processed key contains "\n": ${processedKey.includes('\n')}`);
console.log(`Number of newlines: ${(processedKey.match(/\n/g) || []).length}`);

// Test JSON parse method (often works better with environment variables)
console.log('\n===== JSON PARSE METHOD =====');
try {
  // Try to parse with JSON.parse - handles escaped characters well
  // Add quotes around the string for proper JSON formatting
  const jsonParsed = JSON.parse(`"${privateKey}"`);
  console.log(`JSON parsed key length: ${jsonParsed.length} characters`);
  console.log(`JSON parsed key contains "\n": ${jsonParsed.includes('\n')}`);
  console.log(`Number of newlines: ${(jsonParsed.match(/\n/g) || []).length}`);
  console.log(`First few characters: "${jsonParsed.substring(0, 30)}..."`);
} catch (error) {
  console.log(`JSON parse failed: ${error.message}`);
}

// Firebase expected format checker
console.log('\n===== FIREBASE FORMAT CHECK =====');
const checkFirebaseFormat = (key) => {
  const hasBeginEnd = key.includes('-----BEGIN PRIVATE KEY-----') && 
                      key.includes('-----END PRIVATE KEY-----');
  const hasNewlines = key.includes('\n');
  
  if (hasBeginEnd && hasNewlines) {
    console.log('✅ Key appears to be in correct PEM format with proper newlines');
    return true;
  } else {
    console.log('❌ Key does NOT appear to be in correct PEM format:');
    console.log(`  - Has BEGIN/END markers: ${hasBeginEnd}`);
    console.log(`  - Has newlines: ${hasNewlines}`);
    return false;
  }
};

checkFirebaseFormat(processedKey);

// Recommendations
console.log('\n===== RECOMMENDATIONS =====');
if (!privateKey) {
  console.log('❌ FIREBASE_PRIVATE_KEY is not set in your environment');
  console.log('Set it in your .env file or as an environment variable');
} else if (!processedKey.includes('\n')) {
  console.log('❌ Your private key does not contain actual newlines after processing');
  console.log('Try one of these approaches in your .env file:');
  console.log('1. Use actual newlines in the key (multi-line string)');
  console.log('2. Make sure escaped newlines are properly formatted: "\\n" not "\\\\n"');
  console.log('3. In your code, use: JSON.parse(\'"${process.env.FIREBASE_PRIVATE_KEY}"\')');
} else if (!processedKey.includes('-----BEGIN PRIVATE KEY-----')) {
  console.log('❌ Your private key does not contain the expected PEM format markers');
  console.log('Make sure your key starts with "-----BEGIN PRIVATE KEY-----"');
} else {
  console.log('✅ Your private key appears to be properly formatted');
  console.log('If you still have issues, check:');
  console.log('1. Your Firebase project ID and client email are correct');
  console.log('2. The service account has appropriate permissions');
}

console.log('\nTo fix your .env file, the private key should typically look like:');
console.log('FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\nMIIEvgIB...\\n...\\n-----END PRIVATE KEY-----"');
console.log('Note: Each \\n represents where a newline should be in the actual key file'); 