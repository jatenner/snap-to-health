#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const envPath = path.resolve(process.cwd(), '.env.local');

// List of important keys to check for
const keysToCheck = [
  'OPENAI_MODEL',
  'OPENAI_API_KEY',
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
  'FIREBASE_PRIVATE_KEY_BASE64',
  'FIREBASE_CLIENT_EMAIL'
];

if (fs.existsSync(envPath)) {
  console.log(`✅ File exists at: ${envPath}`);
  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split('\n');
  
  console.log('\nEnvironment Variables Status:');
  console.log('-----------------------------');
  
  keysToCheck.forEach(key => {
    const keyLine = lines.find(line => line.startsWith(`${key}=`));
    
    if (keyLine) {
      const value = keyLine.split('=')[1];
      const displayValue = key.includes('KEY') || key.includes('PRIVATE') 
        ? value.substring(0, 10) + '...' 
        : value;
        
      console.log(`✅ ${key}: ${displayValue}`);
    } else {
      console.log(`❌ ${key}: Not found`);
    }
  });
  
  console.log('\nTotal environment variables found:', lines.filter(line => line.trim() && !line.startsWith('#')).length);
} else {
  console.log(`❌ File does not exist at: ${envPath}`);
} 