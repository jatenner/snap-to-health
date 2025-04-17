#!/usr/bin/env node
/**
 * Firebase Private Key Fixer and Encoder
 * 
 * This script helps fix and encode Firebase private keys, addressing common issues:
 * 1. Missing newlines in the private key
 * 2. Escaped newlines that need to be converted to actual newlines
 * 3. Improper PEM formatting
 * 
 * Run with: node scripts/fixPrivateKey.js
 * 
 * The script will prompt you to paste your private key or load it from a file.
 */

const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { Buffer } = require('buffer');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to properly format a private key
function formatPrivateKey(key) {
  // Remove any whitespace and quotation marks
  let formatted = key.trim().replace(/^['"]|['"]$/g, '');
  
  // Handle escaped newlines (\\n) - convert to actual newlines
  formatted = formatted.replace(/\\n/g, '\n');
  
  // Ensure proper PEM format with headers and footers
  if (!formatted.includes('-----BEGIN PRIVATE KEY-----')) {
    formatted = '-----BEGIN PRIVATE KEY-----\n' + formatted;
  }
  
  if (!formatted.includes('-----END PRIVATE KEY-----')) {
    formatted = formatted + '\n-----END PRIVATE KEY-----';
  }
  
  // Ensure there's a newline after the header and before the footer
  formatted = formatted.replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n');
  formatted = formatted.replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----');
  
  // Handle case where key content might be on a single line
  // PEM format usually has lines of about 64 characters
  if (!formatted.includes('\n')) {
    let parts = formatted.split('-----');
    if (parts.length >= 3) {
      let header = '-----' + parts[1] + '-----\n';
      let content = parts[2].replace('END PRIVATE KEY', '');
      let footer = '-----END PRIVATE KEY-----';
      
      // Insert newlines every 64 characters in the content
      let formattedContent = '';
      for (let i = 0; i < content.length; i += 64) {
        formattedContent += content.substr(i, 64) + '\n';
      }
      
      formatted = header + formattedContent + footer;
    }
  }
  
  return formatted;
}

// Function to encode a private key as base64
function encodeKeyAsBase64(key) {
  return Buffer.from(key).toString('base64');
}

// Function to save environment variables to a file
function saveToEnvFile(base64Key, originalKey) {
  const envContent = `# Firebase Admin SDK private key (base64 encoded)
# Generated on ${new Date().toISOString()}
FIREBASE_PRIVATE_KEY_BASE64="${base64Key}"

# Original private key format (for reference only, DO NOT USE)
# FIREBASE_PRIVATE_KEY="${originalKey.replace(/\n/g, '\\n')}"
`;

  // Save to a file
  const outputPath = path.join(process.cwd(), 'firebase-key.env');
  fs.writeFileSync(outputPath, envContent);
  
  console.log(`\n✅ Saved environment variables to: ${outputPath}`);
  console.log('Add the FIREBASE_PRIVATE_KEY_BASE64 value to your .env.local file');
}

// Function to validate a private key format
function validatePrivateKey(key) {
  const hasPemHeader = key.includes('-----BEGIN PRIVATE KEY-----');
  const hasPemFooter = key.includes('-----END PRIVATE KEY-----');
  const hasNewlines = key.includes('\n');
  const newlineCount = (key.match(/\n/g) || []).length;
  
  console.log('\n🔍 Private key validation:');
  console.log(`- Contains PEM header: ${hasPemHeader ? '✅' : '❌'}`);
  console.log(`- Contains PEM footer: ${hasPemFooter ? '✅' : '❌'}`);
  console.log(`- Contains newlines: ${hasNewlines ? `✅ (${newlineCount} found)` : '❌'}`);
  console.log(`- Key length: ${key.length} characters`);
  
  const isValid = hasPemHeader && hasPemFooter && hasNewlines;
  console.log(`- Overall format: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
  
  return isValid;
}

// Function to display the before/after comparison
function displayComparison(original, fixed) {
  console.log('\n📋 Key Comparison:');
  
  console.log('\nORIGINAL KEY:');
  console.log('--------------');
  console.log(original.substring(0, 200) + (original.length > 200 ? '...' : ''));
  
  console.log('\nFIXED KEY:');
  console.log('--------------');
  console.log(fixed.substring(0, 200) + (fixed.length > 200 ? '...' : ''));
  
  console.log('\nChanges made:');
  const originalHasEscapedNewlines = original.includes('\\n');
  const fixedHasRealNewlines = fixed.includes('\n');
  const headerAdded = !original.includes('-----BEGIN PRIVATE KEY-----') && fixed.includes('-----BEGIN PRIVATE KEY-----');
  const footerAdded = !original.includes('-----END PRIVATE KEY-----') && fixed.includes('-----END PRIVATE KEY-----');
  
  if (originalHasEscapedNewlines) console.log('- Converted escaped newlines (\\n) to actual newlines');
  if (headerAdded) console.log('- Added missing PEM header');
  if (footerAdded) console.log('- Added missing PEM footer');
  if (!original.includes('\n') && fixedHasRealNewlines) console.log('- Formatted key content with proper line breaks');
}

// Function to process the private key
function processKey(privateKey) {
  console.log('\n🔍 Processing private key...');
  
  // Validate original key
  console.log('\n📋 Original Key Analysis:');
  validatePrivateKey(privateKey);
  
  // Fix the key format
  const fixedKey = formatPrivateKey(privateKey);
  
  // Validate the fixed key
  console.log('\n📋 Fixed Key Analysis:');
  const isValid = validatePrivateKey(fixedKey);
  
  // Show comparison
  displayComparison(privateKey, fixedKey);
  
  if (!isValid) {
    console.error('\n❌ The key still doesn\'t appear to be in the correct format.');
    console.error('Please make sure you\'re using a valid PEM private key from a Firebase service account.');
    
    rl.question('\nDo you want to continue anyway? (y/n): ', (answer) => {
      if (answer.toLowerCase() === 'y') {
        encodeAndSave(fixedKey, privateKey);
      } else {
        console.log('Operation cancelled.');
        rl.close();
      }
    });
  } else {
    encodeAndSave(fixedKey, privateKey);
  }
}

// Function to encode and save the key
function encodeAndSave(fixedKey, originalKey) {
  // Encode the fixed key
  const base64Key = encodeKeyAsBase64(fixedKey);
  
  console.log('\n📋 Base64 Encoded Key:');
  console.log(base64Key.substring(0, 100) + '...');
  console.log(`Length: ${base64Key.length} characters`);
  
  // Save to file
  rl.question('\nSave this key to environment file? (y/n): ', (answer) => {
    if (answer.toLowerCase() === 'y') {
      saveToEnvFile(base64Key, originalKey);
    }
    
    console.log('\n✅ Done!');
    console.log('\nTo use this key:');
    console.log('1. Add FIREBASE_PRIVATE_KEY_BASE64 to your .env.local file');
    console.log('2. Make sure src/lib/firebaseAdmin.ts is configured to use this environment variable');
    
    rl.close();
  });
}

// Function to process input from a file
function processFromFile(filePath) {
  try {
    const privateKey = fs.readFileSync(filePath, 'utf8');
    processKey(privateKey);
  } catch (error) {
    console.error(`❌ Error reading file: ${error.message}`);
    promptForKey();
  }
}

// Function to prompt user for key input
function promptForKey() {
  console.log('\nEnter your private key (paste it below and press Enter, then Ctrl+D when done):');
  let privateKey = '';
  
  process.stdin.on('data', (chunk) => {
    privateKey += chunk;
  });
  
  process.stdin.on('end', () => {
    processKey(privateKey.trim());
  });
  
  // Need to pause readline to allow stdin events
  rl.pause();
}

// Main menu
function showMainMenu() {
  console.log('🔐 Firebase Private Key Fixer and Encoder');
  console.log('=======================================');
  console.log('This tool will help you fix and encode your Firebase private key.');
  
  rl.question('\nHow would you like to input your private key?\n1. Paste private key\n2. Load from file\nChoose (1/2): ', (answer) => {
    if (answer === '1') {
      rl.close();  // Close the readline interface
      promptForKey();
    } else if (answer === '2') {
      rl.question('Enter path to private key file: ', (filePath) => {
        processFromFile(filePath);
      });
    } else {
      console.log('Invalid choice. Please select 1 or 2.');
      showMainMenu();
    }
  });
}

// Start the program
showMainMenu(); 