const fs = require('fs');
const path = require('path');

// Define paths
const rootDir = path.resolve(__dirname, '..');
const serviceAccountPath = path.join(rootDir, 'firebase-service-account.json');
const envFirebasePath = path.join(rootDir, '.env.local.firebase');

// Function to read and parse the service account key file
async function regenerateFirebaseKey() {
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
    console.log('- private_key length:', private_key.length);
    console.log('- base64 encoded private_key length:', privateKeyBase64.length);
    
    // Create output with the encoded key
    console.log('\nCopy the following to your .env.local.firebase file:');
    console.log('FIREBASE_PRIVATE_KEY_BASE64=' + privateKeyBase64);
    
    // Optional: Update the .env.local.firebase file directly
    if (fs.existsSync(envFirebasePath)) {
      let envContent = fs.readFileSync(envFirebasePath, 'utf8');
      const regex = new RegExp(`^FIREBASE_PRIVATE_KEY_BASE64=.*`, 'm');
      
      if (regex.test(envContent)) {
        // Update existing field
        envContent = envContent.replace(regex, `FIREBASE_PRIVATE_KEY_BASE64=${privateKeyBase64}`);
        console.log(`\nUpdated FIREBASE_PRIVATE_KEY_BASE64 in .env.local.firebase`);
      } else {
        // Append field if it doesn't exist
        envContent += `\nFIREBASE_PRIVATE_KEY_BASE64=${privateKeyBase64}`;
        console.log(`\nAppended FIREBASE_PRIVATE_KEY_BASE64 to .env.local.firebase`);
      }
      
      fs.writeFileSync(envFirebasePath, envContent);
      console.log('Successfully updated .env.local.firebase with the encoded private key');
    }
    
  } catch (error) {
    console.error('Error processing service account key file:', error);
  }
}

// Execute the function
regenerateFirebaseKey(); 