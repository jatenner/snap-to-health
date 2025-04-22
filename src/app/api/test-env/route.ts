import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';

export const runtime = 'nodejs';

/**
 * API endpoint to test environment variables
 * Useful for debugging environment variable issues
 */
export async function GET(req: NextRequest) {
  const requestId = nanoid();

  // Safely mask API keys (only show first/last few chars)
  const maskKey = (key: string | undefined) => {
    if (!key) return 'not set';
    return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
  };

  // Check if key format is valid
  const isValidOpenAIKey = (key: string | undefined) => {
    return key && key.startsWith('sk-') && key.length > 20;
  };

  // Get server-side OpenAI API key
  const serverKey = process.env.OPENAI_API_KEY;
  const publicKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;

  // Determine environment
  const isVercel = process.env.VERCEL === '1';
  const environment = process.env.NODE_ENV || 'unknown';
  const deploymentUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_VERCEL_URL 
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : 'localhost';

  // Collect a subset of environment variables to check
  const envVariables = {
    NODE_ENV: environment,
    IS_VERCEL: isVercel,
    FIREBASE_PROJECT_ID: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    FIREBASE_PRIVATE_KEY_SET: !!process.env.FIREBASE_PRIVATE_KEY,
    FIREBASE_PRIVATE_KEY_B64_SET: !!process.env.FIREBASE_PRIVATE_KEY_BASE64,
    NUTRITIONIX_API_ID_SET: !!process.env.NUTRITIONIX_APP_ID,
    NUTRITIONIX_API_KEY_SET: !!process.env.NUTRITIONIX_API_KEY,
  };

  return NextResponse.json({
    openaiApiKey: {
      server: maskKey(serverKey),
      public: maskKey(publicKey),
      serverValid: isValidOpenAIKey(serverKey),
      publicValid: isValidOpenAIKey(publicKey),
      keysMatch: serverKey === publicKey,
    },
    envVariables,
    environment,
    isVercel,
    deploymentUrl,
    requestId,
    timestamp: new Date().toISOString(),
  });
} 