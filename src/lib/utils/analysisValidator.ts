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

  // Check for nutrients - can be either an array or an object
  if (Array.isArray(data.nutrients)) {
    // Original format - nutrients as array
    if (data.nutrients.length === 0) {
      console.warn('Analysis validation failed: nutrients array is empty', data);
      return false;
    }
    
    // Don't validate nutrient values strictly - allow 0, empty strings, etc.
    // This enables fallback results to pass validation
  } else if (typeof data.nutrients === 'object' && data.nutrients !== null) {
    // New format - nutrients as object with specific fields
    const requiredFields = ['calories', 'protein', 'carbs', 'fat'];
    const missingFields = requiredFields.filter(field => !(field in data.nutrients));
    
    if (missingFields.length > 0) {
      console.warn(`Analysis validation failed: nutrients object missing fields: ${missingFields.join(', ')}`, data);
      return false;
    }
  } else {
    console.warn('Analysis validation failed: nutrients is neither an array nor an object', data);
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

  // Less strict validation for numeric fields - accept any value that can be interpreted
  if (data.goalScore !== undefined) {
    if (typeof data.goalScore !== 'number' && 
        typeof data.goalScore !== 'string' && 
        typeof data.goalScore !== 'object') {
      console.warn('Analysis validation failed: goalScore has invalid type', typeof data.goalScore);
      // Don't fail validation for this - provide a default in normalizeAnalysisResult instead
    }
  }

  // All validation checks passed
  console.log('Analysis validation passed for result:', data.fallback ? 'FALLBACK RESULT' : 'NORMAL RESULT');
  return true;
}

/**
 * Creates a fallback analysis result when validation fails
 * @returns A valid fallback analysis object
 */
export function createFallbackAnalysis(): any {
  return {
    description: "Unable to analyze this meal properly",
    nutrients: {
      calories: "Unknown",
      protein: "Unknown",
      carbs: "Unknown",
      fat: "Unknown"
    },
    feedback: ["We couldn't properly analyze this meal. Please try again with a clearer photo."],
    suggestions: ["Take a photo with better lighting", "Make sure all food items are visible"],
    fallback: true,
    detailedIngredients: [],
    goalScore: 5,
    goalName: "Not Available",
    message: "Analysis failed due to issues with image interpretation or formatting"
  };
}

/**
 * Normalizes an analysis result to ensure it has a consistent structure
 * @param data The analysis result to normalize
 * @returns The normalized analysis result
 */
export function normalizeAnalysisResult(data: any): any {
  if (!data || typeof data !== 'object') {
    return createFallbackAnalysis();
  }
  
  const result = { ...data };
  
  // Ensure description exists
  if (!result.description) {
    result.description = "Food items identified in the image";
  }
  
  // Convert nutrients object if needed
  if (!result.nutrients) {
    result.nutrients = {
      calories: "Unknown",
      protein: "Unknown",
      carbs: "Unknown",
      fat: "Unknown"
    };
  } else if (Array.isArray(result.nutrients)) {
    // If nutrients is an array (old format), convert to object (new format)
    const nutrientsObj: any = {
      calories: "Unknown",
      protein: "Unknown",
      carbs: "Unknown",
      fat: "Unknown"
    };
    
    // Try to extract relevant nutrients from the array
    for (const nutrient of result.nutrients) {
      if (nutrient.name && nutrient.value) {
        const name = nutrient.name.toLowerCase();
        if (name.includes('calorie') || name.includes('energy')) {
          nutrientsObj.calories = nutrient.value;
        } else if (name.includes('protein')) {
          nutrientsObj.protein = nutrient.value;
        } else if (name.includes('carb')) {
          nutrientsObj.carbs = nutrient.value;
        } else if (name.includes('fat')) {
          nutrientsObj.fat = nutrient.value;
        }
      }
    }
    
    result.nutrients = nutrientsObj;
  } else {
    // Ensure all required nutrient fields exist
    const nutrients = result.nutrients;
    if (!('calories' in nutrients)) nutrients.calories = "Unknown";
    if (!('protein' in nutrients)) nutrients.protein = "Unknown";
    if (!('carbs' in nutrients)) nutrients.carbs = "Unknown";
    if (!('fat' in nutrients)) nutrients.fat = "Unknown";
  }
  
  // Ensure feedback array exists
  if (!result.feedback || !Array.isArray(result.feedback) || result.feedback.length === 0) {
    result.feedback = ["Consider taking a clearer photo for more accurate analysis"];
  }
  
  // Ensure suggestions array exists
  if (!result.suggestions || !Array.isArray(result.suggestions) || result.suggestions.length === 0) {
    result.suggestions = ["Ensure all food items are visible in the photo"];
  }
  
  // Ensure detailedIngredients array exists
  if (!result.detailedIngredients || !Array.isArray(result.detailedIngredients)) {
    result.detailedIngredients = [];
  }
  
  // Convert goalScore to number if it's a string that can be parsed
  if (typeof result.goalScore === 'string' && !isNaN(parseFloat(result.goalScore))) {
    result.goalScore = parseFloat(result.goalScore);
  } else if (typeof result.goalScore !== 'number') {
    result.goalScore = 5; // Default to middle score
  }
  
  // Convert sleepScore to number if it's a string that can be parsed
  if (typeof result.sleepScore === 'string' && !isNaN(parseFloat(result.sleepScore))) {
    result.sleepScore = parseFloat(result.sleepScore);
  }
  
  return result;
} 