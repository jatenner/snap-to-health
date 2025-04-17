// Script to verify Firebase Admin initialization
require('dotenv').config({ path: '.env.local' });
const admin = require('firebase-admin');

console.log('🔍 Verifying Firebase Admin initialization');

try {
  // Extract environment variables
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
  
  // Verify environment variables are present
  if (!projectId || !clientEmail || !privateKeyBase64) {
    console.error('❌ Missing required environment variables:');
    if (!projectId) console.error('- NEXT_PUBLIC_FIREBASE_PROJECT_ID');
    if (!clientEmail) console.error('- FIREBASE_CLIENT_EMAIL');
    if (!privateKeyBase64) console.error('- FIREBASE_PRIVATE_KEY_BASE64');
    process.exit(1);
  }
  
  // Decode the base64 private key
  const privateKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
  
  // Verify the private key format
  const hasPemHeader = privateKey.includes('-----BEGIN PRIVATE KEY-----');
  const hasPemFooter = privateKey.includes('-----END PRIVATE KEY-----');
  
  console.log('- Base64 key length:', privateKeyBase64.length);
  console.log('- Decoded key format check:');
  console.log('  - Contains PEM header:', hasPemHeader ? '✅' : '❌');
  console.log('  - Contains PEM footer:', hasPemFooter ? '✅' : '❌');
  
  if (!hasPemHeader || !hasPemFooter) {
    console.error('❌ Invalid private key format after decoding');
    process.exit(1);
  }
  
  // Initialize Firebase Admin
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey
    })
  });
  
  // Test Firestore access
  const db = admin.firestore();
  
  // Just check if we can initialize a collection reference
  // No need to actually query data
  db.collection('test-collection');
  
  console.log('✅ Init OK - Firebase Admin initialized successfully');
  process.exit(0);
} catch (error) {
  console.error('❌ Firebase Admin initialization failed:', error.message);
  process.exit(1);
} 