import { NextRequest, NextResponse } from 'next/server';

/**
 * Simple API endpoint to check environment variables at runtime
 */
export async function GET(request: NextRequest) {
  // Get the OpenAI API key
  const openaiApiKey = process.env.OPENAI_API_KEY || '';
  
  // Return a masked version of the key for security
  const maskedKey = openaiApiKey ? 
    `${openaiApiKey.substring(0, 10)}...${openaiApiKey.substring(openaiApiKey.length - 4)}` :
    'Not set';
  
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    openai: {
      apiKey: maskedKey,
      apiKeyLength: openaiApiKey.length,
      apiKeyPrefix: openaiApiKey.substring(0, 8),
      apiKeySuffix: openaiApiKey.substring(openaiApiKey.length - 4),
      useOcrExtraction: process.env.USE_OCR_EXTRACTION === 'true',
      ocrConfidenceThreshold: process.env.OCR_CONFIDENCE_THRESHOLD || '0.7'
    }
  });
} 