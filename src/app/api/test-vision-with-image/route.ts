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
  // A simple red image (properly formatted for OpenAI)
  apple: '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAoACgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5/ooorQAooooAKKKKACiiigAooooA/9k=',
  // Add more test images as needed
};

/**
 * Fetches an image from a URL and converts it to base64
 */
async function fetchImageAsBase64(imageUrl: string, requestId: string): Promise<string> {
  try {
    console.log(`[${requestId}] Attempting to fetch image from: ${imageUrl}`);
    
    // Setup fetch options with appropriate headers
    const fetchOptions = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Node.js) Snap2Health/1.0',
        'Accept': 'image/*'
      }
    };
    
    const response = await fetch(imageUrl, fetchOptions);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    
    // Check content type to ensure it's an image
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      console.warn(`[${requestId}] WARNING: URL does not return an image content type: ${contentType}`);
    }
    
    console.log(`[${requestId}] Image fetched successfully, content-type: ${contentType}`);
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    
    console.log(`[${requestId}] Image converted to base64, length: ${base64.length}`);
    
    return base64;
  } catch (error) {
    console.error(`[${requestId}] Error fetching image:`, error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  const requestId = uuidv4();
  const url = new URL(request.url);
  
  // Get image source from query params
  const imageSource = url.searchParams.get('image') || 'apple';
  const imageUrl = url.searchParams.get('url');
  const healthGoal = url.searchParams.get('goal') || 'general health';
  
  console.log(`[${requestId}] Testing GPT-4 Vision with image: ${imageUrl || imageSource}`);
  
  try {
    let base64Image: string;
    
    // Get the image data - either from URL or from predefined test images
    if (imageUrl) {
      console.log(`[${requestId}] Fetching image from URL: ${imageUrl}`);
      base64Image = await fetchImageAsBase64(imageUrl, requestId);
    } else {
      base64Image = TEST_IMAGES[imageSource as keyof typeof TEST_IMAGES] || TEST_IMAGES.apple;
      console.log(`[${requestId}] Using predefined test image: ${imageSource}`);
      console.log(`[${requestId}] Base64 length: ${base64Image.length}`);
    }
    
    console.log(`[${requestId}] Sending image to GPT-4 Vision for analysis with goal: ${healthGoal}...`);
    
    try {
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
    } catch (analysisError) {
      console.error(`[${requestId}] Error during GPT-4 Vision analysis:`, analysisError);
      
      // Return a more detailed error response
      return NextResponse.json({
        success: false,
        message: 'GPT-4 Vision food analysis test failed during analysis',
        requestId,
        error: analysisError instanceof Error ? analysisError.message : String(analysisError),
        errorDetail: analysisError instanceof Error ? (analysisError.stack || 'No stack trace available') : 'Unknown error',
        sourceType: imageUrl ? 'url' : 'predefined',
        source: imageUrl || imageSource,
        healthGoal
      }, { status: 500 });
    }
  } catch (error) {
    console.error(`[${requestId}] Error testing GPT-4 Vision:`, error);
    
    return NextResponse.json({
      success: false,
      message: 'GPT-4 Vision food analysis test failed',
      requestId,
      error: error instanceof Error ? error.message : String(error),
      errorDetail: error instanceof Error ? (error.stack || 'No stack trace available') : 'Unknown error',
      sourceType: imageUrl ? 'url' : 'predefined',
      source: imageUrl || imageSource,
      healthGoal
    }, { status: 500 });
  }
} 