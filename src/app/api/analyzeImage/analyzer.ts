import { NextResponse } from 'next/server';
import { createEmptyFallbackAnalysis as createEmptyFallbackAnalysisUtil } from '@/lib/analyzeImageWithGPT4V';
import crypto from 'crypto';

/**
 * Creates an empty fallback analysis result for when image processing fails
 */
export function createEmptyFallbackAnalysis() {
  return createEmptyFallbackAnalysisUtil(
    crypto.randomUUID(), 
    'none', 
    'Analysis failed due to image processing error'
  );
}

/**
 * Helper function to create a standardized NextResponse
 */
export function createAnalysisResponse(data: any): NextResponse {
  // Always return 200 status, put actual status in the response body
  return NextResponse.json(data, { status: 200 });
}

/**
 * Creates an error response with fallback analysis
 */
export function createErrorResponse(requestId: string, error: string, details?: any): NextResponse {
  return createAnalysisResponse({
    status: 200,
    success: false,
    requestId,
    message: error,
    errors: [error],
    debug: {
      requestId,
      errorDetails: [{ 
        step: 'error', 
        error, 
        details
      }]
    },
    _meta: {
      imageError: error
    },
    fallback: true,
    analysis: createEmptyFallbackAnalysis()
  });
}

/**
 * Safely extracts base64 image data with proper error handling
 */
export async function safeExtractImage(
  rawFile: any, 
  extractFn: Function, 
  requestId: string
): Promise<{ success: boolean; base64Image?: string; error?: string }> {
  try {
    // Check for null/undefined input
    if (!rawFile) {
      return { 
        success: false, 
        error: 'No image uploaded' 
      };
    }
    
    // Try to extract the image
    const base64Image = await extractFn(rawFile, requestId);
    
    // Validate the result
    if (!base64Image) {
      return { 
        success: false, 
        error: 'Image could not be converted to base64'
      };
    }
    
    return {
      success: true,
      base64Image
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Image extraction failed: ${error?.message || 'Unknown error'}`
    };
  }
} 