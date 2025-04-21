import { NextRequest, NextResponse } from 'next/server';
import { analyzeWithGPT4Vision } from '../analyzeImage/route';

// Create a simple orange-colored test image
function createTestImage(): string {
  // This is a simple 1x1 orange pixel encoded as base64 PNG
  // We're using a hardcoded minimal image to avoid server-side canvas issues
  return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
}

export async function GET(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(2, 15);
  
  try {
    console.log(`[${requestId}] Testing GPT-4 Vision analysis`);
    
    // Create a simple test image - an orange image
    const imageBase64 = createTestImage();
    console.log(`[${requestId}] Using test image (${imageBase64.length} chars)`);
    
    // Test with a simple goal
    const healthGoal = 'general health';
    
    // Use GPT-4 Vision to analyze the image
    const result = await analyzeWithGPT4Vision(imageBase64, healthGoal, requestId);
    
    // Return the analysis result
    return NextResponse.json({
      success: true,
      message: 'GPT-4 Vision test completed successfully',
      result
    });
  } catch (error: any) {
    console.error(`[${requestId}] Test failed:`, error);
    
    return NextResponse.json({
      success: false,
      message: `GPT-4 Vision test failed: ${error.message}`,
      error: error.message
    }, { status: 500 });
  }
} 