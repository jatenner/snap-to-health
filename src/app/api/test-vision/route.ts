import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { analyzeWithGPT4Vision } from '@/lib/gptVision';

// Use Node.js runtime for consistency with other API routes
export const runtime = 'nodejs';

/**
 * Creates a simple test image (orange color) for testing GPT-4 Vision
 */
function createTestImage(): string {
  // Create a simple orange-colored base64 PNG
  const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  return base64Image;
}

export async function GET(request: NextRequest) {
  const requestId = uuidv4();
  console.log(`[${requestId}] Testing GPT-4 Vision food analysis...`);
  
  try {
    const base64Image = createTestImage();
    console.log(`[${requestId}] Created test image, sending to GPT-4 Vision...`);
    
    // Use the analyzeWithGPT4Vision function from gptVision.ts
    const result = await analyzeWithGPT4Vision(base64Image, 'general health', requestId);
    
    console.log(`[${requestId}] GPT-4 Vision analysis complete:`, result);
    
    return NextResponse.json({
      success: true,
      message: 'GPT-4 Vision food analysis test completed',
      result
    });
  } catch (error) {
    console.error(`[${requestId}] Error testing GPT-4 Vision:`, error);
    
    return NextResponse.json({
      success: false,
      message: 'GPT-4 Vision food analysis test failed',
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 