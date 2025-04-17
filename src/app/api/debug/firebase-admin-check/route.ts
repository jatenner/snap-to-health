import { NextResponse } from 'next/server';
import { adminDb, adminAuth, adminStorage } from '@/lib/firebaseAdmin';

/**
 * API route that performs diagnostic tests on Firebase Admin SDK
 * This can be useful for debugging production environments
 * 
 * WARNING: Only enable this temporarily in production for debugging purposes
 * Access at: /api/debug/firebase-admin-check
 */
export async function GET() {
  // Only available in development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({
      success: false,
      message: 'This endpoint is only available in development mode'
    }, { status: 403 });
  }
  
  try {
    // Check environment variables
    const envVars = {
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'MISSING',
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'MISSING',
      clientEmail: maskSensitive(process.env.FIREBASE_CLIENT_EMAIL),
      clientId: maskSensitive(process.env.FIREBASE_CLIENT_ID),
      privateKeyPresent: process.env.FIREBASE_PRIVATE_KEY_BASE64 ? 'YES (Base64)' : 'MISSING',
      privateKeyLength: process.env.FIREBASE_PRIVATE_KEY_BASE64 
        ? process.env.FIREBASE_PRIVATE_KEY_BASE64.length 
        : 0,
      nodeEnv: process.env.NODE_ENV || 'unknown'
    };
    
    // Check if Firebase Admin is initialized
    const adminStatus = {
      firestore: !!adminDb ? 'Initialized' : 'Not initialized',
      auth: !!adminAuth ? 'Initialized' : 'Not initialized',
      storage: !!adminStorage ? 'Initialized' : 'Not initialized'
    };
    
    return NextResponse.json({
      success: true,
      message: 'Firebase Admin configuration loaded',
      config: envVars,
      status: adminStatus
    });
  } catch (error: any) {
    console.error('Error checking Firebase Admin configuration:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Failed to check Firebase Admin configuration',
      error: error.message
    }, { status: 500 });
  }
}

/**
 * Mask sensitive data for display
 */
function maskSensitive(value: string | undefined): string {
  if (!value) return 'MISSING';
  if (value.length < 8) return 'PRESENT (too short)';
  return `${value.substring(0, 4)}...${value.substring(value.length - 4)}`;
} 