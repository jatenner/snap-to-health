// Script to fix the Firebase private key encoding
// This extracts the private key from a service account JSON and encodes it properly

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Get the base64 encoded service account from .env.local
const encodedServiceAccount = process.env.FIREBASE_PRIVATE_KEY_BASE64;

if (!encodedServiceAccount) {
  console.error('❌ FIREBASE_PRIVATE_KEY_BASE64 not found in .env.local');
  process.exit(1);
}

try {
  // Decode the service account JSON
  const serviceAccountJson = Buffer.from(encodedServiceAccount, 'base64').toString('utf8');
  const serviceAccount = JSON.parse(serviceAccountJson);
  
  // Extract the private key
  const privateKey = serviceAccount.private_key;
  
  if (!privateKey) {
    console.error('❌ private_key not found in the decoded service account JSON');
    process.exit(1);
  }
  
  // Check that it's a proper PEM format
  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----') || 
      !privateKey.includes('-----END PRIVATE KEY-----')) {
    console.error('❌ Extracted private key is not in PEM format');
    process.exit(1);
  }
  
  // Encode the private key directly
  const privateKeyBase64 = Buffer.from(privateKey).toString('base64');
  
  console.log('✅ Successfully extracted private key from service account');
  console.log('✅ Private key is in PEM format');
  console.log(`✅ Base64 encoded private key length: ${privateKeyBase64.length} characters`);
  
  // Output the encoded key without revealing it
  console.log('\nUpdate your .env.local file with:');
  console.log('FIREBASE_PRIVATE_KEY_BASE64=' + privateKeyBase64);
  
  // Also save to a temporary file for easy copying
  const outputPath = path.resolve(process.cwd(), 'private-key-base64.txt');
  fs.writeFileSync(outputPath, privateKeyBase64);
  console.log(`\n✅ Saved encoded private key to: ${outputPath}`);
  console.log('Copy this value to your .env.local file');
  
} catch (error) {
  console.error('❌ Error processing the service account JSON:', error.message);
  process.exit(1);
} 