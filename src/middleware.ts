import { corsMiddleware } from './lib/corsProxy';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// This function can be marked `async` if using `await` inside
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
    // Add protected routes here if needed
    // '/meals/:path*',
    // '/upload/:path*',
  ],
}; 