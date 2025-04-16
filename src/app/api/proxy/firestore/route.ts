import { NextRequest, NextResponse } from 'next/server';

// Firebase API endpoint for Firestore REST
// Format: https://firestore.googleapis.com/v1/projects/PROJECT_ID/databases/(default)/documents/COLLECTION/DOCUMENT
const FIRESTORE_BASE_URL = 'https://firestore.googleapis.com/v1';
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'snaphealth-39b14';

/**
 * Handles the GET request to proxy Firestore requests
 */
export async function GET(request: NextRequest) {
  try {
    // Get the path and method from the query parameters
    const url = new URL(request.url);
    const path = url.searchParams.get('path');
    const method = url.searchParams.get('method') || 'GET';
    
    if (!path) {
      return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
    }
    
    // Calculate the URL for the Firestore API
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) {
      return NextResponse.json({ error: 'Firebase project ID not configured' }, { status: 500 });
    }
    
    // Construct the Firestore API URL
    const targetUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
    
    // Get the authorization header from the request
    const authHeader = request.headers.get('authorization');
    
    // Forward the request to the Firestore API
    const response = await fetch(targetUrl, {
      method: method,
      headers: {
        ...(authHeader ? { 'Authorization': authHeader } : {}),
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
      },
    });
    
    // Read the response data
    const responseData = await response.json();
    
    // Return the response data with CORS headers
    return NextResponse.json(responseData, {
      status: response.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to proxy Firestore request' },
      { status: 500 }
    );
  }
}

/**
 * Handles the POST request to proxy Firestore requests
 */
export async function POST(request: NextRequest) {
  try {
    // Get the path and method from the query parameters
    const url = new URL(request.url);
    const path = url.searchParams.get('path');
    const method = url.searchParams.get('method') || 'POST';
    
    if (!path) {
      return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
    }
    
    // Calculate the URL for the Firestore API
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) {
      return NextResponse.json({ error: 'Firebase project ID not configured' }, { status: 500 });
    }
    
    // Construct the Firestore API URL
    const targetUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
    
    // Get the request body as JSON
    const body = await request.json();
    
    // Get the authorization header from the request
    const authHeader = request.headers.get('authorization');
    
    // Forward the request to the Firestore API
    const response = await fetch(targetUrl, {
      method: method,
      headers: {
        ...(authHeader ? { 'Authorization': authHeader } : {}),
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
      },
      body: JSON.stringify(body),
    });
    
    // Read the response data
    const responseData = await response.json();
    
    // Return the response data with CORS headers
    return NextResponse.json(responseData, {
      status: response.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to proxy Firestore request' },
      { status: 500 }
    );
  }
}

/**
 * Handles the PUT request to proxy Firestore requests
 */
export async function PUT(request: NextRequest) {
  try {
    // Get the path and method from the query parameters
    const url = new URL(request.url);
    const path = url.searchParams.get('path');
    const method = url.searchParams.get('method') || 'PUT';
    
    if (!path) {
      return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
    }
    
    // Calculate the URL for the Firestore API
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) {
      return NextResponse.json({ error: 'Firebase project ID not configured' }, { status: 500 });
    }
    
    // Construct the Firestore API URL
    const targetUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
    
    // Get the request body as JSON
    const body = await request.json();
    
    // Get the authorization header from the request
    const authHeader = request.headers.get('authorization');
    
    // Forward the request to the Firestore API
    const response = await fetch(targetUrl, {
      method: method,
      headers: {
        ...(authHeader ? { 'Authorization': authHeader } : {}),
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
      },
      body: JSON.stringify(body),
    });
    
    // Read the response data
    const responseData = await response.json();
    
    // Return the response data with CORS headers
    return NextResponse.json(responseData, {
      status: response.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to proxy Firestore request' },
      { status: 500 }
    );
  }
}

/**
 * Handles the DELETE request to proxy Firestore requests
 */
export async function DELETE(request: NextRequest) {
  try {
    // Get the path and method from the query parameters
    const url = new URL(request.url);
    const path = url.searchParams.get('path');
    const method = url.searchParams.get('method') || 'DELETE';
    
    if (!path) {
      return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
    }
    
    // Calculate the URL for the Firestore API
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) {
      return NextResponse.json({ error: 'Firebase project ID not configured' }, { status: 500 });
    }
    
    // Construct the Firestore API URL
    const targetUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
    
    // Get the authorization header from the request
    const authHeader = request.headers.get('authorization');
    
    // Forward the request to the Firestore API
    const response = await fetch(targetUrl, {
      method: method,
      headers: {
        ...(authHeader ? { 'Authorization': authHeader } : {}),
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
      },
    });
    
    // Read the response data if available
    const responseData = response.status !== 204 ? await response.json() : {};
    
    // Return the response data with CORS headers
    return NextResponse.json(responseData, {
      status: response.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to proxy Firestore request' },
      { status: 500 }
    );
  }
}

/**
 * Handles the OPTIONS request for CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
} 