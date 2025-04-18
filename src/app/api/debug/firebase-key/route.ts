import { NextRequest, NextResponse } from 'next/server';
import { logFirebasePrivateKeyDetails, logFirebaseConfigStatus } from '@/lib/firebase/debugFirebase';
import crypto from 'crypto';

// This diagnostic endpoint helps identify issues with Firebase initialization
// It reveals ONLY safe information about environment variables
export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] 🔍 Starting Firebase key diagnostic check`);

  // Log detailed information to the console for debugging
  logFirebasePrivateKeyDetails(requestId);
  logFirebaseConfigStatus(requestId);

  // Return a safer subset of information to the client
  const result: {
    timestamp: string;
    requestId: string;
    environment: string;
    firebasePrivateKeyPresent: boolean;
    firebasePrivateKeyValidFormat: boolean | null;
    firebaseProjectIdPresent: boolean;
    firebaseClientEmailPresent: boolean;
    suggestion?: string;
  } = {
    timestamp: new Date().toISOString(),
    requestId,
    environment: process.env.NODE_ENV || 'unknown',
    firebasePrivateKeyPresent: !!process.env.FIREBASE_PRIVATE_KEY_BASE64,
    firebasePrivateKeyValidFormat: null,
    firebaseProjectIdPresent: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    firebaseClientEmailPresent: !!process.env.FIREBASE_CLIENT_EMAIL,
  };

  // Check base64 format if the key is present
  if (process.env.FIREBASE_PRIVATE_KEY_BASE64) {
    try {
      const base64Key = process.env.FIREBASE_PRIVATE_KEY_BASE64;
      const isValidBase64 = /^[A-Za-z0-9+/=]+$/.test(base64Key);
      
      if (!isValidBase64) {
        result.firebasePrivateKeyValidFormat = false;
        result.suggestion = 'The FIREBASE_PRIVATE_KEY_BASE64 contains invalid characters. It should only contain A-Z, a-z, 0-9, +, /, and =.';
      } else {
        // Try to decode and check PEM format
        const decodedKey = Buffer.from(base64Key, 'base64').toString('utf-8');
        const hasPemHeader = decodedKey.includes('-----BEGIN PRIVATE KEY-----');
        const hasPemFooter = decodedKey.includes('-----END PRIVATE KEY-----');
        
        if (!hasPemHeader || !hasPemFooter) {
          result.firebasePrivateKeyValidFormat = false;
          result.suggestion = 'The decoded key is not in PEM format. It should contain BEGIN/END PRIVATE KEY markers.';
        } else {
          result.firebasePrivateKeyValidFormat = true;
        }
      }
    } catch (error) {
      result.firebasePrivateKeyValidFormat = false;
      result.suggestion = `Error validating key format: ${error instanceof Error ? error.message : String(error)}`;
    }
  } else {
    result.suggestion = 'FIREBASE_PRIVATE_KEY_BASE64 is missing. Please check your .env.local file.';
  }

  // Add more specific suggestions based on what's missing
  if (!result.firebaseProjectIdPresent) {
    result.suggestion = (result.suggestion || '') + ' NEXT_PUBLIC_FIREBASE_PROJECT_ID is missing.';
  }
  
  if (!result.firebaseClientEmailPresent) {
    result.suggestion = (result.suggestion || '') + ' FIREBASE_CLIENT_EMAIL is missing.';
  }

  return NextResponse.json(result);
} 