import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { runOCR } from '@/lib/runOCR';

// Create a small red square as a base64 image for testing
function createRedSquareImage(): string {
  // This is a 10x10 red square PNG
  return 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAGElEQVR42mP8z8BQz0AEYBxVSF+FAABqegX3winNOAAAAABJRU5ErkJggg==';
}

export async function GET(request: NextRequest) {
  try {
    // Generate a request ID for tracking
    const requestId = crypto.randomBytes(6).toString('hex');
    console.log(`🧪 [${requestId}] Testing OCR text extraction capabilities`);
    
    // Get base64 test image
    const base64Image = createRedSquareImage();
    console.log(`🖼️ [${requestId}] Created test image (red square)`);
    
    // Run OCR on the test image
    console.log(`⏳ [${requestId}] Running OCR on test image`);
    const ocrResult = await runOCR(base64Image, requestId);
    
    // Process the OCR result
    if (ocrResult.success) {
      console.log(`✅ [${requestId}] OCR completed successfully`);
      console.log(`📊 [${requestId}] Confidence: ${ocrResult.confidence}, Text length: ${ocrResult.text.length}`);
    } else {
      console.warn(`⚠️ [${requestId}] OCR failed: ${ocrResult.error}`);
    }
    
    // Create a result object
    const result = {
      description: "OCR test image analysis",
      color: "red",
      shape: "square",
      confidence: Math.round(ocrResult.confidence * 100),
      text: ocrResult.text || "(No text detected)",
      processingTimeMs: ocrResult.processingTimeMs
    };
    
    // Return the test results
    return NextResponse.json({
      success: true,
      message: 'OCR test completed',
      requestId,
      model: 'tesseract-ocr',
      result: result,
      ocrResult: {
        success: ocrResult.success,
        confidence: ocrResult.confidence,
        processingTimeMs: ocrResult.processingTimeMs,
        error: ocrResult.error
      }
    });
    
  } catch (error: any) {
    console.error(`Error in test-vision endpoint:`, error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error',
      statusCode: error.status || error.statusCode || 500
    }, { status: 500 });
  }
} 