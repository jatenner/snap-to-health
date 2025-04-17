#!/usr/bin/env node

/**
 * Firebase Private Key Generator
 * 
 * This script extracts the private key from a Firebase service account JSON file
 * and generates the base64-encoded version needed for environment variables.
 * 
 * Usage:
 *   node generate-firebase-key.js <path-to-service-account.json>
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

/**
 * Extracts and encodes the Firebase private key from a service account file
 */
function generateFirebaseKeyFromServiceAccount(filePath) {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`${colors.red}Error: Service account file not found at ${filePath}${colors.reset}`);
      process.exit(1);
    }

    // Read the service account file
    console.log(`${colors.blue}Reading service account file: ${filePath}${colors.reset}`);
    const serviceAccount = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Validate required fields
    if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
      console.error(`${colors.red}Error: Invalid service account file - missing required fields${colors.reset}`);
      process.exit(1);
    }
    
    // Extract the key info
    const projectId = serviceAccount.project_id;
    const clientEmail = serviceAccount.client_email;
    const privateKey = serviceAccount.private_key;
    
    // Log information (safely)
    console.log(`\n${colors.cyan}${colors.bold}Firebase Service Account Information${colors.reset}`);
    console.log(`${colors.green}Project ID: ${projectId}${colors.reset}`);
    console.log(`${colors.green}Client Email: ${clientEmail}${colors.reset}`);
    
    // Validate the private key format
    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----') || 
        !privateKey.includes('-----END PRIVATE KEY-----')) {
      console.error(`${colors.red}Error: Private key doesn't appear to be in PEM format${colors.reset}`);
      process.exit(1);
    }
    
    // Encode the private key as base64
    const privateKeyBase64 = Buffer.from(privateKey).toString('base64');
    
    // Output the variables to be added to .env.local
    console.log(`\n${colors.cyan}${colors.bold}Firebase Environment Variables${colors.reset}`);
    console.log(`${colors.yellow}Add the following to your .env.local file:${colors.reset}\n`);
    console.log(`NEXT_PUBLIC_FIREBASE_PROJECT_ID=${projectId}`);
    console.log(`FIREBASE_CLIENT_EMAIL=${clientEmail}`);
    console.log(`FIREBASE_PRIVATE_KEY_BASE64=${privateKeyBase64}`);
    
    // Save the base64 key to a file for convenience
    const outputFilePath = path.join(process.cwd(), 'firebase-key-base64.txt');
    fs.writeFileSync(outputFilePath, privateKeyBase64);
    console.log(`\n${colors.green}✓ Base64 key saved to: ${outputFilePath}${colors.reset}`);
    
    // Output the environment variables to a .env.local.firebase file
    const envFilePath = path.join(process.cwd(), '.env.local.firebase');
    const envContent = `# Firebase Admin SDK configuration
NEXT_PUBLIC_FIREBASE_PROJECT_ID=${projectId}
FIREBASE_CLIENT_EMAIL=${clientEmail}
FIREBASE_PRIVATE_KEY_BASE64=${privateKeyBase64}
`;
    fs.writeFileSync(envFilePath, envContent);
    console.log(`${colors.green}✓ Environment variables saved to: ${envFilePath}${colors.reset}`);
    
    return {
      projectId,
      clientEmail,
      privateKeyBase64
    };
  } catch (error) {
    console.error(`${colors.red}Error processing service account: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Main function - handle command line arguments
function main() {
  const args = process.argv.slice(2);
  let serviceAccountPath;
  
  // If no path provided, look for common filenames
  if (args.length === 0) {
    console.log(`${colors.yellow}No service account file specified, looking for files in current directory...${colors.reset}`);
    
    const commonFilenames = [
      'firebase-service-account.json',
      'service-account.json',
      'firebase-adminsdk.json'
    ];
    
    for (const filename of commonFilenames) {
      const filePath = path.join(process.cwd(), filename);
      if (fs.existsSync(filePath)) {
        serviceAccountPath = filePath;
        console.log(`${colors.green}Found service account file: ${filename}${colors.reset}`);
        break;
      }
    }
    
    if (!serviceAccountPath) {
      console.error(`${colors.red}Error: No service account file found. Please specify the path:${colors.reset}`);
      console.log(`${colors.yellow}Usage: node ${path.basename(__filename)} <path-to-service-account.json>${colors.reset}`);
      process.exit(1);
    }
  } else {
    serviceAccountPath = args[0];
  }
  
  // Process the service account file
  generateFirebaseKeyFromServiceAccount(serviceAccountPath);
  
  console.log(`\n${colors.green}${colors.bold}✓ Firebase key generation complete!${colors.reset}`);
}

// Run the script
main(); 