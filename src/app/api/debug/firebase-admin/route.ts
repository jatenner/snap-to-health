import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export async function GET(request: NextRequest) {
  const timestamp = new Date().toISOString();
  const requestId = crypto.randomUUID();
  console.log(`[${timestamp}] [${requestId}] Firebase Admin diagnostic check started`);

  // Safe result object with non-sensitive information
  const result = {
    timestamp,
    requestId,
    environment: process.env.NODE_ENV || 'unknown',
    privateKeyCheck: {
      base64KeyPresent: !!process.env.FIREBASE_PRIVATE_KEY_BASE64,
      base64KeyLength: process.env.FIREBASE_PRIVATE_KEY_BASE64?.length || 0,
      decodedKeyValid: false,
      hasPemHeader: false,
      hasPemFooter: false,
      hasNewlines: false,
      newlineCount: 0
    },
    firebaseConnection: {
      adminInitialized: false,
      firestoreConnected: false
    }
  };

  // Check private key format (safely)
  try {
    const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
    if (privateKeyBase64) {
      const decodedKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
      result.privateKeyCheck.decodedKeyValid = true;
      result.privateKeyCheck.hasPemHeader = decodedKey.includes('-----BEGIN PRIVATE KEY-----');
      result.privateKeyCheck.hasPemFooter = decodedKey.includes('-----END PRIVATE KEY-----');
      result.privateKeyCheck.hasNewlines = decodedKey.includes('\n');
      result.privateKeyCheck.newlineCount = (decodedKey.match(/\n/g) || []).length;
    }
  } catch (error: any) {
    console.error(`[${timestamp}] [${requestId}] Private key check error:`, error.message);
  }

  // Check Firebase Admin initialization
  try {
    result.firebaseConnection.adminInitialized = !!adminDb;
    
    // Test Firestore connection if adminDb exists
    if (adminDb) {
      try {
        // Perform a simple query to test the connection
        const testDoc = await adminDb.collection('_diagnostics').doc('test').get();
        result.firebaseConnection.firestoreConnected = true;
        console.log(`[${timestamp}] [${requestId}] Firestore connection successful`);
      } catch (firestoreError: any) {
        console.error(`[${timestamp}] [${requestId}] Firestore connection failed:`, firestoreError.message);
        result.firebaseConnection.firestoreConnected = false;
      }
    }
  } catch (error: any) {
    console.error(`[${timestamp}] [${requestId}] Firebase Admin check error:`, error.message);
  }

  // Write diagnostic result to a JSON file for reference
  try {
    const fs = require('fs');
    fs.writeFileSync('firebase-check.json', JSON.stringify(result));
  } catch (fileError) {
    // Ignore file writing errors - they're expected in production
  }

  console.log(`[${timestamp}] [${requestId}] Firebase Admin diagnostic completed:`, 
    result.firebaseConnection.adminInitialized ? '✅' : '❌');

  return NextResponse.json({
    success: true,
    result
  });
} 