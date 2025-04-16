import { NextResponse } from 'next/server';

/**
 * Creates an empty fallback analysis result for when image processing fails
 */
export function createEmptyFallbackAnalysis() {
  return {
    fallback: true,
    success: false,
    description: "Unable to analyze the image",
    ingredientList: [],
    detailedIngredients: [],
    confidence: 0,
    basicNutrition: {
      calories: "Unknown",
      protein: "Unknown",
      carbs: "Unknown",
      fat: "Unknown"
    },
    goalImpactScore: 0,
    goalName: "Unknown",
    scoreExplanation: "We couldn't analyze this image properly. Please try again with a clearer photo.",
    feedback: [
      "We couldn't process this image. This could be due to the image being invalid, corrupted, or not containing food.",
      "Try uploading a clearer photo with good lighting.",
      "Make sure your image shows the food items clearly."
    ],
    suggestions: [
      "Take photos in good lighting",
      "Ensure your food is clearly visible in the frame",
      "Use a higher quality image if possible"
    ],
    imageChallenges: ["Unable to process image"]
  };
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