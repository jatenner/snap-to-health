const fs = require('fs');
const path = require('path');

// Define paths
const rootDir = path.resolve(__dirname, '..');
const serviceAccountPath = path.join(rootDir, 'firebase-service-account.json');
const envPath = path.join(rootDir, '.env.local.firebase');

// Log the paths for verification
console.log('Service account path:', serviceAccountPath);
console.log('Env file path:', envPath);

// Read and parse the service account key file
try {
  console.log('Reading service account key file...');
  const serviceAccountContent = fs.readFileSync(serviceAccountPath, 'utf8');
  const serviceAccount = JSON.parse(serviceAccountContent);
  
  // Extract required fields
  const { 
    private_key,
    project_id, 
    client_email, 
    client_id 
  } = serviceAccount;
  
  if (!private_key) {
    throw new Error('private_key field not found in service account key file');
  }
  
  // Base64 encode the private key
  const privateKeyBase64 = Buffer.from(private_key).toString('base64');
  
  // Log the extracted information (partial, for security)
  console.log('Extracted fields:');
  console.log('- project_id:', project_id);
  console.log('- client_email:', client_email.substring(0, 15) + '...');
  console.log('- client_id:', client_id?.substring(0, 5) + '...');
  console.log('- private_key length:', private_key.length);
  console.log('- base64 encoded private_key length:', privateKeyBase64.length);
  
  // Read current .env.local.firebase file
  let envContent = '';
  try {
    envContent = fs.readFileSync(envPath, 'utf8');
    console.log('Successfully read existing .env.local.firebase file');
  } catch (err) {
    console.log('No existing .env.local.firebase file found, creating a new one');
  }
  
  // Update the FIREBASE_PRIVATE_KEY_BASE64 field
  const privateKeyRegex = /(FIREBASE_PRIVATE_KEY_BASE64=).*$/m;
  if (privateKeyRegex.test(envContent)) {
    envContent = envContent.replace(privateKeyRegex, `$1${privateKeyBase64}`);
    console.log('Updated FIREBASE_PRIVATE_KEY_BASE64 in .env.local.firebase');
  } else {
    envContent += `\nFIREBASE_PRIVATE_KEY_BASE64=${privateKeyBase64}`;
    console.log('Appended FIREBASE_PRIVATE_KEY_BASE64 to .env.local.firebase');
  }
  
  // Write updated content back to .env.local.firebase
  fs.writeFileSync(envPath, envContent);
  console.log('Successfully updated .env.local.firebase with Firebase private key');
  
  // Print confirmation with preview (truncated for security)
  const updatedKey = privateKeyBase64.substring(0, 20) + '...' + privateKeyBase64.substring(privateKeyBase64.length - 20);
  console.log(`New key value (truncated): ${updatedKey}`);
  
} catch (error) {
  console.error('Error processing service account key file:', error);
} 