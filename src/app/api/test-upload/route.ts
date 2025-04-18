import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Get the OCR environment variables
  const useOcrExtraction = process.env.USE_OCR_EXTRACTION === 'true';
  const ocrConfidenceThreshold = process.env.OCR_CONFIDENCE_THRESHOLD || '0.7';
  
  // Log it for debugging
  console.log(`OCR settings: extraction=${useOcrExtraction}, confidence threshold=${ocrConfidenceThreshold}`);
  
  // Return the value and some other env vars for debugging
  return NextResponse.json({
    ocrEnabled: useOcrExtraction,
    envVars: {
      USE_OCR_EXTRACTION: process.env.USE_OCR_EXTRACTION,
      OCR_CONFIDENCE_THRESHOLD: ocrConfidenceThreshold,
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
    },
    timestamp: new Date().toISOString()
  });
}