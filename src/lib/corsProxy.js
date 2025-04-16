// src/lib/corsProxy.js
import { NextResponse } from 'next/server';

/**
 * A middleware function to handle CORS for local development
 * Add this to your middleware.ts file
 */
export function corsMiddleware(request) {
  // Check if this is a request to the storage proxy
  const url = new URL(request.url);
  
  if (url.pathname && url.pathname.includes('/api/proxy/storage')) {
    console.log('CORS middleware: Detected storage proxy request');
    
    // Extract the actual Firebase Storage URL from the request
    const targetUrl = url.searchParams.get('url');
    
    if (!targetUrl) {
      console.error('CORS middleware: Missing url parameter');
      return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }
    
    if (targetUrl.includes('firebasestorage.googleapis.com')) {
      console.log(`CORS middleware: Proxying request to Firebase Storage: ${targetUrl.substring(0, 50)}...`);
      
      // Let the proxy handler handle this
      return null;
    }
  }
  
  // For OPTIONS preflight requests to the API, add CORS headers
  if (request.method === 'OPTIONS' && url.pathname && url.pathname.startsWith('/api/')) {
    console.log(`CORS middleware: Handling preflight request to ${url.pathname}`);
    
    // Handle preflight requests with proper CORS headers
    const response = new NextResponse(null, { status: 200 });
    
    // Get the requesting origin or allow all in development
    const origin = request.headers.get('origin') || '*';
    
    // Set CORS headers
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    response.headers.set('Access-Control-Max-Age', '86400'); // 24 hours
    
    return response;
  }
  
  // For other requests, continue normal processing
  return NextResponse.next();
}
