/**
 * OCR Text Extraction Utility
 * Uses Tesseract.js for client-side OCR
 */

// Import dynamically to avoid SSR issues
let createWorker: any = null;

// Define interface for OCR result
export interface OCRResult {
  success: boolean;
  text: string;
  confidence: number;
  error?: string;
  processingTimeMs: number;
  regions?: Array<{id: string, text: string, confidence: number}>;
}

/**
 * Extract text from an image using OCR
 * @param base64Image Base64 encoded image
 * @param requestId Request ID for logging
 * @returns Extracted text and confidence score
 */
export async function runOCR(
  base64Image: string,
  requestId: string
): Promise<OCRResult> {
  console.time(`⏱️ [${requestId}] runOCR`);
  console.log(`🔍 [${requestId}] Starting OCR text extraction`);
  
  const startTime = Date.now();
  
  try {
    // Dynamically import tesseract.js to avoid SSR issues
    if (!createWorker) {
      const tesseract = await import('tesseract.js');
      createWorker = tesseract.createWorker;
    }

    // Check environment variable for confidence threshold
    const confidenceThreshold = process.env.OCR_CONFIDENCE_THRESHOLD 
      ? parseFloat(process.env.OCR_CONFIDENCE_THRESHOLD)
      : 0.7;
    
    // Create worker with logging
    const worker: any = await createWorker();
    
    // Log progress manually
    console.log(`📊 [${requestId}] OCR initializing...`);
    
    // Load language and initialize
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    console.log(`📊 [${requestId}] OCR engine initialized`);
    
    // Set parameters for better results with food labels
    await worker.setParameters({
      tessedit_pageseg_mode: '6', // Assume single uniform block of text
      tessedit_char_whitelist: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:%$()[]"-/& ', // Common characters in food labels
    });
    
    // Run OCR on the image
    console.log(`🔍 [${requestId}] Processing image with Tesseract.js`);
    const result = await worker.recognize(base64Image);
    
    // Clean up worker
    await worker.terminate();
    
    // Calculate processing time
    const processingTimeMs = Date.now() - startTime;
    
    // Log results
    const confidence = result.data.confidence / 100; // Convert to 0-1 scale
    const textLength = result.data.text.length;
    console.log(`✅ [${requestId}] OCR completed in ${processingTimeMs}ms`);
    console.log(`📊 [${requestId}] Confidence: ${(confidence * 100).toFixed(1)}%, Text length: ${textLength} chars`);
    
    // Check if confidence is too low or text too short
    if (confidence < confidenceThreshold) {
      console.warn(`⚠️ [${requestId}] OCR confidence below threshold: ${(confidence * 100).toFixed(1)}% < ${(confidenceThreshold * 100).toFixed(1)}%`);
      if (textLength > 10) {
        // Return result but note low confidence
        console.log(`ℹ️ [${requestId}] Returning low confidence result as text length is sufficient: ${textLength} chars`);
        return {
          success: true,
          text: result.data.text,
          confidence,
          processingTimeMs,
          error: 'Low confidence OCR result'
        };
      } else {
        // Not enough text and low confidence
        return {
          success: false,
          text: '',
          confidence,
          processingTimeMs,
          error: 'OCR produced insufficient text with low confidence'
        };
      }
    }
    
    // Return successful result
    return {
      success: true,
      text: result.data.text,
      confidence,
      processingTimeMs
    };
  } catch (error) {
    const processingTimeMs = Date.now() - startTime;
    console.error(`❌ [${requestId}] OCR failed:`, error);
    return {
      success: false,
      text: '',
      confidence: 0,
      error: error instanceof Error ? error.message : String(error),
      processingTimeMs
    };
  }
}

/**
 * Extract text from multiple regions of an image
 * Useful for food labels with different sections
 * @param base64Image Base64 encoded image
 * @param requestId Request ID for logging
 * @returns Combined extracted text from all regions
 */
export async function runAdvancedOCR(
  base64Image: string,
  requestId: string
): Promise<OCRResult> {
  console.time(`⏱️ [${requestId}] runAdvancedOCR`);
  console.log(`🔍 [${requestId}] Starting advanced OCR with region detection`);
  
  const startTime = Date.now();
  
  try {
    // First run standard OCR
    const standardResult = await runOCR(base64Image, requestId);
    
    if (!standardResult.success) {
      throw new Error(standardResult.error || 'Standard OCR failed');
    }
    
    // Enhanced processing could be added here:
    // 1. Image preprocessing (contrast, sharpening)
    // 2. Image segmentation to different regions
    // 3. Running OCR on each region separately
    
    // For now, we're just using the standard OCR result
    const regions = [
      {
        id: 'full',
        text: standardResult.text,
        confidence: standardResult.confidence
      }
    ];
    
    const endTime = Date.now();
    const processingTimeMs = endTime - startTime;
    
    console.log(`✅ [${requestId}] Advanced OCR complete in ${processingTimeMs}ms`);
    console.timeEnd(`⏱️ [${requestId}] runAdvancedOCR`);
    
    return {
      success: standardResult.success,
      text: standardResult.text,
      confidence: standardResult.confidence,
      regions,
      processingTimeMs
    };
  } catch (error: any) {
    console.error(`❌ [${requestId}] Advanced OCR failed:`, error);
    console.timeEnd(`⏱️ [${requestId}] runAdvancedOCR`);
    
    const endTime = Date.now();
    const processingTimeMs = endTime - startTime;
    
    return {
      success: false,
      text: '',
      confidence: 0,
      error: error.message || 'Unknown OCR error',
      processingTimeMs
    };
  }
} 