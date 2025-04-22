#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Create a readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Path to .env.local file
const envPath = path.resolve(process.cwd(), '.env.local');

// Function to prompt user for input
const prompt = (question) => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
};

// Function to read existing .env.local file
const readEnvFile = () => {
  if (fs.existsSync(envPath)) {
    return fs.readFileSync(envPath, 'utf8');
  }
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
const main = async () => {
  console.log('🔧 Firebase Admin Credentials Setup\n');
  
  try {
    // Read existing .env.local
    let envContent = readEnvFile();
    if (!envContent) {
      console.log('⚠️ No .env.local file found. Creating a new one.');
      envContent = '';
    } else {
      console.log('✅ Found existing .env.local file.');
    }
    
    console.log('\nFirebase Admin requires two credential values:');
    console.log(' 1. FIREBASE_CLIENT_EMAIL - The email from your service account');
    console.log(' 2. FIREBASE_PRIVATE_KEY_BASE64 - Your private key encoded in base64');
    console.log('\nYou can get these values from a Firebase service account key file (JSON).\n');
    
    // Ask if the user has a service account key file
    const hasKeyFile = await prompt('Do you have a Firebase service account key file? (y/n): ');
    
    let clientEmail = '';
    let privateKeyBase64 = '';
    
    if (hasKeyFile.toLowerCase() === 'y') {
      // Path to service account key file
      const keyFilePath = await prompt('Enter the path to your service account key file: ');
      
      try {
        // Read and parse the key file
        const keyFileContent = fs.readFileSync(keyFilePath, 'utf8');
        const keyData = JSON.parse(keyFileContent);
        
        // Extract client_email and private_key
        clientEmail = keyData.client_email;
        if (!clientEmail) {
          console.error('❌ client_email not found in key file');
          clientEmail = await prompt('Enter the client email manually: ');
        } else {
          console.log(`✅ Found client_email: ${clientEmail}`);
        }
        
        // Extract and encode private_key
        if (keyData.private_key) {
          privateKeyBase64 = Buffer.from(keyData.private_key).toString('base64');
          console.log('✅ Successfully encoded private_key to base64');
        } else {
          console.error('❌ private_key not found in key file');
          const privateKey = await prompt('Enter the private key manually (including BEGIN/END markers): ');
          privateKeyBase64 = Buffer.from(privateKey).toString('base64');
        }
      } catch (error) {
        console.error(`❌ Error reading key file: ${error.message}`);
        console.log('Continuing with manual entry...');
        
        clientEmail = await prompt('Enter the client email: ');
        const privateKey = await prompt('Enter the private key (including BEGIN/END markers): ');
        privateKeyBase64 = Buffer.from(privateKey).toString('base64');
      }
    } else {
      // Manual entry
      clientEmail = await prompt('Enter the client email: ');
      const privateKey = await prompt('Enter the private key (including BEGIN/END markers): ');
      privateKeyBase64 = Buffer.from(privateKey).toString('base64');
    }
    
    // Verify the private key format after base64 decoding
    try {
      const decodedPrivateKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
      if (!decodedPrivateKey.includes('-----BEGIN PRIVATE KEY-----') || 
          !decodedPrivateKey.includes('-----END PRIVATE KEY-----')) {
        console.warn('⚠️ Warning: The private key does not appear to be in valid PEM format.');
        console.warn('It should include "-----BEGIN PRIVATE KEY-----" and "-----END PRIVATE KEY-----"');
        
        const proceed = await prompt('Do you want to proceed anyway? (y/n): ');
        if (proceed.toLowerCase() !== 'y') {
          console.log('Operation cancelled.');
          rl.close();
          return;
        }
      } else {
        console.log('✅ Private key format validation successful');
      }
    } catch (error) {
      console.warn(`⚠️ Warning: Could not validate private key format: ${error.message}`);
      const proceed = await prompt('Do you want to proceed anyway? (y/n): ');
      if (proceed.toLowerCase() !== 'y') {
        console.log('Operation cancelled.');
        rl.close();
        return;
      }
    }
    
    // Update .env.local file
    const updates = {
      'FIREBASE_CLIENT_EMAIL': clientEmail,
      'FIREBASE_PRIVATE_KEY_BASE64': privateKeyBase64
    };
    
    const updatedContent = updateEnvFile(envContent, updates);
    fs.writeFileSync(envPath, updatedContent);
    
    console.log('\n✅ Firebase Admin credentials have been successfully updated in .env.local!');
    console.log(`File saved to: ${envPath}`);
    
    console.log('\nTo verify your Firebase Admin setup, run:');
    console.log('npm run verify-firebase');
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  } finally {
    rl.close();
  }
};

// Run the main function
main(); 