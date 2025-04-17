#!/usr/bin/env node

/**
 * This script reads a Firebase service account JSON file and generates
 * the properly encoded FIREBASE_PRIVATE_KEY_BASE64 environment variable
 * for use in .env.local and Vercel environment variables.
 * 
 * Usage:
 * node scripts/encode-firebase-key.js /path/to/firebase-service-account.json
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes for terminal output
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

// Get the file path from command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log(`${COLORS.bright}${COLORS.yellow}No file path provided.${COLORS.reset}`);
  console.log(`Looking for service account JSON in the current directory...`);
  
  // Try to find common service account file names
  const commonNames = [
    'firebase-service-account.json',
    'firebase-adminsdk.json',
    'service-account.json',
    'firebase-admin-key.json'
  ];
  
  let foundFile = null;
  for (const name of commonNames) {
    if (fs.existsSync(name)) {
      foundFile = name;
      console.log(`${COLORS.green}Found service account file: ${name}${COLORS.reset}`);
      break;
    }
  }
  
  if (!foundFile) {
    console.error(`${COLORS.red}Error: No service account file found.${COLORS.reset}`);
    console.log(`Please provide the path to your Firebase service account JSON file:`);
    console.log(`  node scripts/encode-firebase-key.js /path/to/firebase-service-account.json`);
    process.exit(1);
  }
  
  args[0] = foundFile;
}

const filePath = args[0];

// Check if the file exists
if (!fs.existsSync(filePath)) {
  console.error(`${COLORS.red}Error: File not found at ${filePath}${COLORS.reset}`);
  process.exit(1);
}

// Read and parse the service account file
try {
  console.log(`${COLORS.blue}Reading service account file: ${filePath}${COLORS.reset}`);
  const fileContents = fs.readFileSync(filePath, 'utf8');
  const serviceAccount = JSON.parse(fileContents);
  
  // Check if it's a valid service account file
  if (!serviceAccount.private_key || !serviceAccount.client_email || !serviceAccount.project_id) {
    console.error(`${COLORS.red}Error: The file does not appear to be a valid Firebase service account JSON.${COLORS.reset}`);
    console.log('The file should contain private_key, client_email, and project_id fields.');
    process.exit(1);
  }
  
  // Extract the private key
  const privateKey = serviceAccount.private_key;
  
  // Verify the private key format
  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----') || !privateKey.includes('-----END PRIVATE KEY-----')) {
    console.error(`${COLORS.red}Warning: The private key does not have the expected PEM format.${COLORS.reset}`);
    console.log('It should contain "-----BEGIN PRIVATE KEY-----" and "-----END PRIVATE KEY-----"');
  }
  
  // Count newlines in the private key
  const newlineCount = (privateKey.match(/\n/g) || []).length;
  if (newlineCount < 2) {
    console.error(`${COLORS.red}Warning: The private key should contain multiple newlines (${newlineCount} found).${COLORS.reset}`);
  }
  
  // Base64 encode the private key
  const privateKeyBase64 = Buffer.from(privateKey).toString('base64');
  
  // Output the results
  console.log(`\n${COLORS.bright}${COLORS.green}Service Account Information:${COLORS.reset}`);
  console.log(`Project ID: ${serviceAccount.project_id}`);
  console.log(`Client Email: ${serviceAccount.client_email}`);
  console.log(`Private Key Length: ${privateKey.length} characters`);
  console.log(`Private Key Newlines: ${newlineCount}`);
  
  console.log(`\n${COLORS.bright}${COLORS.green}Base64 Encoded Private Key:${COLORS.reset}`);
  console.log(privateKeyBase64);
  
  console.log(`\n${COLORS.bright}${COLORS.blue}Copy the following line to your .env.local file:${COLORS.reset}`);
  console.log(`FIREBASE_PRIVATE_KEY_BASE64=${privateKeyBase64}`);
  
  // Try to update .env.local.firebase if it exists
  const envFirebasePath = path.join(process.cwd(), '.env.local.firebase');
  if (fs.existsSync(envFirebasePath)) {
    console.log(`\n${COLORS.bright}${COLORS.blue}Updating .env.local.firebase file...${COLORS.reset}`);
    let envContent = fs.readFileSync(envFirebasePath, 'utf8');
    const regex = /^FIREBASE_PRIVATE_KEY_BASE64=.*/m;
    
    if (regex.test(envContent)) {
      // Update existing entry
      envContent = envContent.replace(regex, `FIREBASE_PRIVATE_KEY_BASE64=${privateKeyBase64}`);
      console.log(`${COLORS.green}Updated existing FIREBASE_PRIVATE_KEY_BASE64 entry.${COLORS.reset}`);
    } else {
      // Append new entry
      envContent += `\nFIREBASE_PRIVATE_KEY_BASE64=${privateKeyBase64}`;
      console.log(`${COLORS.green}Added new FIREBASE_PRIVATE_KEY_BASE64 entry.${COLORS.reset}`);
    }
    
    // Write updated content
    fs.writeFileSync(envFirebasePath, envContent);
    console.log(`${COLORS.green}Successfully updated .env.local.firebase file.${COLORS.reset}`);
  }
  
  console.log(`\n${COLORS.bright}${COLORS.blue}For Vercel, add this environment variable:${COLORS.reset}`);
  console.log(`Name: FIREBASE_PRIVATE_KEY_BASE64`);
  console.log(`Value: ${privateKeyBase64}`);
  
  console.log(`\n${COLORS.bright}${COLORS.green}Done! 🎉${COLORS.reset}`);
  
} catch (error) {
  console.error(`${COLORS.red}Error processing service account file:${COLORS.reset}`, error);
  process.exit(1);
} 