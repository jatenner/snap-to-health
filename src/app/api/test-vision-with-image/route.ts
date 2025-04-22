import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { analyzeWithGPT4Vision } from '@/lib/gptVision';

// Use Node.js runtime for consistency with other API routes
export const runtime = 'nodejs';

// A collection of predefined test images
const TEST_IMAGES = {
  orange: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', // Orange pixel
  green: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwABAgEAhjn6nQAAAABJRU5ErkJggg==', // Green pixel
  blue: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==', // Blue pixel
  red: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', // Red pixel
  // Add more test images as needed
};

/**
 * Fetches an image from a URL and converts it to base64
 */
async function fetchImageAsBase64(imageUrl: string): Promise<string> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer.toString('base64');
  } catch (error) {
    console.error('Error fetching image:', error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  const requestId = uuidv4();
  const url = new URL(request.url);
  
  // Get image source from query params
  const imageSource = url.searchParams.get('image') || 'orange';
  const imageUrl = url.searchParams.get('url');
  const healthGoal = url.searchParams.get('goal') || 'general health';
  
  console.log(`[${requestId}] Testing GPT-4 Vision with image: ${imageUrl || imageSource}`);
  
  try {
    let base64Image: string;
    
    // Get the image data - either from URL or from predefined test images
    if (imageUrl) {
      console.log(`[${requestId}] Fetching image from URL: ${imageUrl}`);
      base64Image = await fetchImageAsBase64(imageUrl);
    } else {
      base64Image = TEST_IMAGES[imageSource as keyof typeof TEST_IMAGES] || TEST_IMAGES.orange;
      console.log(`[${requestId}] Using predefined test image: ${imageSource}`);
    }
    
    console.log(`[${requestId}] Sending image to GPT-4 Vision for analysis with goal: ${healthGoal}...`);
    
    // Use the analyzeWithGPT4Vision function from gptVision.ts
    const result = await analyzeWithGPT4Vision(base64Image, healthGoal, requestId);
    
    console.log(`[${requestId}] GPT-4 Vision analysis complete`);
    
    return NextResponse.json({
      success: true,
      message: 'GPT-4 Vision food analysis test completed',
      requestId,
      result,
      sourceType: imageUrl ? 'url' : 'predefined',
      source: imageUrl || imageSource,
      healthGoal,
      processingTimeMs: result.processingTimeMs
    });
  } catch (error) {
    console.error(`[${requestId}] Error testing GPT-4 Vision:`, error);
    
    return NextResponse.json({
      success: false,
      message: 'GPT-4 Vision food analysis test failed',
      requestId,
      error: error instanceof Error ? error.message : String(error),
      sourceType: imageUrl ? 'url' : 'predefined',
      source: imageUrl || imageSource,
      healthGoal
    }, { status: 500 });
  }
} 