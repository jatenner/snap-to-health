require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

// Function to get private key from base64
function getPrivateKey() {
  try {
    const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
    
    if (!privateKeyBase64) {
      console.error('❌ FIREBASE_PRIVATE_KEY_BASE64 environment variable is not set');
      return null;
    }
    
    console.log(`Base64 private key length: ${privateKeyBase64.length} characters`);
    
    // Decode the base64 key
    const privateKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
    
    // Validate the decoded key
    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
      console.error('❌ Decoded private key is missing PEM header');
      return null;
    }
    
    if (!privateKey.includes('-----END PRIVATE KEY-----')) {
      console.error('❌ Decoded private key is missing PEM footer');
      return null;
    }
    
    // Log some info about the key (without revealing it)
    console.log(`✅ Private key decoded successfully`);
    console.log(`   - Contains PEM header: YES`);
    console.log(`   - Contains PEM footer: YES`);
    console.log(`   - Length: ${privateKey.length} characters`);
    console.log(`   - First 20 chars: ${privateKey.substring(0, 20)}...`);
    
    return privateKey;
  } catch (error) {
    console.error('❌ Error decoding private key:', error);
    return null;
  }
}

// Initialize Firebase Admin SDK
async function initializeAndTest() {
  try {
    console.log('Testing Firebase Admin SDK initialization...');
    
    // Check required environment variables
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    
    if (!projectId) {
      throw new Error('NEXT_PUBLIC_FIREBASE_PROJECT_ID is not set');
    }
    
    if (!clientEmail) {
      throw new Error('FIREBASE_CLIENT_EMAIL is not set');
    }
    
    // Get the private key
    const privateKey = getPrivateKey();
    if (!privateKey) {
      throw new Error('Failed to decode private key');
    }
    
    // Initialize Firebase Admin if no app exists
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey
        })
      });
      console.log('✅ Firebase Admin SDK initialized successfully');
    } else {
      console.log('ℹ️ Firebase Admin SDK already initialized');
    }
    
    // Test Firestore connection
    const db = admin.firestore();
    const timestamp = new Date().toISOString();
    
    console.log(`Writing test document to Firestore...`);
    const testDocRef = db.collection('admin_tests').doc('connection_test');
    
    await testDocRef.set({
      timestamp,
      message: 'Firebase Admin SDK connection test',
      success: true
    });
    
    console.log('✅ Successfully wrote to Firestore');
    
    // Read the document back
    const docSnapshot = await testDocRef.get();
    if (docSnapshot.exists) {
      console.log('✅ Successfully read from Firestore');
      console.log(`   - Test document data:`, docSnapshot.data());
    } else {
      console.error('❌ Failed to read test document');
    }
    
    console.log('✅ All tests passed! Firebase Admin SDK is correctly configured.');
    
  } catch (error) {
    console.error('❌ Firebase Admin test failed:', error);
    process.exit(1);
  }
}

// Run the test
initializeAndTest().catch(err => {
  console.error('❌ Unhandled error during test:', err);
  process.exit(1);
}); 