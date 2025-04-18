import { NextResponse, NextRequest } from 'next/server';
import { initializeApp, cert } from 'firebase-admin/app';
import { getApps } from 'firebase-admin/app';

// Define interfaces for the diagnostic response
interface DiagnosticDetail {
  found?: Record<string, boolean>;
  missing?: string[];
  error?: string;
  keyLength?: number;
  format?: string;
  startsWithHeader?: boolean;
  endsWithFooter?: boolean;
  keyPreview?: string;
  appName?: string;
  initialized?: boolean;
  initializationTimeMs?: number;
  stack?: string;
  reason?: string;
}

interface DiagnosticCheck {
  status: 'pending' | 'success' | 'error' | 'skipped';
  details: DiagnosticDetail;
  requiredVars?: string[];
}

interface DiagnosticResponse {
  status: string;
  timestamp: string;
  checks: {
    environmentVariables: DiagnosticCheck;
    privateKeyValidation: DiagnosticCheck;
    firebaseInitialization: DiagnosticCheck;
  };
}

// Function to validate the Firebase private key format
function assertFirebasePrivateKey(key: string): string {
  // Basic validation for PEM format
  if (!key.includes('-----BEGIN PRIVATE KEY-----')) {
    throw new Error('Firebase private key is missing the PEM header');
  }
  
  if (!key.includes('-----END PRIVATE KEY-----')) {
    throw new Error('Firebase private key is missing the PEM footer');
  }
  
  // Check for newlines which are required in PEM format
  if (!key.includes('\n')) {
    throw new Error('Firebase private key is missing required newlines');
  }
  
  return key;
}

// Simplified version of initializeFirebaseAdmin for diagnostics
async function initializeFirebaseAdmin() {
  const apps = getApps();
  
  // Return existing app if already initialized
  if (apps.length > 0) {
    return apps[0];
  }
  
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET;
  
  // Check which key format we're using
  let keyToUse = privateKey;
  
  // If we have a base64 key, decode it
  if (!keyToUse && privateKeyBase64) {
    keyToUse = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
  }
  
  if (!projectId || !clientEmail || !keyToUse) {
    throw new Error(`Missing required Firebase config: ${!projectId ? 'Project ID' : ''} ${!clientEmail ? 'Client Email' : ''} ${!keyToUse ? 'Private Key' : ''}`);
  }
  
  // Initialize the app
  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: keyToUse,
    }),
    storageBucket,
  });
}

// Diagnostic endpoint to check Firebase configuration and initialization
export async function GET(request: NextRequest) {
  const diagnostics: DiagnosticResponse = {
    status: 'checking',
    timestamp: new Date().toISOString(),
    checks: {
      environmentVariables: {
        status: 'pending',
        details: {},
        requiredVars: [
          'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
          'FIREBASE_PROJECT_ID',
          'FIREBASE_CLIENT_EMAIL',
          'FIREBASE_PRIVATE_KEY',
          'FIREBASE_PRIVATE_KEY_BASE64',
          'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
          'FIREBASE_STORAGE_BUCKET'
        ]
      },
      privateKeyValidation: {
        status: 'pending',
        details: {}
      },
      firebaseInitialization: {
        status: 'pending',
        details: {}
      }
    }
  };

  // Step 1: Check for required environment variables
  const envVars = diagnostics.checks.environmentVariables;
  const missingVars: string[] = [];
  
  envVars.details.found = {};
  envVars.details.missing = [];
  
  for (const envVar of envVars.requiredVars!) {
    const value = process.env[envVar];
    if (!value) {
      missingVars.push(envVar);
      envVars.details.missing.push(envVar);
    } else {
      envVars.details.found[envVar] = true;
    }
  }
  
  // Check if we have at least one project ID and either private key format
  const hasProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const hasPrivateKey = process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY_BASE64;
  
  // Only mark as error if we're missing critical variables
  envVars.status = (hasProjectId && hasPrivateKey && process.env.FIREBASE_CLIENT_EMAIL) 
    ? 'success' 
    : 'error';
  
  // Step 2: Validate Firebase private key format
  const keyCheck = diagnostics.checks.privateKeyValidation;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
  
  if (!privateKey && !privateKeyBase64) {
    keyCheck.status = 'error';
    keyCheck.details = {
      error: 'Neither Firebase private key nor private key base64 is available'
    };
  } else {
    try {
      let keyToCheck = privateKey;
      
      // If we don't have the regular key but have base64, decode and check that
      if (!keyToCheck && privateKeyBase64) {
        try {
          keyToCheck = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
        } catch (decodeError) {
          throw new Error(`Failed to decode base64 key: ${decodeError instanceof Error ? decodeError.message : 'Unknown error'}`);
        }
      }
      
      const validatedKey = assertFirebasePrivateKey(keyToCheck!);
      keyCheck.status = 'success';
      keyCheck.details = {
        keyLength: validatedKey.length,
        format: 'valid',
        startsWithHeader: validatedKey.startsWith('-----BEGIN PRIVATE KEY-----'),
        endsWithFooter: validatedKey.endsWith('-----END PRIVATE KEY-----')
      };
    } catch (error) {
      keyCheck.status = 'error';
      keyCheck.details = {
        error: error instanceof Error ? error.message : 'Unknown error during key validation',
        keyPreview: privateKey ? privateKey.substring(0, 20) + '...' : 
                    privateKeyBase64 ? 'Base64 format (first 20 chars): ' + privateKeyBase64.substring(0, 20) + '...' : 
                    'No key available'
      };
    }
  }
  
  // Step 3: Try to initialize Firebase
  const initCheck = diagnostics.checks.firebaseInitialization;
  if (envVars.status === 'success' && keyCheck.status === 'success') {
    try {
      const startTime = Date.now();
      const firebaseApp = await initializeFirebaseAdmin();
      const endTime = Date.now();
      
      initCheck.status = 'success';
      initCheck.details = {
        appName: firebaseApp.name,
        initialized: true,
        initializationTimeMs: endTime - startTime
      };
    } catch (error) {
      initCheck.status = 'error';
      initCheck.details = {
        error: error instanceof Error ? error.message : 'Unknown error during Firebase initialization',
        stack: error instanceof Error ? error.stack : undefined
      };
    }
  } else {
    initCheck.status = 'skipped';
    initCheck.details = {
      reason: 'Cannot initialize Firebase due to previous check failures'
    };
  }
  
  // Update overall status
  diagnostics.status = 
    envVars.status === 'success' && 
    keyCheck.status === 'success' && 
    initCheck.status === 'success' 
      ? 'healthy' 
      : 'unhealthy';
  
  return NextResponse.json(diagnostics);
} 