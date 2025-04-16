/**
 * This file contains stub implementations of analysis functions
 * to allow the app to compile and unblock the Vercel build.
 */

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
 * Stub implementation for analyzing images with GPT-4V
 */
export async function analyzeImageWithGPT4V(
  base64Image: string,
  healthGoals: string[] = [],
  dietaryPreferences: string[] = [],
  requestId: string
): Promise<any> {
  console.log(`[${requestId}] Analyzing image with GPT-4V...`);
  
  // Return a mock response with fallback data
  return {
    result: createEmptyFallbackAnalysis()
  };
}

/**
 * Stub implementation to check if an analysis needs confidence enrichment
 */
export function needsConfidenceEnrichment(analysis: any): boolean {
  return false;
}

/**
 * Stub implementation to enrich analysis results
 */
export async function enrichAnalysisResult(
  originalResult: any,
  healthGoals: string[],
  dietaryPreferences: string[],
  requestId: string
): Promise<any> {
  return originalResult;
}

/**
 * Stub implementation to validate GPT analysis results
 */
export function validateGptAnalysisResult(analysis: any): { valid: boolean; reason?: string } {
  return { valid: true };
}

/**
 * Stub implementation to create a fallback response
 */
export function createFallbackResponse(reason: string, healthGoal: string, requestId?: string): any {
  return createEmptyFallbackAnalysis();
}

/**
 * Stub implementation for emergency fallback response
 */
export function createEmergencyFallbackResponse(): any {
  return createEmptyFallbackAnalysis();
} 