import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export async function GET() {
  // Only available in development
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({
      success: false,
      message: 'This endpoint is only available in development mode'
    }, { status: 403 });
  }
  
  try {
    // Check if Firebase Admin Firestore is initialized
    if (!adminDb) {
      return NextResponse.json({
        success: false,
        message: 'Firebase Admin Firestore is not initialized',
        details: {
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'MISSING',
          hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY_BASE64
        }
      }, { status: 500 });
    }
    
    // Generate a unique test ID
    const testId = `test-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // Attempt to write to Firestore
    const testRef = adminDb.collection('admin_tests').doc(testId);
    const timestamp = new Date().toISOString();
    
    await testRef.set({
      timestamp,
      success: true,
      message: 'Firebase Admin connection test',
      environment: process.env.NODE_ENV || 'unknown'
    });
    
    // Read it back to verify
    const doc = await testRef.get();
    
    if (!doc.exists) {
      return NextResponse.json({
        success: false,
        message: 'Failed to verify written document',
        details: {
          testId,
          timestamp
        }
      }, { status: 500 });
    }
    
    // Success
    return NextResponse.json({
      success: true,
      message: 'Successfully connected to Firestore and wrote a test document',
      details: {
        testId,
        timestamp,
        docData: doc.data()
      }
    });
  } catch (error: any) {
    console.error('Error testing Firebase Admin connection:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Failed to connect to Firestore',
      error: error.message,
      details: {
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    }, { status: 500 });
  }
} 