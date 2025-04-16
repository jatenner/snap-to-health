#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Find the Firebase service account file
function findServiceAccountFile() {
  // Common locations for service account files
  const possiblePaths = [
    './',
    './src/',
    './config/',
    './secrets/'
  ];
  
  // Patterns to search for
  const patterns = [
    '*firebase*adminsdk*.json',
    '*service-account*.json',
    '*serviceAccount*.json'
  ];
  
  for (const dir of possiblePaths) {
    for (const pattern of patterns) {
      const files = glob.sync(path.join(dir, pattern));
      if (files.length > 0) {
        return files[0];
      }
    }
  }
  
  return null;
}

function main() {
  try {
    console.log('🔍 Looking for Firebase service account file...');
    
    // Find service account file
    const serviceAccountPath = findServiceAccountFile();
    
    if (!serviceAccountPath) {
      console.error('❌ No Firebase service account file found.');
      console.log('Please place your service account JSON file in the project root or src directory.');
      console.log('The file name should contain "firebase" and "adminsdk".');
      process.exit(1);
    }
    
    console.log(`✅ Found service account file: ${serviceAccountPath}`);
    
    // Read the service account file
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    
    if (!serviceAccount.private_key) {
      console.error('❌ No private_key found in the service account file.');
      process.exit(1);
    }
    
    const privateKey = serviceAccount.private_key;
    console.log(`✅ Found private key (length: ${privateKey.length} characters)`);
    
    // Encode the private key to base64
    const base64Key = Buffer.from(privateKey).toString('base64');
    
    console.log('\nBase64 encoded key (for FIREBASE_PRIVATE_KEY_BASE64):');
    console.log(base64Key);
    
    console.log('\nTo update in Vercel, run:');
    console.log('vercel env add FIREBASE_PRIVATE_KEY_BASE64 production');
    console.log('Then paste the Base64 key above when prompted.');
    console.log('\nOr use our helper script:');
    console.log('node src/scripts/updateVercelEnv.js');
    
    // Return the base64 key (useful if this script is imported)
    return base64Key;
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// If running directly
if (require.main === module) {
  main();
}

module.exports = main; 