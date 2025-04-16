#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Function to get user input
function question(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => rl.question(query, answer => {
    rl.close();
    resolve(answer);
  }));
}

async function main() {
  try {
    console.log('🔑 Vercel Firebase Private Key Updater');
    console.log('-------------------------------------');
    
    // Check if the base64 key is provided as an argument
    let base64Key = process.argv[2];
    
    if (!base64Key) {
      // Try to read from the output of update-firebase-key.js
      try {
        const output = execSync('node update-firebase-key.js').toString();
        const match = output.match(/Base64 encoded key \(for FIREBASE_PRIVATE_KEY_BASE64\):\s*([\s\S]+?)\s*\n\nTo update/);
        if (match && match[1]) {
          base64Key = match[1].replace(/\s+/g, '');
          console.log('✅ Found base64 key from update-firebase-key.js output');
        }
      } catch (error) {
        console.log('⚠️ Could not run update-firebase-key.js automatically');
      }
    }
    
    if (!base64Key) {
      console.log('⚠️ No base64 key provided or found');
      const manualKey = await question('Please paste the base64 encoded private key: ');
      base64Key = manualKey.trim();
      
      if (!base64Key) {
        console.error('❌ No key provided. Exiting...');
        process.exit(1);
      }
    }
    
    // Validate the base64 key format
    const isValidBase64 = /^[A-Za-z0-9+/=]+$/.test(base64Key.replace(/\s+/g, ''));
    if (!isValidBase64) {
      console.error('❌ Invalid base64 format. Please check the key.');
      process.exit(1);
    }
    
    // Determine which environments to update
    const environments = ['production', 'preview', 'development'];
    
    for (const env of environments) {
      const shouldUpdate = await question(`Update ${env} environment? (y/n): `);
      if (shouldUpdate.toLowerCase() === 'y') {
        try {
          console.log(`Updating ${env} environment...`);
          
          // Create a temporary file with the key
          const tempFile = path.join(process.cwd(), '.temp_key');
          fs.writeFileSync(tempFile, base64Key);
          
          // Use vercel env command to update the environment variable
          execSync(`vercel env rm FIREBASE_PRIVATE_KEY_BASE64 ${env} -y || true`);
          execSync(`vercel env add FIREBASE_PRIVATE_KEY_BASE64 ${env} < ${tempFile}`);
          
          // Remove the temporary file
          fs.unlinkSync(tempFile);
          
          console.log(`✅ Updated FIREBASE_PRIVATE_KEY_BASE64 for ${env} environment`);
        } catch (error) {
          console.error(`❌ Failed to update ${env} environment:`, error.message);
          console.log('Make sure you have the Vercel CLI installed and are logged in.');
          console.log('Run: npm i -g vercel && vercel login');
        }
      }
    }
    
    console.log('🚀 Firebase private key update process completed!');
    console.log('Deploy your application for the changes to take effect:');
    console.log('  vercel --prod');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main(); 