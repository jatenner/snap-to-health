#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Path to .env.local file
const envPath = path.resolve(process.cwd(), '.env.local');

// Service account key file path
const keyFilePath = path.resolve(process.cwd(), 'snaphealth-39b14-firebase-adminsdk-fbsvc-80d6186439.json');

console.log('🔧 Setting up Firebase Admin Credentials\n');

// Function to read existing .env.local file
const readEnvFile = () => {
  if (fs.existsSync(envPath)) {
    console.log(`✅ Found existing .env.local file at ${envPath}`);
    return fs.readFileSync(envPath, 'utf8');
  }
  console.log('⚠️ No .env.local file found. Creating a new one.');
  return '';
};

// Function to update .env.local with new values
const updateEnvFile = (content, updates) => {
  let lines = content.split('\n');
  
  // Update existing keys or add new ones
  for (const [key, value] of Object.entries(updates)) {
    const index = lines.findIndex(line => line.startsWith(`${key}=`));
    
    if (index !== -1) {
      lines[index] = `${key}=${value}`;
    } else {
      // If the key doesn't exist, add it
      lines.push(`${key}=${value}`);
    }
  }
  
  return lines.join('\n');
};

// Main function
try {
  // Check if service account key file exists
  if (!fs.existsSync(keyFilePath)) {
    console.error(`❌ Service account key file not found at ${keyFilePath}`);
    console.log('Please specify the correct path to your Firebase service account key file.');
    process.exit(1);
  }
  
  console.log(`✅ Found service account key file at ${keyFilePath}`);
  
  // Read and parse the key file
  const keyFileContent = fs.readFileSync(keyFilePath, 'utf8');
  const keyData = JSON.parse(keyFileContent);
  
  // Extract client_email and private_key
  const clientEmail = keyData.client_email;
  if (!clientEmail) {
    console.error('❌ client_email not found in key file');
    process.exit(1);
  }
  console.log(`✅ Found client_email: ${clientEmail}`);
  
  // Extract and encode private_key
  if (!keyData.private_key) {
    console.error('❌ private_key not found in key file');
    process.exit(1);
  }
  
  const privateKeyBase64 = Buffer.from(keyData.private_key).toString('base64');
  console.log('✅ Successfully encoded private_key to base64');
  
  // Verify the private key format
  try {
    const decodedPrivateKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
    if (!decodedPrivateKey.includes('-----BEGIN PRIVATE KEY-----') || 
        !decodedPrivateKey.includes('-----END PRIVATE KEY-----')) {
      console.warn('⚠️ Warning: The private key does not appear to be in valid PEM format.');
      console.warn('It should include "-----BEGIN PRIVATE KEY-----" and "-----END PRIVATE KEY-----"');
    } else {
      console.log('✅ Private key format validation successful');
    }
  } catch (error) {
    console.warn(`⚠️ Warning: Could not validate private key format: ${error.message}`);
  }
  
  // Read existing .env.local
  let envContent = readEnvFile();
  
  // Update .env.local file
  const updates = {
    'FIREBASE_CLIENT_EMAIL': clientEmail,
    'FIREBASE_PRIVATE_KEY_BASE64': privateKeyBase64
  };
  
  const updatedContent = updateEnvFile(envContent, updates);
  fs.writeFileSync(envPath, updatedContent);
  
  console.log('\n✅ Firebase Admin credentials have been successfully updated in .env.local!');
  
  console.log('\nFirebase Admin credentials added:');
  console.log(` - FIREBASE_CLIENT_EMAIL: ${clientEmail}`);
  console.log(' - FIREBASE_PRIVATE_KEY_BASE64: [Base64 encoded private key]');
  
  console.log('\nTo verify your Firebase Admin setup, run:');
  console.log('npm run verify-firebase');
} catch (error) {
  console.error(`❌ Error: ${error.message}`);
  process.exit(1);
} 