// src/app/api/proxy/storage/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getFileDownloadUrl, uploadFileToStorage } from '@/lib/serverStorage';

// Force Node.js runtime to avoid Edge Runtime incompatibilities with Firebase
export const runtime = 'nodejs';
export const preferredRegion = 'auto'; // Use the closest region for best performance

/**
 * This route proxies Firebase Storage operations to avoid client-side
 * issues with Firebase Storage's usage of undici and other Node.js modules
 */

export async function GET(request: NextRequest) {
  try {
    // Extract URL parameters
    const url = new URL(request.url);
    const path = url.searchParams.get('path');
    
    if (!path) {
      return NextResponse.json({ error: 'No path parameter provided' }, { status: 400 });
    }
    
    try {
      // Use our server storage utility to get the download URL
      const result = await getFileDownloadUrl(path);
      
      // Return the download URL
      return NextResponse.json(
        { downloadUrl: result.url },
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
      console.error('Firebase Storage error:', error.message);
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
    console.error('Storage proxy GET error:', error.message);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Parse formData
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const path = formData.get('path') as string;
    const metadataStr = formData.get('metadata') as string;
    
    if (!file || !path) {
      return NextResponse.json({ error: 'File and path are required' }, { status: 400 });
    }
    
    try {
      // Parse metadata if provided
      let metadata: any = { contentType: file.type };
      if (metadataStr) {
        try {
          metadata = JSON.parse(metadataStr);
        } catch (error) {
          // Ignore parsing error and use default metadata
        }
      }
      
      // Convert File to Buffer
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      
      // Use our server storage utility to upload the file
      const result = await uploadFileToStorage(path, fileBuffer, metadata);
      
      // Return success response
      return NextResponse.json(
        { 
          downloadUrl: result.url,
          path: result.path,
          success: result.success
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
      console.error('Firebase Storage error:', error.message);
      return NextResponse.json(
        { error: error.message || 'Storage operation failed' },
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
  } catch (error: any) {
    console.error('Storage proxy POST error:', error.message);
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
