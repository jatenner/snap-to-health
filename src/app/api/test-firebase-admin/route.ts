import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebaseAdmin';

export async function GET(request: NextRequest) {
  try {
    // Check if adminDb is initialized
    const isDbInitialized = !!adminDb;
    
    // Check if adminAuth is initialized
    const isAuthInitialized = !!adminAuth;
    
    // Perform a simple Firestore operation to further validate
    let firestoreTest = null;
    let error = null;
    
    if (isDbInitialized) {
      try {
        // Try to get a document from Firestore
        const testRef = adminDb.collection('_test_').doc('firebase-connection-test');
        const timestamp = new Date().toISOString();
        
        // Add a test document
        await testRef.set({
          timestamp,
          message: 'Firebase connection test',
          environment: process.env.VERCEL_ENV || 'unknown'
        });
        
        // Read it back
        const doc = await testRef.get();
        firestoreTest = {
          exists: doc.exists,
          data: doc.exists ? doc.data() : null
        };
        
        // Clean up
        await testRef.delete();
      } catch (err: any) {
        console.error('Firestore operation error:', err);
        error = {
          message: err.message,
          code: err.code,
          stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        };
      }
    }
    
    return NextResponse.json({
      success: isDbInitialized && isAuthInitialized && !error,
      initialized: {
        db: isDbInitialized,
        auth: isAuthInitialized
      },
      environment: {
        vercel: !!process.env.VERCEL,
        vercelEnv: process.env.VERCEL_ENV || 'not-vercel',
        nodeEnv: process.env.NODE_ENV
      },
      firestoreTest,
      error,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    console.error('Firebase admin test error:', err);
    return NextResponse.json({
      success: false,
      error: {
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
      }
    }, { status: 500 });
  }
} 