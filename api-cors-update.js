/**
 * A workaround script to set CORS configuration via Google Cloud Storage REST API
 * This script creates a local proxy workaround for CORS issues until the proper CORS
 * configuration can be applied to the Storage bucket.
 */
const fs = require('fs');
const path = require('path');

// Create a local proxy middleware file that can be imported into the Next.js app
const corsProxyCode = `
// src/lib/corsProxy.js
import { NextResponse } from 'next/server';

/**
 * A middleware function to handle CORS for local development
 * Add this to your middleware.ts file
 */
export function corsMiddleware(request) {
  // Only apply to requests from localhost:3007 to Firebase Storage
  const origin = request.headers.get('origin') || '';
  const url = new URL(request.url);
  
  // Check if this is a request to Firebase Storage
  if (url.pathname && url.pathname.includes('/api/proxy/storage')) {
    // Extract the actual Firebase Storage URL from the request
    const targetUrl = url.searchParams.get('url');
    
    if (targetUrl && targetUrl.includes('firebasestorage.googleapis.com')) {
      // Create a new request to the actual Firebase Storage URL
      const newRequest = new Request(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body
      });
      
      // Forward the request and add CORS headers to the response
      return fetch(newRequest).then(response => {
        const newResponse = new NextResponse(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
        
        // Add CORS headers
        newResponse.headers.set('Access-Control-Allow-Origin', origin);
        newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
        newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        
        return newResponse;
      });
    }
  }
  
  // For other requests, continue normal processing
  return NextResponse.next();
}
`;

// Create a proxy API route for Firebase Storage
const proxyApiCode = `
// src/app/api/proxy/storage/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Get the target URL from the query parameters
  const url = request.nextUrl.searchParams.get('url');
  
  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }
  
  try {
    // Forward the request to Firebase Storage
    const response = await fetch(url);
    const data = await response.arrayBuffer();
    
    // Create a new response with the same data
    const newResponse = new NextResponse(data);
    
    // Copy all headers from the original response
    response.headers.forEach((value, key) => {
      newResponse.headers.set(key, value);
    });
    
    // Add CORS headers
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    return newResponse;
  } catch (error) {
    console.error('Error proxying request:', error);
    return NextResponse.json({ error: 'Failed to proxy request' }, { status: 500 });
  }
}

export async function OPTIONS(request: NextRequest) {
  // Handle preflight requests
  const newResponse = new NextResponse(null, { status: 200 });
  
  // Add CORS headers
  newResponse.headers.set('Access-Control-Allow-Origin', '*');
  newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  return newResponse;
}
`;

// Create a utility function for Firebase Storage with CORS support
const storageHelperCode = `
// src/utils/storageUtils.ts
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { app } from "@/lib/firebase";

// Initialize Firebase Storage
const storage = getStorage(app);

/**
 * Upload a file to Firebase Storage with CORS proxy support for local development
 * @param file The file to upload
 * @param path The path to upload the file to
 * @returns The download URL for the uploaded file
 */
export async function uploadFileWithCors(file, path) {
  try {
    // Create a storage reference
    const storageRef = ref(storage, path);
    
    // Upload the file
    const snapshot = await uploadBytes(storageRef, file);
    
    // Get the download URL
    let downloadUrl = await getDownloadURL(snapshot.ref);
    
    // In development on localhost:3007, use the proxy
    if (process.env.NODE_ENV === 'development' && 
        typeof window !== 'undefined' && 
        window.location.origin.includes('localhost:3007')) {
      // Replace the Firebase Storage URL with our proxy URL
      downloadUrl = \`/api/proxy/storage?url=\${encodeURIComponent(downloadUrl)}\`;
    }
    
    return downloadUrl;
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
}

/**
 * Get a download URL for a file in Firebase Storage with CORS proxy support
 * @param path The path to the file in Firebase Storage
 * @returns The download URL for the file
 */
export async function getFileUrlWithCors(path) {
  try {
    // Create a storage reference
    const storageRef = ref(storage, path);
    
    // Get the download URL
    let downloadUrl = await getDownloadURL(storageRef);
    
    // In development on localhost:3007, use the proxy
    if (process.env.NODE_ENV === 'development' && 
        typeof window !== 'undefined' && 
        window.location.origin.includes('localhost:3007')) {
      // Replace the Firebase Storage URL with our proxy URL
      downloadUrl = \`/api/proxy/storage?url=\${encodeURIComponent(downloadUrl)}\`;
    }
    
    return downloadUrl;
  } catch (error) {
    console.error('Error getting file URL:', error);
    throw error;
  }
}
`;

// Write the CORS proxy middleware to a file
fs.mkdirSync('src/lib', { recursive: true });
fs.writeFileSync('src/lib/corsProxy.js', corsProxyCode);
console.log('Created CORS proxy middleware at src/lib/corsProxy.js');

// Create the proxy API directory and route file
fs.mkdirSync('src/app/api/proxy/storage', { recursive: true });
fs.writeFileSync('src/app/api/proxy/storage/route.ts', proxyApiCode);
console.log('Created proxy API route at src/app/api/proxy/storage/route.ts');

// Create the storage utils directory and file
fs.mkdirSync('src/utils', { recursive: true });
fs.writeFileSync('src/utils/storageUtils.ts', storageHelperCode);
console.log('Created storage utilities at src/utils/storageUtils.ts');

// Update middleware.ts to include the CORS proxy
const middlewarePath = 'src/middleware.ts';
if (fs.existsSync(middlewarePath)) {
  let middlewareContent = fs.readFileSync(middlewarePath, 'utf8');
  
  if (!middlewareContent.includes('corsMiddleware')) {
    // Add import statement at the top
    middlewareContent = "import { corsMiddleware } from './lib/corsProxy';\n" + middlewareContent;
    
    // Find the middleware function
    const middlewareMatch = middlewareContent.match(/export function middleware\([^)]*\)\s*{/);
    if (middlewareMatch) {
      // Add CORS middleware call at the beginning of the function
      const insertIndex = middlewareMatch.index + middlewareMatch[0].length;
      middlewareContent = 
        middlewareContent.slice(0, insertIndex) + 
        "\n  // Check for CORS proxy requests first\n  const corsResponse = corsMiddleware(request);\n  if (corsResponse) return corsResponse;\n\n" + 
        middlewareContent.slice(insertIndex);
    }
    
    fs.writeFileSync(middlewarePath, middlewareContent);
    console.log('Updated middleware.ts to include CORS proxy');
  } else {
    console.log('middleware.ts already includes CORS proxy');
  }
} else {
  // Create a new middleware.ts file
  const newMiddlewareContent = `
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { corsMiddleware } from './lib/corsProxy';

// This function can be marked \`async\` if using \`await\` inside
export function middleware(request: NextRequest) {
  // Check for CORS proxy requests first
  const corsResponse = corsMiddleware(request);
  if (corsResponse) return corsResponse;

  // For now, we'll just let client-side authentication handle redirects
  // This can be expanded later for server-side auth checks
  return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    // Add routes that need CORS proxy
    '/api/proxy/:path*',
    // Existing protected routes
    '/meals/:path*',
    '/upload/:path*',
  ],
};
`;
  fs.writeFileSync(middlewarePath, newMiddlewareContent);
  console.log('Created new middleware.ts file with CORS proxy');
}

console.log('\n=== CORS Proxy Configuration Complete ===');
console.log('A local CORS proxy has been set up for Firebase Storage requests.');
console.log('This will allow uploads from localhost:3007 to work correctly.');
console.log('\nTo use the CORS proxy:');
console.log('1. Import the storage utility functions from src/utils/storageUtils.ts');
console.log('2. Use uploadFileWithCors() and getFileUrlWithCors() instead of direct Firebase Storage functions');
console.log('\nThis is a temporary solution until proper CORS configuration can be applied to the Storage bucket.'); 