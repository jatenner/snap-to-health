/**
 * Firebase Debug Utilities
 * 
 * This file contains helper functions for debugging Firebase initialization
 * and configuration issues.
 */

export function logFirebasePrivateKeyDetails(requestId: string): void {
  // Only log key format details, never actual key contents
  const base64Key = process.env.FIREBASE_PRIVATE_KEY_BASE64;
  console.log(`[${requestId}] 🔑 Firebase Private Key check:`);
  
  if (!base64Key) {
    console.error(`[${requestId}] ❌ FIREBASE_PRIVATE_KEY_BASE64 is missing or empty`);
    return;
  }
  
  try {
    // Check if it's valid base64
    const isValidBase64 = /^[A-Za-z0-9+/=]+$/.test(base64Key);
    console.log(`[${requestId}] - Base64 format valid: ${isValidBase64}`);
    
    if (!isValidBase64) {
      console.error(`[${requestId}] ❌ FIREBASE_PRIVATE_KEY_BASE64 contains characters that are not valid base64`);
      return;
    }
    
    // Try to decode it
    let decodedKey: string;
    try {
      decodedKey = Buffer.from(base64Key, 'base64').toString('utf-8');
      console.log(`[${requestId}] ✅ Successfully decoded base64 key`);
    } catch (error) {
      console.error(`[${requestId}] ❌ Failed to decode base64 key: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    
    // Check if it has the expected PEM format
    const hasPemHeader = decodedKey.includes('-----BEGIN PRIVATE KEY-----');
    const hasPemFooter = decodedKey.includes('-----END PRIVATE KEY-----');
    const newlineCount = (decodedKey.match(/\n/g) || []).length;
    
    console.log(`[${requestId}] - PEM header present: ${hasPemHeader}`);
    console.log(`[${requestId}] - PEM footer present: ${hasPemFooter}`);
    console.log(`[${requestId}] - Contains newlines: ${newlineCount > 0}`);
    console.log(`[${requestId}] - Newline count: ${newlineCount}`);
    
    if (!hasPemHeader || !hasPemFooter) {
      console.error(`[${requestId}] ❌ FIREBASE_PRIVATE_KEY_BASE64 does not decode to a proper PEM format key`);
    }
    
    if (newlineCount < 25) {
      console.warn(`[${requestId}] ⚠️ Decoded key has fewer newlines than expected (${newlineCount}). This might cause issues.`);
    }
  } catch (error) {
    console.error(`[${requestId}] ❌ Error inspecting private key: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function logFirebaseConfigStatus(requestId: string): void {
  console.log(`[${requestId}] 🔥 Firebase configuration check:`);
  
  const configItems = [
    { name: 'NEXT_PUBLIC_FIREBASE_API_KEY', value: process.env.NEXT_PUBLIC_FIREBASE_API_KEY },
    { name: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', value: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN },
    { name: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', value: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID },
    { name: 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', value: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET },
    { name: 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', value: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID },
    { name: 'NEXT_PUBLIC_FIREBASE_APP_ID', value: process.env.NEXT_PUBLIC_FIREBASE_APP_ID },
    { name: 'FIREBASE_CLIENT_EMAIL', value: process.env.FIREBASE_CLIENT_EMAIL }
  ];
  
  let missingCount = 0;
  
  configItems.forEach(item => {
    if (!item.value) {
      console.error(`[${requestId}] ❌ ${item.name} is missing`);
      missingCount++;
    } else {
      console.log(`[${requestId}] ✅ ${item.name} is present`);
    }
  });
  
  if (missingCount > 0) {
    console.error(`[${requestId}] ❌ ${missingCount} Firebase configuration items are missing`);
  } else {
    console.log(`[${requestId}] ✅ All Firebase configuration items are present`);
  }
} 