#!/usr/bin/env node
/**
 * This script converts a Firebase service account JSON file to environment variables
 * with the private key properly base64 encoded.
 * 
 * Usage: node convertServiceAccountToEnv.js path/to/service-account.json
 */

const fs = require('fs');
const path = require('path');

// Check if a file path is provided
if (process.argv.length < 3) {
  console.log('Usage: node convertServiceAccountToEnv.js path/to/service-account.json');
  process.exit(1);
}

// Read the file
const filePath = process.argv[2];

try {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }
  
  // Parse the service account JSON
  const serviceAccount = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  // Extract the necessary information
  const {
    project_id,
    private_key,
    client_email,
    client_id,
  } = serviceAccount;
  
  if (!project_id || !private_key || !client_email) {
    console.error('❌ Service account JSON is missing required fields');
    process.exit(1);
  }
  
  // Encode the private key as Base64
  const privateKeyBase64 = Buffer.from(private_key).toString('base64');
  
  // Generate .env content
  const envContent = `# Firebase configuration - Generated from service account on ${new Date().toISOString()}
NEXT_PUBLIC_FIREBASE_PROJECT_ID=${project_id}
FIREBASE_CLIENT_EMAIL=${client_email}
FIREBASE_CLIENT_ID=${client_id}
FIREBASE_PRIVATE_KEY_BASE64=${privateKeyBase64}

# Existing private key preserved for reference (DO NOT USE - Use base64 version above)
# FIREBASE_PRIVATE_KEY="${private_key.replace(/\n/g, '\\n')}"
`;

  // Write to .env.local file in project root
  const projectRoot = path.resolve(process.cwd(), '../../');
  const envFilePath = path.join(projectRoot, '.env.local.firebase');
  
  fs.writeFileSync(envFilePath, envContent);
  
  console.log('\n✅ Successfully generated Firebase environment variables!');
  console.log(`Environment file saved to: ${envFilePath}`);
  console.log('\nTo use these variables:');
  console.log('1. Add them to your .env.local file');
  console.log('2. Restart your development server');
  
  // Display key details for verification
  console.log('\n===== VERIFICATION =====');
  console.log(`Project ID: ${project_id}`);
  console.log(`Client Email: ${client_email}`);
  console.log('Private Key: Successfully encoded (first 10 chars of base64):');
  console.log(privateKeyBase64.substring(0, 10) + '...');
  
} catch (error) {
  console.error('❌ Error processing service account:', error.message);
  process.exit(1);
} 