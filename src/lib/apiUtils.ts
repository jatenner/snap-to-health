import { NextResponse } from 'next/server';

/**
 * Creates a standardized API response for image analysis errors
 */
export function createErrorResponse(
  requestId: string,
  error: string,
  details?: any,
  meta: Record<string, any> = {}
): NextResponse {
  const response = {
    status: 200, // Always use HTTP 200, even for errors
    success: false,
    requestId,
    message: error,
    errors: [error],
    debug: {
      requestId,
      errorDetails: [
        {
          step: 'api_error',
          error,
          details
        }
      ]
    },
    _meta: {
      imageError: error,
      ...meta
    },
    analysis: createEmptyFallbackAnalysis()
  };
  
  return NextResponse.json(response, { status: 200 });
}

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
 * Validates an image input (file, blob or base64 string)
 */
export function validateImageInput(input: any): { valid: boolean; error?: string } {
  if (!input) {
    return { valid: false, error: 'No image uploaded' };
  }
  
  if (typeof input === 'string') {
    if (input.length === 0) {
      return { valid: false, error: 'Empty string provided as image data' };
    }
    
    // If it's a base64 data URL, check basic format
    if (input.startsWith('data:')) {
      const parts = input.split(',');
      if (parts.length < 2 || !parts[0].includes('image/')) {
        return { valid: false, error: 'Invalid image data format' };
      }
      if (parts[1].length < 100) {
        return { valid: false, error: 'Image data too small to be valid' };
      }
    }
  } else if (typeof input === 'object') {
    // For File/Blob objects
    if ('size' in input && input.size === 0) {
      return { valid: false, error: 'Empty file provided (zero bytes)' };
    }
    
    // Check MIME type if available
    if ('type' in input && typeof input.type === 'string') {
      if (!input.type.startsWith('image/')) {
        return { valid: false, error: `Invalid file type: ${input.type}. Expected an image.` };
      }
    }
  }
  
  return { valid: true };
}

/**
 * Safe wrapper for image processing in API routes
 */
export async function safelyProcessImage(
  imageInput: any, 
  processor: (input: any) => Promise<any>,
  requestId: string
): Promise<{ success: boolean; result?: any; error?: string }> {
  try {
    // First validate the input
    const validation = validateImageInput(imageInput);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
    
    // Process the image
    const result = await processor(imageInput);
    return { success: true, result };
  } catch (error: any) {
    return { 
      success: false, 
      error: error?.message || 'Unknown image processing error'
    };
  }
} 