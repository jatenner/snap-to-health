import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const openaiKey = process.env.OPENAI_API_KEY;
  
  // Log for debugging
  console.log("OpenAI Key present:", !!openaiKey);
  
  return NextResponse.json({
    keyPresent: !!openaiKey,
    keyPrefix: openaiKey ? openaiKey.substring(0, 7) : 'none',
    keyLength: openaiKey ? openaiKey.length : 0,
    isProjKey: openaiKey ? openaiKey.startsWith('sk-proj-') : false,
    isOrgKey: openaiKey ? openaiKey.startsWith('sk-org-') : false,
    environment: process.env.NODE_ENV,
    isVercel: !!process.env.VERCEL || !!process.env.VERCEL_URL
  });
} 