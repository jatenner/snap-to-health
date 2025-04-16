const fs = require('fs');
const path = require('path');

// Define paths
const rootDir = path.resolve(__dirname, '..');
const serviceAccountPath = '/Users/jonahtenner/Downloads/snaphealth-39b14-firebase-adminsdk-fbsvc-8b51f0d9d1.json';
const envPath = path.join(rootDir, '.env.local');

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
  console.log('- client_email:', client_email.substring(0, 5) + '...');
  console.log('- client_id:', client_id?.substring(0, 5) + '...');
  console.log('- private_key length:', private_key.length);
  console.log('- base64 encoded private_key length:', privateKeyBase64.length);
  
  // Read current .env.local file
  let envContent = '';
  try {
    envContent = fs.readFileSync(envPath, 'utf8');
    console.log('Successfully read existing .env.local file');
  } catch (err) {
    console.log('No existing .env.local file found, creating a new one');
  }
  
  // Define the fields to update or append
  const fieldsToUpdate = {
    'FIREBASE_PRIVATE_KEY_BASE64': privateKeyBase64,
    'FIREBASE_CLIENT_EMAIL': client_email,
    'FIREBASE_CLIENT_ID': client_id,
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID': project_id
  };
  
  // Update or append each field
  Object.entries(fieldsToUpdate).forEach(([key, value]) => {
    const regex = new RegExp(`^${key}=.*`, 'm');
    if (regex.test(envContent)) {
      // Update existing field
      envContent = envContent.replace(regex, `${key}=${value}`);
      console.log(`Updated ${key} in .env.local`);
    } else {
      // Append field if it doesn't exist
      envContent += `\n${key}=${value}`;
      console.log(`Appended ${key} to .env.local`);
    }
  });
  
  // Write updated content back to .env.local
  fs.writeFileSync(envPath, envContent);
  console.log('Successfully updated .env.local with Firebase service account information');
  
} catch (error) {
  console.error('Error processing service account key file:', error);
} 