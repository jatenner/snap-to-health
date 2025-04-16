const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Define file paths
const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');
const envPath = path.join(process.cwd(), '.env.local');

// Read the service account file
console.log('Reading service account file...');
try {
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  
  // Extract the needed data
  const privateKey = serviceAccount.private_key;
  const clientEmail = serviceAccount.client_email;
  const clientId = serviceAccount.client_id;
  const projectId = serviceAccount.project_id;
  
  // Encode private key to base64
  console.log('Encoding private key to base64...');
  const privateKeyBase64 = Buffer.from(privateKey).toString('base64');
  
  // Read .env.local
  console.log('Reading current .env.local file...');
  let envData = {};
  
  try {
    // Try to read existing .env.local file
    const envFile = fs.readFileSync(envPath, 'utf8');
    envData = dotenv.parse(envFile);
  } catch (err) {
    console.warn('No existing .env.local file found. Creating a new one...');
  }
  
  // Update the Firebase admin values
  envData.FIREBASE_CLIENT_EMAIL = clientEmail;
  envData.FIREBASE_CLIENT_ID = clientId;
  envData.FIREBASE_PRIVATE_KEY_BASE64 = privateKeyBase64;
  
  // Also update the project ID if needed
  if (projectId && !envData.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
    envData.NEXT_PUBLIC_FIREBASE_PROJECT_ID = projectId;
  }
  
  // Convert to env file format
  const newEnvContent = Object.entries(envData)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  
  // Write back to .env.local
  console.log('Updating .env.local file...');
  fs.writeFileSync(envPath, newEnvContent);
  
  console.log('✅ Successfully updated Firebase Admin credentials in .env.local');
  console.log(`- Project ID: ${projectId}`);
  console.log(`- Client Email: ${clientEmail}`);
  console.log(`- Private Key: Successfully encoded to base64 (${privateKeyBase64.length} characters)`);
  
} catch (error) {
  console.error('❌ Error processing service account file:', error);
  process.exit(1);
} 