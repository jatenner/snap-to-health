require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Function to verify and log all Firebase configurations
async function verifyFirebaseConfigs() {
  console.log('=== FIREBASE CONFIGURATION VERIFICATION ===');
  
  // Check .env.local file variables
  console.log('\n1. Verifying environment variables:');
  
  const requiredWebVariables = [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'NEXT_PUBLIC_FIREBASE_APP_ID'
  ];
  
  const requiredAdminVariables = [
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_CLIENT_ID',
    'FIREBASE_PRIVATE_KEY_BASE64'
  ];
  
  // Verify Web SDK variables
  console.log('\n🔎 Web SDK Environment Variables:');
  requiredWebVariables.forEach(varName => {
    const value = process.env[varName];
    console.log(`  ${varName}: ${value ? '✅ Present' : '❌ Missing'}`);
    
    if (value && varName === 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET') {
      if (value === 'snaphealth-39b14.appspot.com') {
        console.log(`    ✓ Storage bucket format is correctly set to appspot.com`);
      } else {
        console.log(`    ❌ Storage bucket format should be snaphealth-39b14.appspot.com but is ${value}`);
      }
    }
  });
  
  // Verify Admin SDK variables
  console.log('\n🔎 Admin SDK Environment Variables:');
  requiredAdminVariables.forEach(varName => {
    const value = process.env[varName];
    console.log(`  ${varName}: ${value ? '✅ Present' : '❌ Missing'}`);
    
    if (value && varName === 'FIREBASE_PRIVATE_KEY_BASE64') {
      console.log(`    ✓ Key length: ${value.length} characters`);
      
      try {
        const decodedKey = Buffer.from(value, 'base64').toString('utf8');
        const keyIsValid = 
          decodedKey.includes('-----BEGIN PRIVATE KEY-----') && 
          decodedKey.includes('-----END PRIVATE KEY-----');
        
        console.log(`    ${keyIsValid ? '✓ Key appears to be valid' : '❌ Key format invalid'}`);
      } catch (err) {
        console.log(`    ❌ Failed to decode key: ${err.message}`);
      }
    }
  });
  
  // Verify service account file
  const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');
  console.log('\n2. Verifying service account file:');
  
  try {
    const fileExists = fs.existsSync(serviceAccountPath);
    console.log(`  Service account file: ${fileExists ? '✅ Present' : '❌ Missing'}`);
    
    if (fileExists) {
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      console.log(`  Project ID: ${serviceAccount.project_id === 'snaphealth-39b14' ? '✅ Correct' : '❌ Incorrect'}`);
      console.log(`  Client Email: ${serviceAccount.client_email === 'firebase-adminsdk-fbsvc@snaphealth-39b14.iam.gserviceaccount.com' ? '✅ Correct' : '❌ Incorrect'}`);
      console.log(`  Client ID: ${serviceAccount.client_id === '115934821794605256140' ? '✅ Correct' : '❌ Incorrect'}`);
      console.log(`  Private Key: ${serviceAccount.private_key.startsWith('-----BEGIN PRIVATE KEY-----') ? '✅ Present' : '❌ Invalid'}`);
    }
  } catch (err) {
    console.log(`  ❌ Error reading service account file: ${err.message}`);
  }
  
  // Try to initialize and use Firebase Admin
  console.log('\n3. Testing Firebase Admin initialization:');
  
  try {
    if (admin.apps.length > 0) {
      console.log('  ℹ️ Firebase Admin already initialized');
    } else {
      const privateKey = Buffer.from(process.env.FIREBASE_PRIVATE_KEY_BASE64, 'base64').toString('utf8');
      
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: privateKey
        }),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
      });
      
      console.log('  ✅ Firebase Admin SDK initialized successfully');
    }
    
    // Test Firestore
    const db = admin.firestore();
    const testDocRef = db.collection('config_verification').doc('test_' + Date.now());
    
    await testDocRef.set({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      message: 'Configuration verification test'
    });
    
    console.log('  ✅ Firestore write test succeeded');
    
    // Read the document back
    const docSnapshot = await testDocRef.get();
    if (docSnapshot.exists) {
      console.log('  ✅ Firestore read test succeeded');
    } else {
      console.log('  ❌ Firestore read test failed - document not found');
    }
    
  } catch (err) {
    console.log(`  ❌ Firebase Admin test failed: ${err.message}`);
    console.log(`  Stack: ${err.stack}`);
  }
  
  console.log('\n=== VERIFICATION COMPLETE ===');
}

// Run the verification
verifyFirebaseConfigs().catch(err => {
  console.error('Error during verification:', err);
  process.exit(1);
}); 