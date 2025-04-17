#!/usr/bin/env node

/**
 * This script encodes a Firebase private key to base64 format
 * and helps diagnose private key issues
 * 
 * Usage: node scripts/encodePrivateKey.js "/path/to/service-account.json"
 */

const fs = require('fs');

// Check if a file path is provided
if (process.argv.length < 3) {
  console.log('Usage: node scripts/encodePrivateKey.js "/path/to/service-account.json"');
  process.exit(1);
}

// Read the service account file
const serviceAccountPath = process.argv[2];
console.log(`Reading service account from: ${serviceAccountPath}`);

try {
  // Read and parse the service account file
  const serviceAccountContent = fs.readFileSync(serviceAccountPath, 'utf8');
  const serviceAccount = JSON.parse(serviceAccountContent);
  
  // Extract the private key
  const { private_key, client_email, project_id, client_id } = serviceAccount;
  
  if (!private_key) {
    console.error('❌ Service account file does not contain a private_key field!');
    process.exit(1);
  }
  
  console.log('\n====== SERVICE ACCOUNT INFO ======');
  console.log(`Project ID: ${project_id || 'Not found'}`);
  console.log(`Client Email: ${client_email || 'Not found'}`);
  console.log(`Client ID: ${client_id || 'Not found'}`);
  
  // Display the raw private key format (partially masked)
  console.log('\n====== PRIVATE KEY ANALYSIS ======');
  console.log(`Raw private key length: ${private_key.length} characters`);
  console.log('First 30 chars:', private_key.substring(0, 30));
  console.log('Last 30 chars:', private_key.substring(private_key.length - 30));
  
  // Check if the key is in PEM format
  const isPEM = private_key.includes('-----BEGIN PRIVATE KEY-----') && 
                private_key.includes('-----END PRIVATE KEY-----');
  console.log(`Is in PEM format: ${isPEM ? '✅' : '❌'}`);
  
  // Check for newlines
  const hasNewlines = private_key.includes('\n');
  const newlineCount = (private_key.match(/\n/g) || []).length;
  console.log(`Contains newlines: ${hasNewlines ? `✅ (${newlineCount} found)` : '❌'}`);
  
  // Encode the private key to base64
  console.log('\n====== BASE64 ENCODING ======');
  const privateKeyBase64 = Buffer.from(private_key).toString('base64');
  console.log(`Base64 encoded length: ${privateKeyBase64.length} characters`);
  console.log('First 30 chars of base64:', privateKeyBase64.substring(0, 30) + '...');
  console.log('Last 30 chars of base64:', '...' + privateKeyBase64.substring(privateKeyBase64.length - 30));
  
  // Test decoding the base64 key
  console.log('\n====== DECODING TEST ======');
  const decodedKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
  const decodingSuccessful = decodedKey === private_key;
  console.log(`Decoding test: ${decodingSuccessful ? '✅ matches original' : '❌ does not match original'}`);
  
  if (!decodingSuccessful) {
    console.log('Original key length:', private_key.length);
    console.log('Decoded key length:', decodedKey.length);
    
    // Check first differences
    let firstDiffIndex = -1;
    for (let i = 0; i < Math.min(private_key.length, decodedKey.length); i++) {
      if (private_key[i] !== decodedKey[i]) {
        firstDiffIndex = i;
        break;
      }
    }
    
    if (firstDiffIndex >= 0) {
      console.log(`First difference at position ${firstDiffIndex}:`);
      console.log(`Original: "${private_key.substring(firstDiffIndex, firstDiffIndex + 20)}..."`);
      console.log(`Decoded: "${decodedKey.substring(firstDiffIndex, firstDiffIndex + 20)}..."`);
    }
  }
  
  // Generate environment variable lines
  console.log('\n====== ENVIRONMENT VARIABLES ======');
  console.log('Add these lines to your .env.local file:');
  console.log(`NEXT_PUBLIC_FIREBASE_PROJECT_ID=${project_id || ''}`);
  console.log(`FIREBASE_CLIENT_EMAIL=${client_email || ''}`);
  console.log(`FIREBASE_CLIENT_ID=${client_id || ''}`);
  console.log(`FIREBASE_PRIVATE_KEY_BASE64=${privateKeyBase64}`);
  
  // Optional: write to temporary file
  const outputPath = './firebase-env-vars.txt';
  const envContent = `# Firebase Admin SDK environment variables
# Generated on ${new Date().toISOString()}
# Add these to your .env.local file

NEXT_PUBLIC_FIREBASE_PROJECT_ID=${project_id || ''}
FIREBASE_CLIENT_EMAIL=${client_email || ''}
FIREBASE_CLIENT_ID=${client_id || ''}
FIREBASE_PRIVATE_KEY_BASE64=${privateKeyBase64}

# For verification, here's the escaped version (DO NOT USE this one - use the base64 version above!)
# FIREBASE_PRIVATE_KEY="${private_key.replace(/\n/g, '\\n')}"
`;

  fs.writeFileSync(outputPath, envContent);
  console.log(`\n✅ Environment variables saved to: ${outputPath}`);
  console.log('\nRemember to add these to your .env.local file and restart your app.');
  console.log('The Firebase Admin SDK will use FIREBASE_PRIVATE_KEY_BASE64 and decode it automatically.');
  
  console.log('\n⚠️ Note: If using the standard FIREBASE_PRIVATE_KEY, the key would need escaped newlines.');
  console.log('See how we would reference this in firebaseAdmin.ts:');
  console.log('const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\\\n/g, "\\n");');
  
} catch (error) {
  console.error('❌ Error processing service account file:', error);
  process.exit(1);
} 