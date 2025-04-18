import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Get the environment variable
  const forceGPT4V = process.env.USE_GPT4_VISION !== 'false';
  
  // Log it for debugging
  console.log(`USE_GPT4_VISION setting: ${forceGPT4V ? 'true (forced)' : 'false (fallback allowed)'}`);
  
  // Return the value and some other env vars for debugging
  return NextResponse.json({
    gpt4vForced: forceGPT4V,
    envVars: {
      USE_GPT4_VISION: process.env.USE_GPT4_VISION,
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
    },
    timestamp: new Date().toISOString()
  });
}