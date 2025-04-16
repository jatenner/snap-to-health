import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth, adminStorage } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface FirebaseCheckResult {
  success: boolean;
  timestamp: string;
  environment: string;
  requestId: string;
  privateKeyCheck: {
    base64KeyPresent: boolean;
    base64KeyLength?: number;
    decodedKeyValid?: boolean;
    error?: string;
  };
  firebaseAdmin: {
    initialized: boolean;
    dbAvailable: boolean;
    authAvailable: boolean;
    storageAvailable: boolean;
    storageBucket?: string;
    testDocumentId?: string;
    testDocumentData?: any;
  };
  config: {
    projectId?: string;
    clientEmail?: string;
    storageBucket?: string;
  };
}

export async function GET(request: NextRequest) {
  // Generate a unique request ID
  const requestId = `firebase-check-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  
  // Only allow this endpoint in development or with proper authorization in production
  if (process.env.NODE_ENV === 'production') {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.slice(7) !== process.env.ADMIN_API_KEY) {
      return NextResponse.json({ 
        error: 'Unauthorized',
        requestId
      }, { status: 401 });
    }
  }

  // Initialize the result object
  const result: FirebaseCheckResult = {
    success: false,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown',
    requestId,
    privateKeyCheck: {
      base64KeyPresent: false,
    },
    firebaseAdmin: {
      initialized: false,
      dbAvailable: false,
      authAvailable: false,
      storageAvailable: false,
    },
    config: {
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    }
  };

  // Check the private key
  try {
    const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
    result.privateKeyCheck.base64KeyPresent = !!privateKeyBase64;
    
    if (privateKeyBase64) {
      result.privateKeyCheck.base64KeyLength = privateKeyBase64.length;

      // Try to decode the key (without exposing it)
      try {
        const decodedKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
        const hasPemHeader = decodedKey.includes('-----BEGIN PRIVATE KEY-----');
        const hasPemFooter = decodedKey.includes('-----END PRIVATE KEY-----');
        
        result.privateKeyCheck.decodedKeyValid = hasPemHeader && hasPemFooter;
      } catch (decodeError: any) {
        result.privateKeyCheck.error = `Decode error: ${decodeError.message}`;
      }
    }
  } catch (error: any) {
    result.privateKeyCheck.error = `Key check error: ${error.message}`;
  }

  // Check Firebase Admin initialization
  try {
    // Check if the admin services are initialized
    result.firebaseAdmin.initialized = !!adminDb;
    result.firebaseAdmin.dbAvailable = !!adminDb;
    result.firebaseAdmin.authAvailable = !!adminAuth;
    result.firebaseAdmin.storageAvailable = !!adminStorage;
    
    if (adminStorage?.bucket) {
      try {
        const bucket = adminStorage.bucket();
        result.firebaseAdmin.storageBucket = bucket.name;
      } catch (bucketError) {
        // Ignore bucket errors
      }
    }

    // If Firestore is available, try a write/read operation
    if (adminDb) {
      // Create a test collection specific to this API check
      const testCollection = adminDb.collection('admin_tests');
      const testId = `api_test_${Date.now()}`;
      result.firebaseAdmin.testDocumentId = testId;
      
      // Write a test document
      await testCollection.doc(testId).set({
        timestamp: new Date().toISOString(),
        requestId,
        source: 'Next.js App Router API route',
        message: 'Firebase Admin SDK connection test'
      });
      
      // Read the document back
      const docSnapshot = await testCollection.doc(testId).get();
      
      if (docSnapshot.exists) {
        result.firebaseAdmin.testDocumentData = docSnapshot.data();
        result.success = true;
      }
    }
  } catch (error: any) {
    result.success = false;
    return NextResponse.json({
      ...result,
      error: `Firebase operation failed: ${error.message}`,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }

  return NextResponse.json(result, { status: result.success ? 200 : 500 });
} 