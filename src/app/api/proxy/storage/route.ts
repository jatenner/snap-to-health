// src/app/api/proxy/storage/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  console.log('Storage proxy: Received GET request');
  
  // Get the target URL from the query parameters
  const url = request.nextUrl.searchParams.get('url');
  
  if (!url) {
    console.error('Storage proxy: Missing url parameter');
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }
  
  console.log(`Storage proxy: Forwarding request to: ${url}`);
  
  try {
    // Forward the request to Firebase Storage
    const response = await fetch(url, {
      method: 'GET',
      // Pass through the headers, except the host header
      headers: {
        ...Object.fromEntries(
          Array.from(request.headers.entries())
            .filter(([key]) => key.toLowerCase() !== 'host')
        ),
        'Origin': 'https://snaphealth-39b14.firebaseapp.com', // Use your production domain
      },
    });
    
    if (!response.ok) {
      console.error(`Storage proxy: Upstream server returned ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: `Upstream server error: ${response.status} ${response.statusText}` }, 
        { status: response.status }
      );
    }
    
    const data = await response.arrayBuffer();
    console.log(`Storage proxy: Successfully retrieved data (${data.byteLength} bytes)`);
    
    // Create a new response with the same data
    const newResponse = new NextResponse(data);
    
    // Copy all headers from the original response
    response.headers.forEach((value, key) => {
      newResponse.headers.set(key, value);
    });
    
    // Add CORS headers
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    
    // Set cache headers for better performance
    newResponse.headers.set('Cache-Control', 'public, max-age=3600');
    
    console.log('Storage proxy: Response prepared with CORS headers');
    return newResponse;
  } catch (error) {
    console.error('Storage proxy error:', error);
    return NextResponse.json({ 
      error: 'Failed to proxy request',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  console.log('Storage proxy: Received POST request');
  
  // Get the target URL from the query parameters
  const url = request.nextUrl.searchParams.get('url');
  
  if (!url) {
    console.error('Storage proxy: Missing url parameter');
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }
  
  console.log(`Storage proxy: Forwarding POST request to: ${url}`);
  
  try {
    // Get the request body as ArrayBuffer
    const contentType = request.headers.get('content-type') || 'application/octet-stream';
    const body = await request.arrayBuffer();
    
    console.log(`Storage proxy: Forwarding ${body.byteLength} bytes with Content-Type: ${contentType}`);
    
    // Forward the request to Firebase Storage
    const response = await fetch(url, {
      method: 'POST',
      // Pass through the headers, except the host header
      headers: {
        ...Object.fromEntries(
          Array.from(request.headers.entries())
            .filter(([key]) => key.toLowerCase() !== 'host')
        ),
        'Content-Type': contentType,
        'Origin': 'https://snaphealth-39b14.firebaseapp.com', // Use your production domain
      },
      body: body,
    });
    
    if (!response.ok) {
      console.error(`Storage proxy: Upstream server returned ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: `Upstream server error: ${response.status} ${response.statusText}` }, 
        { status: response.status }
      );
    }
    
    const data = await response.arrayBuffer();
    console.log(`Storage proxy: Successfully received response data (${data.byteLength} bytes)`);
    
    // Create a new response with the same data
    const newResponse = new NextResponse(data);
    
    // Copy all headers from the original response
    response.headers.forEach((value, key) => {
      newResponse.headers.set(key, value);
    });
    
    // Add CORS headers
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    
    console.log('Storage proxy: POST response prepared with CORS headers');
    return newResponse;
  } catch (error) {
    console.error('Storage proxy POST error:', error);
    return NextResponse.json({ 
      error: 'Failed to proxy POST request',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function OPTIONS(request: NextRequest) {
  console.log('Storage proxy: Received OPTIONS request (preflight)');
  
  // Handle preflight requests
  const newResponse = new NextResponse(null, { status: 200 });
  
  // Add CORS headers
  newResponse.headers.set('Access-Control-Allow-Origin', '*');
  newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  newResponse.headers.set('Access-Control-Max-Age', '86400'); // 24 hours
  
  console.log('Storage proxy: Responding to preflight request');
  return newResponse;
}
