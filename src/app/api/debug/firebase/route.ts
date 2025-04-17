import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth, adminStorage } from '../../../../lib/firebaseAdmin';
import { assertFirebasePrivateKey } from '../../../../utils/validateEnv';

/**
 * API endpoint for debugging Firebase initialization
 */
export async function GET(request: NextRequest) {
  // Create diagnostics object
  const diagnostics = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown',
    checks: {
      envVars: {
        status: 'pending',
        details: {} as Record<string, string>
      },
      privateKey: {
        status: 'pending',
        details: {} as Record<string, any>
      },
      firebaseInit: {
        status: 'pending',
        details: {} as Record<string, any>
      }
    }
  };

  // 1. Check if required environment variables are set
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  
  diagnostics.checks.envVars.details = {
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID': projectId ? 'present' : 'missing',
    'FIREBASE_CLIENT_EMAIL': clientEmail ? 'present' : 'missing',
    'FIREBASE_PRIVATE_KEY_BASE64': privateKeyBase64 ? `present (${privateKeyBase64.length} chars)` : 'missing',
    'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET': storageBucket ? 'present' : 'missing (optional)'
  };
  
  // Update status based on required vars
  const missingRequiredVars = [];
  if (!projectId) missingRequiredVars.push('NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  if (!clientEmail) missingRequiredVars.push('FIREBASE_CLIENT_EMAIL');
  if (!privateKeyBase64) missingRequiredVars.push('FIREBASE_PRIVATE_KEY_BASE64');
  
  diagnostics.checks.envVars.status = missingRequiredVars.length === 0 ? 'success' : 'failed';
  if (missingRequiredVars.length > 0) {
    diagnostics.checks.envVars.details.error = `Missing required variables: ${missingRequiredVars.join(', ')}`;
  }

  // 2. Validate Firebase private key
  if (privateKeyBase64) {
    try {
      assertFirebasePrivateKey();
      diagnostics.checks.privateKey.status = 'success';
      diagnostics.checks.privateKey.details = {
        keyLength: privateKeyBase64.length,
        decodable: true,
        validFormat: true
      };
    } catch (error: any) {
      diagnostics.checks.privateKey.status = 'failed';
      diagnostics.checks.privateKey.details = {
        error: error.message,
        keyLength: privateKeyBase64.length,
        // Check if the key at least starts with a valid Base64 character set
        validBase64Chars: /^[A-Za-z0-9+/=]+$/.test(privateKeyBase64.substring(0, 10))
      };
    }
  } else {
    diagnostics.checks.privateKey.status = 'skipped';
    diagnostics.checks.privateKey.details = { reason: 'FIREBASE_PRIVATE_KEY_BASE64 not provided' };
  }

  // 3. Check Firebase initialization status
  try {
    // Check if Firebase was initialized by seeing if we can access the admin objects
    const isDbInitialized = !!adminDb;
    const isAuthInitialized = !!adminAuth;
    const isStorageInitialized = !!adminStorage;
    
    diagnostics.checks.firebaseInit.status = 
      (isDbInitialized && isAuthInitialized) ? 'success' : 'partial';
    
    diagnostics.checks.firebaseInit.details = {
      firestore: isDbInitialized ? 'initialized' : 'failed',
      auth: isAuthInitialized ? 'initialized' : 'failed',
      storage: isStorageInitialized ? 'initialized' : 'failed'
    };
    
    // Try to perform a basic Firestore operation if initialized
    if (isDbInitialized) {
      try {
        const testRef = adminDb.collection('_diagnostics').doc('test');
        const testTimestamp = new Date().toISOString();
        await testRef.set({ timestamp: testTimestamp, source: 'api-diagnostics' });
        
        diagnostics.checks.firebaseInit.details.firestoreTest = 'success';
        diagnostics.checks.firebaseInit.details.firestoreTestTimestamp = testTimestamp;
      } catch (firestoreError: any) {
        diagnostics.checks.firebaseInit.details.firestoreTest = 'failed';
        diagnostics.checks.firebaseInit.details.firestoreError = firestoreError.message;
      }
    }
  } catch (error: any) {
    diagnostics.checks.firebaseInit.status = 'failed';
    diagnostics.checks.firebaseInit.details = { error: error.message };
  }

  // Return diagnostic results
  return NextResponse.json({
    success: true,
    diagnostics
  });
} 