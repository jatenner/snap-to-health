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
  
  // Check if this is a fallback result (either explicitly marked or indicating low confidence)
  const isFallbackResult = data.fallback === true || 
                           data.lowConfidence === true || 
                           (data.modelInfo?.usedFallback === true) || 
                           (data.modelInfo?.model === "fallback" || data.modelInfo?.model === "gpt_error");
  
  // Check description - accept any non-empty string for fallback results
  if (typeof data.description === 'string' && data.description.trim()) {
    presentFields.description = true;
  } else {
    console.warn('Analysis validation warning: missing or invalid description');
  }

  // Check for nutrients - more flexible validation for fallback results
  if (Array.isArray(data.nutrients)) {
    // For fallback results, accept any array, even empty ones
    // For regular results, require at least one nutrient
    if (data.nutrients.length > 0 || isFallbackResult) {
      presentFields.nutrients = true;
    } else {
      console.warn('Analysis validation warning: nutrients array is empty', data.nutrients);
    }
  } else if (typeof data.nutrients === 'object' && data.nutrients !== null) {
    // New format - nutrients as object
    // Accept any structure - we'll normalize later
    presentFields.nutrients = true;
  } else {
    console.warn('Analysis validation warning: missing or invalid nutrients', data.nutrients);
  }

  // Validate that feedback is an array if present - OPTIONAL
  if (Array.isArray(data.feedback) && data.feedback.length > 0) {
    presentFields.feedback = true;
  } else if (data.feedback !== undefined && !Array.isArray(data.feedback)) {
    console.warn('Analysis validation warning: feedback is present but not an array, will normalize');
  } else if (!isFallbackResult) {
    // Only warn for non-fallback results
    console.warn('Analysis validation warning: missing feedback, will use default');
  }

  // Validate that suggestions is an array if present - OPTIONAL
  if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
    presentFields.suggestions = true;
  } else if (data.suggestions !== undefined && !Array.isArray(data.suggestions)) {
    console.warn('Analysis validation warning: suggestions is present but not an array, will normalize');
  } else if (!isFallbackResult) {
    // Only warn for non-fallback results
    console.warn('Analysis validation warning: missing suggestions, will use default');
  }

  // Check if modelInfo is present - OPTIONAL, but important for identifying fallback results
  if (data.modelInfo && typeof data.modelInfo === 'object') {
    presentFields.modelInfo = true;
  } else if (!isFallbackResult) {
    // Only warn for non-fallback results
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
  
  // TOLERANCE-BASED VALIDATION
  // 1. Critical fields: description and nutrients must always be present or able to be normalized
  const hasCriticalFields = presentFields.description && presentFields.nutrients;
  
  // 2. Insight fields: at least one of feedback, suggestions, or goalScore should be present for non-fallback results
  const hasAnyInsightField = presentFields.feedback || presentFields.suggestions || (data.goalScore !== undefined);
  
  // 3. Fallback tolerance: allow missing insight fields for fallback results
  const hasMinimumViableStructure = hasCriticalFields && (hasAnyInsightField || isFallbackResult);
  
  // 4. Final validation result - accept if coherent structure or explicitly flagged as fallback
  const isValid = hasMinimumViableStructure || isFallbackResult;
  
  // Detailed logging based on validation outcome
  if (isValid) {
    if (hasCriticalFields && hasAnyInsightField) {
      console.log(`Analysis validation passed with all core fields:`, {
        description: presentFields.description ? '✅' : '❌',
        nutrients: presentFields.nutrients ? '✅' : '❌',
        feedback: presentFields.feedback ? '✅' : '❌ (optional)',
        suggestions: presentFields.suggestions ? '✅' : '❌ (optional)',
        modelInfo: presentFields.modelInfo ? '✅' : '❌ (optional)',
        fallback: isFallbackResult ? 'FALLBACK RESULT' : 'NORMAL RESULT'
      });
    } else {
      // Fallback or minimal result accepted
      console.log(`Analysis validation passed with fallback tolerance:`, {
        description: presentFields.description ? '✅' : '❌',
        nutrients: presentFields.nutrients ? '✅' : '❌',
        anyInsightField: hasAnyInsightField ? '✅' : '❌',
        isFallback: isFallbackResult ? '✅' : '❌',
        modelInfo: presentFields.modelInfo ? '✅' : '❌ (optional)'
      });
    }
    console.info("[Test] Fallback result accepted ✅");
  } else {
    console.warn('Analysis validation failed: insufficient structure for rendering', {
      description: presentFields.description,
      nutrients: presentFields.nutrients,
      anyInsightField: hasAnyInsightField,
      isFallback: isFallbackResult
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
  // If data is completely missing or not an object, return a complete fallback
  if (!data || typeof data !== 'object') {
    console.warn('Analysis data is invalid - creating complete fallback', data);
    return createFallbackAnalysis();
  }
  
  const result = { ...data };
  
  // Check if this is a fallback result
  const isFallbackResult = result.fallback === true || 
                          result.lowConfidence === true || 
                          (result.modelInfo?.usedFallback === true) || 
                          (result.modelInfo?.model === "fallback" || result.modelInfo?.model === "gpt_error");
  
  // Ensure description exists - REQUIRED
  if (!result.description || typeof result.description !== 'string' || !result.description.trim()) {
    console.warn('Normalizing missing or invalid description');
    result.description = isFallbackResult 
      ? "This meal was analyzed with limited information" 
      : "No description provided.";
  }
  
  // Convert nutrients object if needed - REQUIRED
  if (!result.nutrients) {
    console.warn('Normalizing missing nutrients');
    result.nutrients = [
      { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
      { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
      { name: 'Carbohydrates', value: 0, unit: 'g', isHighlight: true },
      { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
    ];
  } else if (Array.isArray(result.nutrients)) {
    // If nutrients array is empty, provide defaults
    if (result.nutrients.length === 0) {
      console.warn('Normalizing empty nutrients array');
      result.nutrients = [
        { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
        { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
        { name: 'Carbohydrates', value: 0, unit: 'g', isHighlight: true },
        { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
      ];
    } else {
      // Ensure all nutrients have required properties
      result.nutrients = result.nutrients.map((nutrient: any) => {
        if (!nutrient || typeof nutrient !== 'object') {
          return { name: 'Unknown', value: 0, unit: 'g', isHighlight: false };
        }
        
        // Handle different value formats (string, number, or missing)
        let value = 0;
        if (nutrient.value !== undefined) {
          if (typeof nutrient.value === 'number') {
            value = nutrient.value;
          } else if (typeof nutrient.value === 'string' && !isNaN(parseFloat(nutrient.value))) {
            value = parseFloat(nutrient.value);
          }
        }
        
        return {
          name: nutrient.name || 'Unknown',
          value: value,
          unit: nutrient.unit || 'g',
          isHighlight: !!nutrient.isHighlight
        };
      });
    }
  } else if (typeof result.nutrients === 'object') {
    // Convert object format to array format for frontend compatibility
    console.warn('Normalizing nutrients object to array');
    const nutrientsArray = [];
    const nutrients = result.nutrients;
    
    // Add calories
    if ('calories' in nutrients) {
      nutrientsArray.push({
        name: 'Calories',
        value: nutrients.calories ?? 0,
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
        value: nutrients.protein ?? 0,
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
        value: nutrients.carbs ?? 0,
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
        value: nutrients.fat ?? 0,
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
    result.feedback = isFallbackResult 
      ? ["Analysis based on extracted text. Results may be limited."] 
      : ["No feedback generated."];
  } else if (result.feedback.length === 0) {
    console.warn('Normalizing empty feedback array');
    result.feedback = isFallbackResult 
      ? ["Analysis based on extracted text. Results may be limited."] 
      : ["No feedback generated."];
  }
  
  // Ensure suggestions array exists - OPTIONAL
  if (!result.suggestions || !Array.isArray(result.suggestions)) {
    console.warn('Normalizing missing or invalid suggestions');
    result.suggestions = isFallbackResult 
      ? ["Try uploading a clearer image for more detailed analysis."] 
      : ["No suggestions available."];
  } else if (result.suggestions.length === 0) {
    console.warn('Normalizing empty suggestions array');
    result.suggestions = isFallbackResult 
      ? ["Try uploading a clearer image for more detailed analysis."] 
      : ["No suggestions available."];
  }
  
  // Ensure detailedIngredients array exists
  if (!result.detailedIngredients || !Array.isArray(result.detailedIngredients)) {
    console.warn('Normalizing missing or invalid detailedIngredients');
    result.detailedIngredients = [];
  } else {
    // Normalize each ingredient to ensure it has all required properties
    result.detailedIngredients = result.detailedIngredients.map((ingredient: any) => {
      if (!ingredient || typeof ingredient !== 'object') {
        return { name: 'Unknown', category: 'unknown', confidence: 0, confidenceEmoji: '🔴' };
      }
      
      return {
        name: ingredient.name || 'Unknown',
        category: ingredient.category || 'unknown',
        confidence: typeof ingredient.confidence === 'number' ? ingredient.confidence : 0,
        confidenceEmoji: ingredient.confidenceEmoji || '🔴'
      };
    });
  }
  
  // Ensure goalScore structure exists
  if (!result.goalScore || typeof result.goalScore !== 'object') {
    console.warn('Normalizing missing or invalid goalScore');
    result.goalScore = { 
      overall: isFallbackResult ? 3 : 5, 
      specific: {} 
    };
  } else if (typeof result.goalScore === 'number') {
    const scoreValue = result.goalScore;
    result.goalScore = { overall: scoreValue, specific: {} };
  }
  
  // Convert goalScore.overall to number if it's a string that can be parsed
  if (typeof result.goalScore.overall === 'string' && !isNaN(parseFloat(result.goalScore.overall))) {
    result.goalScore.overall = parseFloat(result.goalScore.overall);
  } else if (typeof result.goalScore.overall !== 'number' || isNaN(result.goalScore.overall)) {
    console.warn('Normalizing invalid goalScore.overall', result.goalScore.overall);
    result.goalScore.overall = isFallbackResult ? 3 : 5; // Lower default for fallback results
  }
  
  // Ensure goalScore.specific exists and is an object
  if (!result.goalScore.specific || typeof result.goalScore.specific !== 'object') {
    console.warn('Normalizing missing or invalid goalScore.specific');
    result.goalScore.specific = {};
  }
  
  // Ensure goalName is a string if present
  if (result.goalName !== undefined && typeof result.goalName !== 'string') {
    console.warn('Normalizing invalid goalName', result.goalName);
    result.goalName = 'Health Impact';
  } else if (result.goalName === undefined) {
    console.warn('Normalizing missing goalName');
    result.goalName = 'Health Impact';
  }
  
  // Ensure modelInfo exists - OPTIONAL
  if (!result.modelInfo || typeof result.modelInfo !== 'object') {
    console.warn('Normalizing missing or invalid modelInfo');
    result.modelInfo = {
      model: isFallbackResult ? "fallback" : "unknown",
      usedFallback: isFallbackResult,
      ocrExtracted: true // Assume OCR extraction for fallback results
    };
  } else {
    // Make sure modelInfo has all required fields
    if (result.modelInfo.model === undefined) {
      result.modelInfo.model = isFallbackResult ? "fallback" : "unknown";
    }
    if (result.modelInfo.usedFallback === undefined) {
      result.modelInfo.usedFallback = isFallbackResult;
    }
    if (result.modelInfo.ocrExtracted === undefined) {
      result.modelInfo.ocrExtracted = true; // Default to true as most use OCR now
    }
  }
  
  // Ensure positiveFoodFactors and negativeFoodFactors arrays exist
  if (!Array.isArray(result.positiveFoodFactors)) {
    console.warn('Normalizing missing or invalid positiveFoodFactors');
    result.positiveFoodFactors = [];
  }
  
  if (!Array.isArray(result.negativeFoodFactors)) {
    console.warn('Normalizing missing or invalid negativeFoodFactors');
    result.negativeFoodFactors = [];
  }
  
  // Mark as fallback explicitly if it's not already set
  if (!result.fallback && (
      !data.description || 
      ((!data.nutrients || (Array.isArray(data.nutrients) && data.nutrients.length === 0))) ||
      result.modelInfo?.usedFallback === true ||
      result.modelInfo?.model === "fallback" ||
      result.modelInfo?.model === "gpt_error"
    )) {
    console.warn('Setting fallback=true due to detected fallback characteristics');
    result.fallback = true;
    
    // Don't automatically set lowConfidence - this can be separate from fallback
    if (result.lowConfidence === undefined && 
        (!data.description || (!data.nutrients || (Array.isArray(data.nutrients) && data.nutrients.length === 0)))) {
      result.lowConfidence = true;
    }
    
    // Add meta object for easier detection if not already present
    if (!result._meta) {
      result._meta = {
        fallback: true,
        reason: 'Fallback result detected'
      };
    }
  }
  
  // Add debug log for normalized results
  console.info("[Test] Result normalized and ready for rendering ✅");
  
  return result;
} 