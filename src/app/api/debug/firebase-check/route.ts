import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export async function GET() {
  try {
    // Check if adminDb is properly initialized
    if (!adminDb) {
      return NextResponse.json({
        success: false,
        error: "Firebase Admin Firestore is not initialized"
      }, { status: 500 });
    }
    
    // Try to access Firestore
    const testCollection = adminDb.collection('admin_tests');
    const timestamp = new Date().toISOString();
    
    // Create a unique ID for this test
    const testId = `api_test_${Date.now()}`;
    
    // Write a test document
    await testCollection.doc(testId).set({
      timestamp,
      source: 'Next.js API route',
      message: 'Firebase Admin SDK connection test from API route'
    });
    
    // Read the document back
    const docSnapshot = await testCollection.doc(testId).get();
    
    if (!docSnapshot.exists) {
      throw new Error('Test document was not created successfully');
    }
    
    return NextResponse.json({
      success: true,
      message: 'Firebase Admin SDK is working correctly',
      testId,
      timestamp,
      documentData: docSnapshot.data()
    }, { status: 200 });
    
  } catch (error: any) {
    console.error('Firebase Admin API test failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error occurred',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
} 