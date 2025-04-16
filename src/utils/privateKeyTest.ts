// Private Key Test Script
// Run this with: npx ts-node privateKeyTest.ts

const privateKey = process.env.FIREBASE_PRIVATE_KEY || '';

console.log('Original Private Key (first 15 chars):', privateKey.substring(0, 15));
console.log('Contains "\\n":', privateKey.includes('\\n'));
console.log('Contains "\n":', privateKey.includes('\n'));

// Test various parsing approaches
const parsed1 = privateKey.replace(/\\n/g, '\n');
console.log('\nParsed with .replace(/\\\\n/g, "\\n")');
console.log('Result (first 15 chars):', parsed1.substring(0, 15));
console.log('Contains newlines:', parsed1.includes('\n'));
console.log('Number of newlines:', (parsed1.match(/\n/g) || []).length);

// Another approach - handle double escaping
const parsed2 = privateKey.replace(/\\\\n/g, '\n');
console.log('\nParsed with .replace(/\\\\\\\\n/g, "\\n")');
console.log('Result (first 15 chars):', parsed2.substring(0, 15));
console.log('Contains newlines:', parsed2.includes('\n'));
console.log('Number of newlines:', (parsed2.match(/\n/g) || []).length);

// Yet another approach - JSON parse with additional quotes
try {
  const parsed3 = JSON.parse(`"${privateKey}"`);
  console.log('\nParsed with JSON.parse()');
  console.log('Result (first 15 chars):', parsed3.substring(0, 15));
  console.log('Contains newlines:', parsed3.includes('\n'));
  console.log('Number of newlines:', (parsed3.match(/\n/g) || []).length);
} catch (e: any) {
  console.log('\nJSON.parse() failed:', e.message);
}

// Function from firebaseAdmin.ts
const getPrivateKey = () => {
  if (!privateKey) return '';
  
  try {
    // Handle different formats of the private key
    // First try direct replacement of escaped newlines
    if (privateKey.includes('\\n')) {
      return privateKey.replace(/\\n/g, '\n');
    }
    
    // If the key starts with ----- it's likely already properly formatted
    if (privateKey.startsWith('-----BEGIN PRIVATE KEY-----')) {
      return privateKey;
    }
    
    // Check if the key is base64 encoded
    if (privateKey.match(/^[A-Za-z0-9+/=]+$/)) {
      const decoded = Buffer.from(privateKey, 'base64').toString();
      if (decoded.includes('PRIVATE KEY')) {
        return decoded;
      }
    }
    
    // If all else fails, return as is
    return privateKey;
  } catch (e: any) {
    console.error('Error processing private key:', e);
    // Return original to allow Firebase to attempt processing
    return privateKey;
  }
};

const processedKey = getPrivateKey();
console.log('\nProcessed with getPrivateKey() function');
console.log('Result (first 15 chars):', processedKey.substring(0, 15));
console.log('Contains newlines:', processedKey.includes('\n'));
console.log('Number of newlines:', (processedKey.match(/\n/g) || []).length);

// For Firebase Admin SDK, the private key needs actual newlines
console.log('\nFinal analysis:');
if (processedKey.includes('\n')) {
  console.log('✅ The processed key contains actual newlines, which should work with Firebase Admin SDK');
} else {
  console.log('❌ The processed key does NOT contain actual newlines, which will likely cause problems');
}

// Log the entire parsed key for visual inspection (use with caution in production)
console.log('\nFirst 100 characters of processed key for visual inspection:');
console.log(processedKey.substring(0, 100));
console.log('...'); 