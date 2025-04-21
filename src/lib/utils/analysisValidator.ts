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

  // Track which fields are present or missing for better debugging
  const presentFields = {
    description: false,
    nutrients: false,
    feedback: false,
    suggestions: false,
    modelInfo: false
  };
  
  // Check description - REQUIRED
  if (typeof data.description === 'string' && data.description.trim()) {
    presentFields.description = true;
  } else {
    console.warn('Analysis validation warning: missing or invalid description');
  }

  // Check for nutrients - REQUIRED - can be either an array or an object
  if (Array.isArray(data.nutrients)) {
    // Accept any array, even empty ones - we'll provide defaults in normalization
    presentFields.nutrients = true;
  } else if (typeof data.nutrients === 'object' && data.nutrients !== null) {
    // New format - nutrients as object
    // Accept any structure - we'll normalize later
    presentFields.nutrients = true;
  } else {
    console.warn('Analysis validation warning: missing or invalid nutrients', data.nutrients);
  }

  // Validate that feedback is an array if present - OPTIONAL
  if (Array.isArray(data.feedback)) {
    presentFields.feedback = true;
  } else if (data.feedback !== undefined && !Array.isArray(data.feedback)) {
    console.warn('Analysis validation warning: feedback is present but not an array, will normalize');
  } else {
    console.warn('Analysis validation warning: missing feedback, will use default');
  }

  // Validate that suggestions is an array if present - OPTIONAL
  if (Array.isArray(data.suggestions)) {
    presentFields.suggestions = true;
  } else if (data.suggestions !== undefined && !Array.isArray(data.suggestions)) {
    console.warn('Analysis validation warning: suggestions is present but not an array, will normalize');
  } else {
    console.warn('Analysis validation warning: missing suggestions, will use default');
  }

  // Check if modelInfo is present - OPTIONAL
  if (data.modelInfo && typeof data.modelInfo === 'object') {
    presentFields.modelInfo = true;
  } else {
    console.warn('Analysis validation warning: missing modelInfo, will use default');
  }

  // Validate that detailedIngredients is an array if present
  if (data.detailedIngredients !== undefined && !Array.isArray(data.detailedIngredients)) {
    console.warn('Analysis validation warning: detailedIngredients is present but not an array, will normalize');
  }

  // Less strict validation for numeric fields - accept any value that can be interpreted
  if (data.goalScore !== undefined) {
    if (typeof data.goalScore !== 'number' && 
        typeof data.goalScore !== 'string' && 
        typeof data.goalScore !== 'object') {
      console.warn('Analysis validation warning: goalScore has invalid type, will use default', typeof data.goalScore);
    }
  }

  // NEW VALIDATION RULES: Data is valid if BOTH description AND nutrients are present
  // Other fields are optional and will be filled with defaults if missing
  const isValid = presentFields.description && presentFields.nutrients;
  
  if (isValid) {
    console.log(`Analysis validation passed with required fields:`, {
      description: presentFields.description ? '✅' : '❌',
      nutrients: presentFields.nutrients ? '✅' : '❌',
      feedback: presentFields.feedback ? '✅' : '❌ (optional)',
      suggestions: presentFields.suggestions ? '✅' : '❌ (optional)',
      modelInfo: presentFields.modelInfo ? '✅' : '❌ (optional)',
      fallback: data.fallback ? 'FALLBACK RESULT' : 'NORMAL RESULT'
    });
  } else {
    console.warn('Analysis validation failed: required fields missing', {
      description: presentFields.description,
      nutrients: presentFields.nutrients
    });
  }
  
  return isValid;
}

/**
 * Creates a fallback analysis result when validation fails
 * @returns A valid fallback analysis object
 */
export function createFallbackAnalysis(): any {
  return {
    description: "Unable to analyze this meal properly",
    nutrients: [
      { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
      { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
      { name: 'Carbohydrates', value: 0, unit: 'g', isHighlight: true },
      { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
    ],
    feedback: ["We couldn't properly analyze this meal. Please try again with a clearer photo."],
    suggestions: ["Take a photo with better lighting", "Make sure all food items are visible"],
    fallback: true,
    detailedIngredients: [],
    goalScore: {
      overall: 0,
      specific: {}
    },
    modelInfo: {
      model: "fallback",
      usedFallback: true,
      ocrExtracted: false
    },
    _meta: {
      fallback: true
    }
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
  
  // Ensure description exists - REQUIRED
  if (!result.description || typeof result.description !== 'string' || !result.description.trim()) {
    result.description = "No description provided.";
  }
  
  // Convert nutrients object if needed - REQUIRED
  if (!result.nutrients) {
    result.nutrients = [
      { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
      { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
      { name: 'Carbohydrates', value: 0, unit: 'g', isHighlight: true },
      { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
    ];
  } else if (Array.isArray(result.nutrients)) {
    // If nutrients array is empty, provide defaults
    if (result.nutrients.length === 0) {
      result.nutrients = [
        { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
        { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
        { name: 'Carbohydrates', value: 0, unit: 'g', isHighlight: true },
        { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
      ];
    }
  } else if (typeof result.nutrients === 'object') {
    // Convert object format to array format for frontend compatibility
    const nutrientsArray = [];
    const nutrients = result.nutrients;
    
    // Add calories
    if ('calories' in nutrients) {
      nutrientsArray.push({
        name: 'Calories',
        value: nutrients.calories || 0,
        unit: 'kcal',
        isHighlight: true
      });
    } else {
      nutrientsArray.push({
        name: 'Calories',
        value: 0,
        unit: 'kcal',
        isHighlight: true
      });
    }
    
    // Add protein
    if ('protein' in nutrients) {
      nutrientsArray.push({
        name: 'Protein',
        value: nutrients.protein || 0,
        unit: 'g',
        isHighlight: true
      });
    } else {
      nutrientsArray.push({
        name: 'Protein',
        value: 0,
        unit: 'g',
        isHighlight: true
      });
    }
    
    // Add carbs
    if ('carbs' in nutrients) {
      nutrientsArray.push({
        name: 'Carbohydrates',
        value: nutrients.carbs || 0,
        unit: 'g',
        isHighlight: true
      });
    } else {
      nutrientsArray.push({
        name: 'Carbohydrates',
        value: 0,
        unit: 'g',
        isHighlight: true
      });
    }
    
    // Add fat
    if ('fat' in nutrients) {
      nutrientsArray.push({
        name: 'Fat',
        value: nutrients.fat || 0,
        unit: 'g',
        isHighlight: true
      });
    } else {
      nutrientsArray.push({
        name: 'Fat',
        value: 0,
        unit: 'g',
        isHighlight: true
      });
    }
    
    result.nutrients = nutrientsArray;
  }
  
  // Ensure feedback array exists - OPTIONAL
  if (!result.feedback || !Array.isArray(result.feedback)) {
    console.warn('Normalizing missing or invalid feedback');
    result.feedback = ["No feedback generated."];
  } else if (result.feedback.length === 0) {
    console.warn('Normalizing empty feedback array');
    result.feedback = ["No feedback generated."];
  }
  
  // Ensure suggestions array exists - OPTIONAL
  if (!result.suggestions || !Array.isArray(result.suggestions)) {
    console.warn('Normalizing missing or invalid suggestions');
    result.suggestions = ["Try uploading a clearer image for more detailed analysis."];
  } else if (result.suggestions.length === 0) {
    console.warn('Normalizing empty suggestions array');
    result.suggestions = ["Try uploading a clearer image for more detailed analysis."];
  }
  
  // Ensure detailedIngredients array exists
  if (!result.detailedIngredients || !Array.isArray(result.detailedIngredients)) {
    result.detailedIngredients = [];
  }
  
  // Ensure goalScore structure exists
  if (!result.goalScore || typeof result.goalScore !== 'object') {
    result.goalScore = { overall: 0, specific: {} };
  } else if (typeof result.goalScore === 'number') {
    const scoreValue = result.goalScore;
    result.goalScore = { overall: scoreValue, specific: {} };
  }
  
  // Convert goalScore.overall to number if it's a string that can be parsed
  if (typeof result.goalScore.overall === 'string' && !isNaN(parseFloat(result.goalScore.overall))) {
    result.goalScore.overall = parseFloat(result.goalScore.overall);
  } else if (typeof result.goalScore.overall !== 'number') {
    result.goalScore.overall = 0; // Default to 0 for invalid scores
  }
  
  // Ensure goalScore.specific exists and is an object
  if (!result.goalScore.specific || typeof result.goalScore.specific !== 'object') {
    result.goalScore.specific = {};
  }
  
  // Ensure modelInfo exists - OPTIONAL
  if (!result.modelInfo || typeof result.modelInfo !== 'object') {
    console.warn('Normalizing missing or invalid modelInfo');
    result.modelInfo = {
      model: result.fallback ? "fallback" : "unknown",
      usedFallback: !!result.fallback,
      ocrExtracted: false
    };
  }
  
  return result;
} 