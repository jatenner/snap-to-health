#!/usr/bin/env node

/**
 * Firebase Environment Setup Script
 * 
 * This script sets up the Firebase environment variables for deployment.
 * It copies the values from the service account JSON file to the .env.local and .env.local.firebase files.
 * 
 * Usage:
 *   node scripts/setup-firebase-env.js [path/to/service-account.json]
 * 
 * If no path is provided, it will search for a file matching *firebase*adminsdk*.json in the current directory.
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

// Helper for colored console output
const log = {
  info: (msg) => console.log(`${colors.blue}ℹ️ ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  header: (msg) => console.log(`\n${colors.bold}${colors.cyan}${msg}${colors.reset}\n`)
};

// Find the service account file
function findServiceAccountFile() {
  let serviceAccountPath = null;
  
  // Check if a path was provided as a command-line argument
  if (process.argv.length > 2) {
    serviceAccountPath = process.argv[2];
    if (fs.existsSync(serviceAccountPath)) {
      return serviceAccountPath;
    } else {
      log.error(`Service account file not found at: ${serviceAccountPath}`);
      process.exit(1);
    }
  }
  
  // Look for a file matching the pattern in the current directory
  log.info('No service account path provided, searching for a file in the current directory...');
  const files = fs.readdirSync('.');
  const serviceAccountFile = files.find(file => 
    file.includes('firebase') && 
    file.includes('adminsdk') && 
    file.endsWith('.json')
  );
  
  if (serviceAccountFile) {
    serviceAccountPath = path.join('.', serviceAccountFile);
    log.success(`Found service account file: ${serviceAccountFile}`);
    return serviceAccountPath;
  }
  
  log.error('No service account file found. Please provide a path to the service account JSON file.');
  process.exit(1);
}

// Read the service account file
function readServiceAccount(serviceAccountPath) {
  try {
    log.info(`Reading service account file: ${serviceAccountPath}`);
    const serviceAccountRaw = fs.readFileSync(serviceAccountPath, 'utf8');
    return JSON.parse(serviceAccountRaw);
  } catch (error) {
    log.error(`Failed to read or parse service account file: ${error.message}`);
    process.exit(1);
  }
}

// Encode the private key as base64
function encodePrivateKey(privateKey) {
  return Buffer.from(privateKey).toString('base64');
}

// Update or create the .env.local.firebase file
function updateFirebaseEnvFile(serviceAccount, privateKeyBase64) {
  const envPath = path.join('.', '.env.local.firebase');
  
  log.info(`Updating ${envPath}...`);
  
  const envContent = `# Firebase Client Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyDQzBnFnrPJbxi2-hFmuQd2bDVRo2ikHiU
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${serviceAccount.project_id}.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=${serviceAccount.project_id}
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${serviceAccount.project_id}.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1026207510687
NEXT_PUBLIC_FIREBASE_APP_ID=1:1026207510687:web:1fa5f82f2f80dbfca32431
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-8ZSG6TMYYE

# Firebase Admin Configuration
FIREBASE_CLIENT_EMAIL=${serviceAccount.client_email}
FIREBASE_CLIENT_ID=${serviceAccount.client_id}

# IMPORTANT: Use the base64 encoded version of your private key
# Generate this with: node scripts/encode-firebase-key.js or use the following value directly
FIREBASE_PRIVATE_KEY_BASE64=${privateKeyBase64}
`;

  fs.writeFileSync(envPath, envContent);
  log.success(`Successfully updated ${envPath}`);
}

// Update the Firebase variables in .env.local file
function updateEnvLocalFile(serviceAccount, privateKeyBase64) {
  const envPath = path.join('.', '.env.local');
  let envContent = '';
  
  log.info(`Updating Firebase variables in ${envPath}...`);
  
  // Check if the file exists
  if (fs.existsSync(envPath)) {
    // Read the existing file
    const existingContent = fs.readFileSync(envPath, 'utf8');
    
    // Replace or add Firebase-related variables
    const lines = existingContent.split('\n');
    let updatedLines = [];
    let inFirebaseSection = false;
    let firebaseSectionAdded = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip Firebase-related lines
      if (line.startsWith('NEXT_PUBLIC_FIREBASE_') || 
          line.startsWith('FIREBASE_CLIENT_') || 
          line.startsWith('FIREBASE_PRIVATE_KEY_BASE64')) {
        inFirebaseSection = true;
        continue;
      }
      
      // Add Firebase section when we reach the end of the existing Firebase section
      if (inFirebaseSection && !line.startsWith('FIREBASE_') && !firebaseSectionAdded) {
        updatedLines.push('');
        updatedLines.push('# Firebase Client Configuration');
        updatedLines.push(`NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyDQzBnFnrPJbxi2-hFmuQd2bDVRo2ikHiU`);
        updatedLines.push(`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${serviceAccount.project_id}.firebaseapp.com`);
        updatedLines.push(`NEXT_PUBLIC_FIREBASE_PROJECT_ID=${serviceAccount.project_id}`);
        updatedLines.push(`NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${serviceAccount.project_id}.appspot.com`);
        updatedLines.push(`NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1026207510687`);
        updatedLines.push(`NEXT_PUBLIC_FIREBASE_APP_ID=1:1026207510687:web:1fa5f82f2f80dbfca32431`);
        updatedLines.push(`NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-8ZSG6TMYYE`);
        updatedLines.push('');
        updatedLines.push('# Firebase Admin Configuration');
        updatedLines.push(`FIREBASE_CLIENT_EMAIL=${serviceAccount.client_email}`);
        updatedLines.push(`FIREBASE_CLIENT_ID=${serviceAccount.client_id}`);
        updatedLines.push(`FIREBASE_PRIVATE_KEY_BASE64=${privateKeyBase64}`);
        
        inFirebaseSection = false;
        firebaseSectionAdded = true;
      }
      
      updatedLines.push(line);
    }
    
    // If Firebase section wasn't added (because it didn't exist before), add it at the end
    if (!firebaseSectionAdded) {
      updatedLines.push('');
      updatedLines.push('# Firebase Client Configuration');
      updatedLines.push(`NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyDQzBnFnrPJbxi2-hFmuQd2bDVRo2ikHiU`);
      updatedLines.push(`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${serviceAccount.project_id}.firebaseapp.com`);
      updatedLines.push(`NEXT_PUBLIC_FIREBASE_PROJECT_ID=${serviceAccount.project_id}`);
      updatedLines.push(`NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${serviceAccount.project_id}.appspot.com`);
      updatedLines.push(`NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1026207510687`);
      updatedLines.push(`NEXT_PUBLIC_FIREBASE_APP_ID=1:1026207510687:web:1fa5f82f2f80dbfca32431`);
      updatedLines.push(`NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-8ZSG6TMYYE`);
      updatedLines.push('');
      updatedLines.push('# Firebase Admin Configuration');
      updatedLines.push(`FIREBASE_CLIENT_EMAIL=${serviceAccount.client_email}`);
      updatedLines.push(`FIREBASE_CLIENT_ID=${serviceAccount.client_id}`);
      updatedLines.push(`FIREBASE_PRIVATE_KEY_BASE64=${privateKeyBase64}`);
    }
    
    envContent = updatedLines.join('\n');
  } else {
    // Create a new file with just the Firebase variables
    envContent = `# Firebase Client Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyDQzBnFnrPJbxi2-hFmuQd2bDVRo2ikHiU
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${serviceAccount.project_id}.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=${serviceAccount.project_id}
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${serviceAccount.project_id}.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1026207510687
NEXT_PUBLIC_FIREBASE_APP_ID=1:1026207510687:web:1fa5f82f2f80dbfca32431
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-8ZSG6TMYYE

# Firebase Admin Configuration
FIREBASE_CLIENT_EMAIL=${serviceAccount.client_email}
FIREBASE_CLIENT_ID=${serviceAccount.client_id}
FIREBASE_PRIVATE_KEY_BASE64=${privateKeyBase64}
`;
  }
  
  fs.writeFileSync(envPath, envContent);
  log.success(`Successfully updated Firebase variables in ${envPath}`);
}

// Main function
function main() {
  log.header('Firebase Environment Setup');
  
  // Find and read the service account file
  const serviceAccountPath = findServiceAccountFile();
  const serviceAccount = readServiceAccount(serviceAccountPath);
  
  // Encode the private key
  const privateKeyBase64 = encodePrivateKey(serviceAccount.private_key);
  
  // Display service account info
  log.header('Service Account Information');
  log.info(`Project ID: ${serviceAccount.project_id}`);
  log.info(`Client Email: ${serviceAccount.client_email}`);
  log.info(`Private Key ID: ${serviceAccount.private_key_id}`);
  log.info(`Private Key Length: ${serviceAccount.private_key.length} characters`);
  log.info(`Base64 Encoded Key Length: ${privateKeyBase64.length} characters`);
  
  // Update the environment files
  updateFirebaseEnvFile(serviceAccount, privateKeyBase64);
  updateEnvLocalFile(serviceAccount, privateKeyBase64);
  
  log.header('Summary for Vercel Deployment');
  log.info('Add these environment variables to your Vercel project:');
  log.info(`FIREBASE_CLIENT_EMAIL = ${serviceAccount.client_email}`);
  log.info(`FIREBASE_CLIENT_ID = ${serviceAccount.client_id}`);
  log.info(`NEXT_PUBLIC_FIREBASE_PROJECT_ID = ${serviceAccount.project_id}`);
  log.info('FIREBASE_PRIVATE_KEY_BASE64 = [base64-encoded-private-key]');
  
  log.success('Firebase environment setup complete!');
}

// Run the script
main(); 