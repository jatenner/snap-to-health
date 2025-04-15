import { NextRequest, NextResponse } from 'next/server';

// Firebase API endpoint for Firestore REST
// Format: https://firestore.googleapis.com/v1/projects/PROJECT_ID/databases/(default)/documents/COLLECTION/DOCUMENT
const FIRESTORE_BASE_URL = 'https://firestore.googleapis.com/v1';
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'snaphealth-39b14';

/**
 * GET method to handle Firestore document retrieval
 */
export async function GET(request: NextRequest) {
  console.log('Firestore proxy: Received GET request');
  
  // Extract path and options from query parameters
  const path = request.nextUrl.searchParams.get('path');
  const options = request.nextUrl.searchParams.get('options') || '{}';
  
  if (!path) {
    console.error('Firestore proxy: Missing path parameter');
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
  }
  
  // Build the Firestore API URL
  const targetUrl = `${FIRESTORE_BASE_URL}/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
  console.log(`Firestore proxy: Forwarding GET request to: ${targetUrl}`);
  
  try {
    // Parse options if provided
    const parsedOptions = JSON.parse(options);
    const queryParams = new URLSearchParams();
    
    // Add any additional query parameters from options
    for (const [key, value] of Object.entries(parsedOptions)) {
      if (typeof value === 'string') {
        queryParams.append(key, value);
      } else {
        queryParams.append(key, JSON.stringify(value));
      }
    }
    
    // Build the final URL with query parameters
    const finalUrl = `${targetUrl}${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    
    // Get authorization token from request headers
    const authHeader = request.headers.get('authorization');
    
    // Forward the request to Firestore API
    const response = await fetch(finalUrl, {
      method: 'GET',
      headers: {
        // Pass through auth headers if provided
        ...(authHeader ? { 'Authorization': authHeader } : {}),
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error(`Firestore proxy: Upstream server returned ${response.status} ${response.statusText}`);
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      return NextResponse.json(
        { 
          error: `Upstream server error: ${response.status} ${response.statusText}`,
          details: errorData
        }, 
        { status: response.status }
      );
    }
    
    const data = await response.json();
    console.log(`Firestore proxy: Successfully retrieved data`);
    
    // Return the data from Firestore
    return NextResponse.json(data);
  } catch (error) {
    console.error('Firestore proxy error:', error);
    return NextResponse.json({ 
      error: 'Failed to proxy request',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * POST method to create or add documents to Firestore
 */
export async function POST(request: NextRequest) {
  console.log('Firestore proxy: Received POST request');
  
  // Extract path from query parameters
  const path = request.nextUrl.searchParams.get('path');
  
  if (!path) {
    console.error('Firestore proxy: Missing path parameter');
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
  }
  
  // Build the Firestore API URL
  const targetUrl = `${FIRESTORE_BASE_URL}/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
  console.log(`Firestore proxy: Forwarding POST request to: ${targetUrl}`);
  
  try {
    // Parse request body
    const requestBody = await request.json();
    
    // Get authorization token from request headers
    const authHeader = request.headers.get('authorization');
    
    // Forward the request to Firestore API
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        // Pass through auth headers if provided
        ...(authHeader ? { 'Authorization': authHeader } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      console.error(`Firestore proxy: Upstream server returned ${response.status} ${response.statusText}`);
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      return NextResponse.json(
        { 
          error: `Upstream server error: ${response.status} ${response.statusText}`,
          details: errorData
        }, 
        { status: response.status }
      );
    }
    
    const data = await response.json();
    console.log(`Firestore proxy: Successfully created document`);
    
    // Return the response from Firestore
    return NextResponse.json(data);
  } catch (error) {
    console.error('Firestore proxy POST error:', error);
    return NextResponse.json({ 
      error: 'Failed to proxy POST request',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * PUT method to update documents in Firestore
 */
export async function PUT(request: NextRequest) {
  console.log('Firestore proxy: Received PUT request');
  
  // Extract path from query parameters
  const path = request.nextUrl.searchParams.get('path');
  
  if (!path) {
    console.error('Firestore proxy: Missing path parameter');
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
  }
  
  // Build the Firestore API URL
  const targetUrl = `${FIRESTORE_BASE_URL}/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
  console.log(`Firestore proxy: Forwarding PUT request to: ${targetUrl}`);
  
  try {
    // Parse request body
    const requestBody = await request.json();
    
    // Get authorization token from request headers
    const authHeader = request.headers.get('authorization');
    
    // Forward the request to Firestore API
    const response = await fetch(targetUrl, {
      method: 'PATCH', // Firestore REST API uses PATCH for updates
      headers: {
        // Pass through auth headers if provided
        ...(authHeader ? { 'Authorization': authHeader } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      console.error(`Firestore proxy: Upstream server returned ${response.status} ${response.statusText}`);
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      return NextResponse.json(
        { 
          error: `Upstream server error: ${response.status} ${response.statusText}`,
          details: errorData
        }, 
        { status: response.status }
      );
    }
    
    const data = await response.json();
    console.log(`Firestore proxy: Successfully updated document`);
    
    // Return the response from Firestore
    return NextResponse.json(data);
  } catch (error) {
    console.error('Firestore proxy PUT error:', error);
    return NextResponse.json({ 
      error: 'Failed to proxy PUT request',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * DELETE method to delete documents from Firestore
 */
export async function DELETE(request: NextRequest) {
  console.log('Firestore proxy: Received DELETE request');
  
  // Extract path from query parameters
  const path = request.nextUrl.searchParams.get('path');
  
  if (!path) {
    console.error('Firestore proxy: Missing path parameter');
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
  }
  
  // Build the Firestore API URL
  const targetUrl = `${FIRESTORE_BASE_URL}/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
  console.log(`Firestore proxy: Forwarding DELETE request to: ${targetUrl}`);
  
  try {
    // Get authorization token from request headers
    const authHeader = request.headers.get('authorization');
    
    // Forward the request to Firestore API
    const response = await fetch(targetUrl, {
      method: 'DELETE',
      headers: {
        // Pass through auth headers if provided
        ...(authHeader ? { 'Authorization': authHeader } : {}),
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      console.error(`Firestore proxy: Upstream server returned ${response.status} ${response.statusText}`);
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      return NextResponse.json(
        { 
          error: `Upstream server error: ${response.status} ${response.statusText}`,
          details: errorData
        }, 
        { status: response.status }
      );
    }
    
    console.log(`Firestore proxy: Successfully deleted document`);
    
    // Return success response
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Firestore proxy DELETE error:', error);
    return NextResponse.json({ 
      error: 'Failed to proxy DELETE request',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * OPTIONS method to handle CORS preflight requests
 */
export async function OPTIONS(request: NextRequest) {
  console.log('Firestore proxy: Received OPTIONS request (preflight)');
  
  // Handle preflight requests
  const newResponse = new NextResponse(null, { status: 200 });
  
  // Add CORS headers
  newResponse.headers.set('Access-Control-Allow-Origin', '*');
  newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  newResponse.headers.set('Access-Control-Max-Age', '86400'); // 24 hours
  
  console.log('Firestore proxy: Responding to preflight request');
  return newResponse;
} 