/**
 * Utility functions for validating analysis results
 */

/**
 * Checks if an analysis result has the required fields and structure
 * @param data The analysis result object to validate
 * @returns boolean indicating whether the analysis is valid
 */
export function isValidAnalysis(data: any): boolean {
  // First check if data exists and is an object
  if (!data || typeof data !== 'object') {
    console.warn('Analysis validation failed: data is not an object', data);
    return false;
  }

  // Check for required string fields
  if (typeof data.description !== 'string' || !data.description.trim()) {
    console.warn('Analysis validation failed: missing or invalid description', data);
    return false;
  }

  // Check for required array fields
  if (!Array.isArray(data.nutrients)) {
    console.warn('Analysis validation failed: nutrients is not an array', data);
    return false;
  }

  // Validate that feedback is an array if present
  if (data.feedback !== undefined && !Array.isArray(data.feedback)) {
    console.warn('Analysis validation failed: feedback is not an array', data);
    return false;
  }

  // Validate that suggestions is an array if present
  if (data.suggestions !== undefined && !Array.isArray(data.suggestions)) {
    console.warn('Analysis validation failed: suggestions is not an array', data);
    return false;
  }

  // Validate that detailedIngredients is an array if present
  if (data.detailedIngredients !== undefined && !Array.isArray(data.detailedIngredients)) {
    console.warn('Analysis validation failed: detailedIngredients is not an array', data);
    return false;
  }

  // Check for specific number fields if they exist
  if (data.goalScore !== undefined && typeof data.goalScore !== 'number') {
    console.warn('Analysis validation failed: goalScore is not a number', data);
    return false;
  }

  if (data.sleepScore !== undefined && typeof data.sleepScore !== 'number') {
    console.warn('Analysis validation failed: sleepScore is not a number', data);
    return false;
  }

  // All validation checks passed
  return true;
}

/**
 * Creates a fallback analysis result when validation fails
 * @returns A valid fallback analysis object
 */
export function createFallbackAnalysis(): any {
  return {
    description: "Unable to analyze this meal properly",
    nutrients: [],
    feedback: ["We couldn't properly analyze this meal. Please try again with a clearer photo."],
    suggestions: ["Take a photo with better lighting", "Make sure all food items are visible"],
    fallback: true,
    detailedIngredients: [],
    goalScore: 5,
    goalName: "Not Available",
  };
} 