// src/app/api/proxy/storage/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { app } from '@/lib/firebase';

export async function GET(request: NextRequest) {
  // Ensure Firebase app is initialized before proceeding
  if (!app) {
    console.error('API Error: Firebase app is not initialized in GET /api/proxy/storage');
    return NextResponse.json({ error: 'Firebase not configured' }, { status: 500 });
  }
  
  try {
    // Extract URL parameters
    const url = new URL(request.url);
    const path = url.searchParams.get('path');
    
    if (!path) {
      return NextResponse.json({ error: 'No path parameter provided' }, { status: 400 });
    }
    
    // Get the referenced file
    const storage = getStorage(app);
    const fileRef = ref(storage, path);
    
    try {
      // Get the download URL
      const downloadUrl = await getDownloadURL(fileRef);
      
      // Return the download URL
      return NextResponse.json(
        { downloadUrl },
        {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
        }
      );
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || 'Error getting download URL' },
        { 
          status: 404,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          },
        }
      );
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // Ensure Firebase app is initialized before proceeding
  if (!app) {
    console.error('API Error: Firebase app is not initialized in POST /api/proxy/storage');
    return NextResponse.json({ error: 'Firebase not configured' }, { status: 500 });
  }
  
  try {
    // Parse formData
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const path = formData.get('path') as string;
    const metadataStr = formData.get('metadata') as string;
    
    if (!file || !path) {
      return NextResponse.json({ error: 'File and path are required' }, { status: 400 });
    }
    
    // Parse metadata if provided
    let metadata: any = { contentType: file.type };
    if (metadataStr) {
      try {
        metadata = JSON.parse(metadataStr);
      } catch (error) {
        // Ignore parsing error and use default metadata
      }
    }
    
    // Get storage reference
    const storage = getStorage(app);
    const storageRef = ref(storage, path);
    
    // Upload file
    const snapshot = await uploadBytes(storageRef, file, metadata);
    
    // Get download URL
    const downloadUrl = await getDownloadURL(snapshot.ref);
    
    // Return success response
    return NextResponse.json(
      { 
        downloadUrl,
        path: snapshot.ref.fullPath,
        bucket: snapshot.ref.bucket
      },
      {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}
