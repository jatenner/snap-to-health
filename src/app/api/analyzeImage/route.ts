import { NextRequest, NextResponse } from 'next/server';
import { processImageAnalysisRequest } from '@/lib/imageAnalysisHandler';

// Use Node.js runtime since we depend on Node.js specific modules
export const runtime = 'nodejs';

/**
 * POST handler for the /api/analyzeImage endpoint
 * Processes an image and returns a nutritional analysis using GPT-4o vision
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return processImageAnalysisRequest(req);
}
