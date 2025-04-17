require('dotenv').config({ path: '.env.local' });
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;

console.log('Testing Firebase Admin initialization...');
console.log(`Project ID: ${projectId}`);
console.log(`Client Email: ${clientEmail ? clientEmail.substring(0, 10) + '...' : 'missing'}`);
console.log(`Private Key Base64 Length: ${privateKeyBase64 ? privateKeyBase64.length : 0} chars`);

try {
  // Decode the base64 private key
  const decodedPrivateKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
  
  // Check the decoded key format
  const hasPemHeader = decodedPrivateKey.includes('-----BEGIN PRIVATE KEY-----');
  const hasPemFooter = decodedPrivateKey.includes('-----END PRIVATE KEY-----');
  const hasNewlines = decodedPrivateKey.includes('\n');
  const newlineCount = (decodedPrivateKey.match(/\n/g) || []).length;
  
  console.log(`Decoded private key validation:
    - Contains PEM header: ${hasPemHeader ? '✅' : '❌'}
    - Contains PEM footer: ${hasPemFooter ? '✅' : '❌'} 
    - Contains newlines: ${hasNewlines ? `✅ (${newlineCount} found)` : '❌'}
    - Decoded length: ${decodedPrivateKey.length} characters
  `);
  
  // Parse the JSON to extract just the private key if it's a full service account JSON
  let privateKey = decodedPrivateKey;
  try {
    const serviceAccount = JSON.parse(decodedPrivateKey);
    if (serviceAccount.private_key) {
      privateKey = serviceAccount.private_key;
      console.log('✅ Successfully extracted private_key from service account JSON');
    }
  } catch (e) {
    // Not JSON, assume it's already the PEM key format
    console.log('Decoded content is not JSON. Assuming direct PEM format.');
  }
  
  // Initialize Firebase Admin
  const app = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey
    })
  });
  
  console.log('✅ Firebase Admin initialized successfully!');
  
  // Test Firestore connection
  const db = getFirestore();
  console.log('✅ Firestore instance created');
  
  // Test a simple query
  db.collection('test')
    .limit(1)
    .get()
    .then(() => {
      console.log('✅ Successfully connected to Firestore');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Error querying Firestore:', err);
      process.exit(1);
    });
  
} catch (error) {
  console.error('❌ Error initializing Firebase Admin:', error);
  process.exit(1);
} 