#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });
const OpenAI = require('openai');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// ANSI color codes for colorful console output
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
};

// ----- Helper functions -----
function printHeader(text) {
  console.log(`\n${COLORS.bright}${COLORS.blue}===== ${text} =====${COLORS.reset}\n`);
}

function printSuccess(text) {
  console.log(`${COLORS.green}✓ ${text}${COLORS.reset}`);
}

function printError(text) {
  console.log(`${COLORS.red}✗ ${text}${COLORS.reset}`);
}

function printWarning(text) {
  console.log(`${COLORS.yellow}⚠ ${text}${COLORS.reset}`);
}

function printInfo(text) {
  console.log(`${COLORS.cyan}ℹ ${text}${COLORS.reset}`);
}

// ----- OpenAI Key Verification -----
async function verifyOpenAIKey() {
  printHeader('OPENAI API KEY VERIFICATION');
  
  const openAIApiKey = process.env.OPENAI_API_KEY;
  
  if (!openAIApiKey) {
    printError('OPENAI_API_KEY is not set in your .env.local file');
    return false;
  }
  
  // Basic format check
  if (!openAIApiKey.startsWith('sk-')) {
    printError(`OPENAI_API_KEY has invalid format (should start with 'sk-'): ${openAIApiKey.substring(0, 5)}...`);
    return false;
  }
  
  printInfo(`API Key format check: ${openAIApiKey.substring(0, 10)}...`);
  
  // Check if it's the new API key format (sk-proj-...)
  if (openAIApiKey.startsWith('sk-proj-')) {
    printInfo('Using Project API Key format (sk-proj-...) for OpenAI - this is the correct format for GPT-4 Vision');
  } else if (openAIApiKey.startsWith('sk-org-')) {
    printWarning('Using Organization API Key format (sk-org-...) - this may not have access to GPT-4 Vision');
  } else {
    printInfo('Using legacy API Key format - this may not have access to GPT-4 Vision');
  }
  
  // Test API key by making a simple request
  try {
    const openai = new OpenAI({ apiKey: openAIApiKey });
    printInfo('Attempting to list available models...');
    
    const response = await openai.models.list();
    
    if (response.data && response.data.length > 0) {
      printSuccess(`OpenAI API key verified successfully! Found ${response.data.length} available models.`);
      
      // Check if gpt-4-vision-preview is available
      const visionModel = response.data.find(model => model.id === 'gpt-4-vision-preview');
      if (visionModel) {
        printSuccess('gpt-4-vision-preview model is available with this API key');
      } else {
        printWarning('gpt-4-vision-preview model NOT found among available models - your app may fall back to GPT-3.5');
        printInfo('Available models:');
        response.data.slice(0, 5).forEach(model => {
          console.log(`  - ${model.id}`);
        });
        if (response.data.length > 5) {
          console.log(`  - ... and ${response.data.length - 5} more`);
        }
      }
      
      return true;
    } else {
      printWarning('API key seems valid but no models were returned');
      return false;
    }
  } catch (error) {
    printError(`Failed to verify OpenAI API key: ${error.message}`);
    
    if (error.status === 401) {
      printError('API key is invalid or revoked (401 Unauthorized)');
    } else if (error.status === 403) {
      printError('API key is valid but lacks permissions (403 Forbidden)');
    }
    
    return false;
  }
}

// ----- Firebase Private Key Verification -----
async function verifyFirebasePrivateKey() {
  printHeader('FIREBASE PRIVATE KEY VERIFICATION');
  
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
  
  if (!projectId) {
    printError('NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set in your .env.local file');
    return false;
  }
  
  if (!clientEmail) {
    printError('FIREBASE_CLIENT_EMAIL is not set in your .env.local file');
    return false;
  }
  
  if (!privateKeyBase64) {
    printError('FIREBASE_PRIVATE_KEY_BASE64 is not set in your .env.local file');
    return false;
  }
  
  printInfo(`Project ID: ${projectId}`);
  printInfo(`Client Email: ${clientEmail.substring(0, 5)}...`);
  
  // Check base64 key length
  const keyLength = privateKeyBase64.length;
  printInfo(`Base64 key length: ${keyLength} characters`);
  
  if (keyLength < 100) {
    printError('Base64 key seems too short - it may be truncated');
    return false;
  }
  
  // Decode the key
  try {
    const decodedKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
    
    // Validate PEM format
    const hasPemHeader = decodedKey.includes('-----BEGIN PRIVATE KEY-----');
    const hasPemFooter = decodedKey.includes('-----END PRIVATE KEY-----');
    const hasNewlines = decodedKey.includes('\n');
    const newlineCount = (decodedKey.match(/\n/g) || []).length;
    
    printInfo('Decoded private key validation:');
    console.log(`  - Contains PEM header: ${hasPemHeader ? '✅' : '❌'}`);
    console.log(`  - Contains PEM footer: ${hasPemFooter ? '✅' : '❌'}`);
    console.log(`  - Contains newlines: ${hasNewlines ? `✅ (${newlineCount} found)` : '❌'}`);
    console.log(`  - Decoded length: ${decodedKey.length} characters`);
    
    if (!hasPemHeader || !hasPemFooter) {
      printError('Decoded key is not in valid PEM format (missing header/footer)');
      return false;
    }
    
    if (!hasNewlines) {
      printError('Decoded key is missing newlines, which are required for proper PEM format');
      return false;
    }
    
    // Test the key by initializing Firebase Admin
    try {
      printInfo('Attempting to initialize Firebase Admin with the decoded key...');
      
      const app = initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: decodedKey,
        }),
      }, 'verify-script');
      
      printSuccess('Firebase Admin initialized successfully!');
      
      // Try to connect to Firestore to fully verify
      try {
        const db = getFirestore(app);
        const testDoc = db.collection('_verify_test').doc('test');
        
        printInfo('Attempting to access Firestore...');
        await testDoc.get();
        
        printSuccess('Successfully connected to Firestore!');
        return true;
      } catch (firestoreError) {
        printError(`Failed to connect to Firestore: ${firestoreError.message}`);
        return false;
      }
    } catch (initError) {
      printError(`Failed to initialize Firebase Admin: ${initError.message}`);
      return false;
    }
  } catch (decodeError) {
    printError(`Failed to decode base64 private key: ${decodeError.message}`);
    return false;
  }
}

// ----- Main Function -----
async function main() {
  console.log(`${COLORS.bright}${COLORS.magenta}=================================================`);
  console.log(`              ENVIRONMENT KEY VERIFICATION`);
  console.log(`==================================================${COLORS.reset}`);
  
  const openaiResult = await verifyOpenAIKey();
  const firebaseResult = await verifyFirebasePrivateKey();
  
  console.log('\n');
  printHeader('VERIFICATION RESULTS');
  
  if (openaiResult) {
    printSuccess('OpenAI API Key: VALID');
  } else {
    printError('OpenAI API Key: INVALID or ISSUE DETECTED');
  }
  
  if (firebaseResult) {
    printSuccess('Firebase Private Key: VALID');
  } else {
    printError('Firebase Private Key: INVALID or ISSUE DETECTED');
  }
  
  if (openaiResult && firebaseResult) {
    console.log(`\n${COLORS.bgGreen}${COLORS.bright} All keys verified successfully! ${COLORS.reset}\n`);
  } else {
    console.log(`\n${COLORS.bgRed}${COLORS.bright} Some keys failed verification. See detailed logs above. ${COLORS.reset}\n`);
    
    if (!openaiResult) {
      printInfo('To fix OpenAI API key issues:');
      console.log('1. Ensure you\'re using a Project API Key (sk-proj-...) from OpenAI');
      console.log('2. Verify the key has access to GPT-4 Vision models');
      console.log('3. Update .env.local and Vercel environment variables');
    }
    
    if (!firebaseResult) {
      printInfo('To fix Firebase Private Key issues:');
      console.log('1. Download a fresh service account key from Firebase Console');
      console.log('2. Run the script below to properly encode it:');
      console.log('   node scripts/regenerate-firebase-key.js');
      console.log('3. Update both .env.local and Vercel environment variables with the new key');
    }
  }
}

// Run the script
main().catch(error => {
  console.error('Script failed with error:', error);
  process.exit(1);
}); 