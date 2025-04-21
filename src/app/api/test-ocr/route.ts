import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { runOCR } from '@/lib/runOCR';

/**
 * Creates a test image with text for OCR testing
 */
function createTestImage(): string {
  // Create an image with text for OCR testing
  // This creates a base64 encoded PNG with the text "OCR Test 123"
  // on a white background with black text

  // This is a pre-generated base64 PNG with text "OCR Test 123"
  return 'data:image/png;base64,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';
}

/**
 * Test endpoint for OCR functionality
 * Creates a basic test image and runs OCR on it to verify it works
 */
export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();
  console.log(`🔍 [${requestId}] Running OCR test`);
  
  try {
    // Create a test image with text for OCR
    const testImage = createTestImage();
    
    console.log(`🖼️ [${requestId}] Generated test image for OCR`);
    
    // Run OCR on the test image
    console.log(`🔎 [${requestId}] Running OCR on test image`);
    const startTime = Date.now();
    
    // In build/dev mode, we sometimes want to avoid actual OCR execution
    // to speed up the build process
    if (process.env.NEXT_PUBLIC_MOCK_OCR === 'true' && process.env.NODE_ENV !== 'production') {
      console.log(`⚙️ [${requestId}] Using mock OCR result (NEXT_PUBLIC_MOCK_OCR=true)`);
      
      // Create a mock OCR result
      const mockResult = {
        success: true,
        text: "OCR Test 123",
        confidence: 0.98,
        processingTimeMs: 250,
      };
      
      const result = {
        success: true,
        message: "OCR test completed using mock data",
        requestId,
        model: "mock-ocr",
        result: {
          ...mockResult,
          description: "This is a mock OCR result for testing",
          color: "white",
          shape: "rectangle",
          confidence: 98,
          text: mockResult.text
        }
      };
      
      return NextResponse.json(result);
    }
    
    // Run the actual OCR on the test image
    const ocrResult = await runOCR(testImage, requestId);
    const endTime = Date.now();
    const elapsedMs = endTime - startTime;
    
    console.log(`✅ [${requestId}] OCR test completed in ${elapsedMs}ms`);
    console.log(`📝 [${requestId}] OCR text: "${ocrResult.text}"`);
    console.log(`📊 [${requestId}] OCR confidence: ${(ocrResult.confidence * 100).toFixed(1)}%`);
    
    // Create a result object summarizing the OCR test
    const result = {
      success: true,
      message: "OCR test completed successfully",
      requestId,
      model: "google-vision",
      result: {
        description: "OCR test image analysis",
        background: "white",
        contentType: "text",
        confidence: Math.round(ocrResult.confidence * 100),
        text: ocrResult.text,
        processingTimeMs: ocrResult.processingTimeMs
      }
    };
    
    return NextResponse.json(result);
    
  } catch (error: any) {
    console.error(`❌ [${requestId}] OCR test failed: ${error.message}`);
    
    return NextResponse.json({
      success: false,
      message: `OCR test failed: ${error.message}`,
      requestId,
      error: error.message
    }, { status: 500 });
  }
} 