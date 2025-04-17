/**
 * Test script for Firebase private key decoding methods
 * 
 * This script tests different approaches to decoding a Firebase private key from base64
 * to identify the most reliable method. It can help diagnose issues with private key
 * formatting in different environments.
 * 
 * Run with: node scripts/testPrivateKeyDecoding.js
 */

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Function to log information about a string without revealing the full content
function logStringInfo(label, str) {
  if (!str) {
    console.log(`${label}: undefined or null`);
    return;
  }
  
  console.log(`${label}:`);
  console.log(`- Type: ${typeof str}`);
  console.log(`- Length: ${str.length} characters`);
  console.log(`- First 20 chars: ${str.substring(0, 20)}...`);
  console.log(`- Contains \\n: ${str.includes('\\n')}`);
  console.log(`- Contains actual newlines: ${str.includes('\n')}`);
  
  if (str.includes('\n')) {
    const lines = str.split('\n');
    console.log(`- Line count: ${lines.length}`);
    console.log(`- First line: ${lines[0].substring(0, 40)}...`);
    
    if (lines.length > 1) {
      console.log(`- Second line: ${lines[1].substring(0, 40)}...`);
    }
  }
}

// Test different decoding methods
function testDecodingMethods() {
  console.log('🔍 TESTING PRIVATE KEY DECODING METHODS');
  console.log('======================================');
  
  const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
  
  if (!privateKeyBase64) {
    console.error('❌ FIREBASE_PRIVATE_KEY_BASE64 environment variable is missing');
    return;
  }
  
  console.log('\n1️⃣ Original base64 private key');
  logStringInfo('Base64 key', privateKeyBase64);
  
  try {
    console.log('\n2️⃣ Method 1: Basic buffer decoding');
    const decoded1 = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
    logStringInfo('Decoded key', decoded1);
    
    // Validate the key format
    const isValid1 = decoded1.includes('-----BEGIN PRIVATE KEY-----') && 
                    decoded1.includes('-----END PRIVATE KEY-----') &&
                    decoded1.includes('\n');
    
    console.log(`- Valid PEM format: ${isValid1 ? '✅ YES' : '❌ NO'}`);
  } catch (error) {
    console.error(`❌ Error with Method 1: ${error.message}`);
  }
  
  try {
    console.log('\n3️⃣ Method 2: Decode then replace escaped newlines');
    const decoded2 = Buffer.from(privateKeyBase64, 'base64').toString('utf8').replace(/\\n/g, '\n');
    logStringInfo('Decoded key', decoded2);
    
    // Validate the key format
    const isValid2 = decoded2.includes('-----BEGIN PRIVATE KEY-----') && 
                    decoded2.includes('-----END PRIVATE KEY-----') &&
                    decoded2.includes('\n');
    
    console.log(`- Valid PEM format: ${isValid2 ? '✅ YES' : '❌ NO'}`);
  } catch (error) {
    console.error(`❌ Error with Method 2: ${error.message}`);
  }
  
  try {
    console.log('\n4️⃣ Method 3: Buffer with explicit URL-safe flag');
    const decoded3 = Buffer.from(privateKeyBase64, 'base64url').toString('utf8');
    logStringInfo('Decoded key', decoded3);
    
    // Validate the key format
    const isValid3 = decoded3.includes('-----BEGIN PRIVATE KEY-----') && 
                    decoded3.includes('-----END PRIVATE KEY-----') &&
                    decoded3.includes('\n');
    
    console.log(`- Valid PEM format: ${isValid3 ? '✅ YES' : '❌ NO'}`);
  } catch (error) {
    console.error(`❌ Error with Method 3: ${error.message}`);
  }
  
  try {
    console.log('\n5️⃣ Method 4: JSON parse workaround');
    // This tricks JSON.parse into handling escape sequences
    const jsonWrapped = `{"key":"${privateKeyBase64}"}`;
    const parsed = JSON.parse(jsonWrapped);
    const decoded4 = Buffer.from(parsed.key, 'base64').toString('utf8');
    logStringInfo('Decoded key', decoded4);
    
    // Validate the key format
    const isValid4 = decoded4.includes('-----BEGIN PRIVATE KEY-----') && 
                    decoded4.includes('-----END PRIVATE KEY-----') &&
                    decoded4.includes('\n');
    
    console.log(`- Valid PEM format: ${isValid4 ? '✅ YES' : '❌ NO'}`);
  } catch (error) {
    console.error(`❌ Error with Method 4: ${error.message}`);
  }
  
  console.log('\n6️⃣ Verifying getPrivateKey function from firebaseAdmin.ts');
  try {
    // This function mimics the one used in src/lib/firebaseAdmin.ts
    function getPrivateKey() {
      const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
      if (!privateKeyBase64) return null;
      
      try {
        return Buffer.from(privateKeyBase64, 'base64').toString('utf8');
      } catch (e) {
        console.error('Error decoding private key:', e);
        return null;
      }
    }
    
    const decodedWithFunction = getPrivateKey();
    logStringInfo('Decoded with getPrivateKey()', decodedWithFunction);
    
    // Validate the key format
    const isValidFunction = decodedWithFunction &&
                           decodedWithFunction.includes('-----BEGIN PRIVATE KEY-----') && 
                           decodedWithFunction.includes('-----END PRIVATE KEY-----') &&
                           decodedWithFunction.includes('\n');
    
    console.log(`- Valid PEM format: ${isValidFunction ? '✅ YES' : '❌ NO'}`);
  } catch (error) {
    console.error(`❌ Error with firebaseAdmin.ts method: ${error.message}`);
  }
  
  console.log('\n✅ TEST COMPLETE');
}

// Run the tests
testDecodingMethods(); 