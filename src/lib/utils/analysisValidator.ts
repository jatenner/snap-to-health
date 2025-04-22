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

  // If result.success is explicitly true, prioritize this signal
  if (data.success === true) {
    console.log('Analysis validation passed: result.success is true');
    return true;
  }

  // Track which fields are present or missing for better debugging
  const presentFields = {
    description: false,
    nutrients: false
  };
  
  // Check if this is a fallback result (either explicitly marked or indicating low confidence)
  const isFallbackResult = data.fallback === true || 
                           data.lowConfidence === true || 
                           (data.modelInfo?.usedFallback === true) || 
                           (data.modelInfo?.model === "fallback" || data.modelInfo?.model === "gpt_error");
  
  // Check description - accept any string, even empty ones
  if (typeof data.description === 'string') {
    presentFields.description = true;
  } else {
    console.warn('Analysis validation warning: missing or invalid description');
  }

  // Check for nutrients - more flexible validation
  if (Array.isArray(data.nutrients)) {
    // Accept any array, even empty ones
    presentFields.nutrients = true;
  } else if (typeof data.nutrients === 'object' && data.nutrients !== null) {
    // New format - nutrients as object
    // Accept any structure - we'll normalize later
    presentFields.nutrients = true;
  } else {
    console.warn('Analysis validation warning: missing or invalid nutrients', data.nutrients);
  }

  // VALIDATION CRITERIA
  // 1. Accept if data has a valid structure (description and nutrients)
  const hasRequiredStructure = presentFields.description && presentFields.nutrients;
  
  // 2. Accept if it's a fallback result
  const isValid = hasRequiredStructure || isFallbackResult;
  
  // Detailed logging based on validation outcome
  if (isValid) {
    console.log(`Analysis validation passed`, {
      description: presentFields.description ? '✅' : '❌',
      nutrients: presentFields.nutrients ? '✅' : '❌',
      fallback: isFallbackResult ? 'FALLBACK RESULT' : 'NORMAL RESULT'
    });
  } else {
    console.warn('Analysis validation failed: insufficient structure for rendering', {
      description: presentFields.description,
      nutrients: presentFields.nutrients,
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
  
  // Check if this is a result with label detection
  const hasLabelDetection = result._meta?.usedLabelDetection === true && 
                          result._meta?.detectedLabel && 
                          result._meta?.labelConfidence > 0.65;
  
  // Check if this is a fallback result
  const isFallbackResult = result.fallback === true || 
                          result.lowConfidence === true || 
                          (result.modelInfo?.usedFallback === true) || 
                          (result.modelInfo?.model === "fallback" || result.modelInfo?.model === "gpt_error");
  
  // Special cases for results with missing parts but valid label detection
  const hasValidLabelDetection = hasLabelDetection && !isFallbackResult;
  
  // If we have successful label detection, consider it as non-fallback
  // even if some fields are missing
  const useAsNormalResult = hasValidLabelDetection || !isFallbackResult;
  
  // Determine description based on label detection, if available
  let defaultDescription = "This meal was analyzed with limited information";
  if (hasLabelDetection) {
    defaultDescription = `Detected ${result._meta.detectedLabel} with ${Math.round(result._meta.labelConfidence * 100)}% confidence`;
  } else if (result._meta?.knownFoodWords?.length > 0) {
    defaultDescription = `This appears to be ${result._meta.knownFoodWords.join(', ')}`;
  }
  
  // Ensure description exists - REQUIRED
  if (!result.description || typeof result.description !== 'string') {
    console.warn('Normalizing missing or invalid description');
    result.description = isFallbackResult 
      ? defaultDescription 
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
    const nutrientArray = [];
    
    // Handle various object formats
    if (result.nutrients.calories !== undefined) {
      nutrientArray.push({ 
        name: 'Calories', 
        value: parseFloat(result.nutrients.calories) || 0, 
        unit: 'kcal', 
        isHighlight: true 
      });
    }
    
    if (result.nutrients.protein !== undefined) {
      nutrientArray.push({ 
        name: 'Protein', 
        value: parseFloat(result.nutrients.protein) || 0, 
        unit: 'g', 
        isHighlight: true 
      });
    }
    
    if (result.nutrients.carbs !== undefined || result.nutrients.carbohydrates !== undefined) {
      nutrientArray.push({ 
        name: 'Carbohydrates', 
        value: parseFloat(result.nutrients.carbs || result.nutrients.carbohydrates) || 0, 
        unit: 'g', 
        isHighlight: true 
      });
    }
    
    if (result.nutrients.fat !== undefined) {
      nutrientArray.push({ 
        name: 'Fat', 
        value: parseFloat(result.nutrients.fat) || 0, 
        unit: 'g', 
        isHighlight: true 
      });
    }
    
    // If no nutrients were extracted, create default ones
    if (nutrientArray.length === 0) {
      nutrientArray.push(
        { name: 'Calories', value: 0, unit: 'kcal', isHighlight: true },
        { name: 'Protein', value: 0, unit: 'g', isHighlight: true },
        { name: 'Carbohydrates', value: 0, unit: 'g', isHighlight: true },
        { name: 'Fat', value: 0, unit: 'g', isHighlight: true }
      );
    }
    
    result.nutrients = nutrientArray;
  }
  
  // Ensure feedback array exists - OPTIONAL but provide defaults if missing
  if (!result.feedback || !Array.isArray(result.feedback)) {
    if (hasValidLabelDetection) {
      result.feedback = [`Detected food item: ${result._meta.detectedLabel} with ${Math.round(result._meta.labelConfidence * 100)}% confidence.`];
    } else {
      result.feedback = isFallbackResult 
        ? ["Analysis based on extracted text. Results may be limited."] 
        : ["No feedback generated."];
    }
  } else if (result.feedback.length === 0) {
    if (hasValidLabelDetection) {
      result.feedback = [`Detected food item: ${result._meta.detectedLabel} with ${Math.round(result._meta.labelConfidence * 100)}% confidence.`];
    } else {
      result.feedback = isFallbackResult 
        ? ["Analysis based on extracted text. Results may be limited."] 
        : ["No feedback generated."];
    }
  }
  
  // Ensure suggestions array exists - OPTIONAL but provide defaults if missing
  if (!result.suggestions || !Array.isArray(result.suggestions)) {
    if (hasValidLabelDetection) {
      result.suggestions = ["Complete nutritional information based on detected food."];
    } else {
      result.suggestions = isFallbackResult 
        ? ["Try uploading a clearer image for more detailed analysis."] 
        : ["No suggestions available."];
    }
  } else if (result.suggestions.length === 0) {
    if (hasValidLabelDetection) {
      result.suggestions = ["Complete nutritional information based on detected food."];
    } else {
      result.suggestions = isFallbackResult 
        ? ["Try uploading a clearer image for more detailed analysis."] 
        : ["No suggestions available."];
    }
  }
  
  // Ensure detailedIngredients array exists
  if (!result.detailedIngredients || !Array.isArray(result.detailedIngredients)) {
    if (hasValidLabelDetection) {
      // If we have successful label detection, add the detected item as the main ingredient
      result.detailedIngredients = [{
        name: result._meta.detectedLabel,
        category: 'food',
        confidence: result._meta.labelConfidence,
        confidenceEmoji: result._meta.labelConfidence > 0.8 ? '✅' : '⚠️'
      }];
    } else {
      result.detailedIngredients = [];
    }
  }
  
  // Only mark as fallback if explicitly missing required fields, not for optional ones
  if (!isFallbackResult) {
    // Only set fallback=true if we're missing absolutely critical components
    const hasNoNutrients = !result.nutrients || (Array.isArray(result.nutrients) && result.nutrients.length === 0);
    const hasNoDescription = !result.description || typeof result.description !== 'string';
    
    // Set fallback ONLY if we're missing BOTH critical components AND we don't have label detection
    if ((hasNoNutrients && hasNoDescription) && !hasValidLabelDetection) {
      console.log('Setting fallback=true due to detected completely missing critical data');
      result.fallback = true;
      
      // Also update modelInfo
      if (result.modelInfo) {
        result.modelInfo.usedFallback = true;
      }
    }
  }
  
  // Ensure goalScore structure exists
  if (!result.goalScore || typeof result.goalScore !== 'object') {
    // Adapt score based on label detection confidence
    let score = isFallbackResult ? 3 : 5;
    if (hasValidLabelDetection) {
      // Scale score based on detection confidence (0.65-1.0) → (3-8)
      score = Math.round(3 + (result._meta.labelConfidence - 0.65) * (8 - 3) / (1 - 0.65));
      score = Math.min(8, Math.max(3, score)); // Clamp between 3-8
    }
    
    result.goalScore = { 
      overall: score, 
      specific: {} 
    };
  }
  
  // Add debug log for normalized results
  console.info("[Test] Result normalized and ready for rendering ✅");
  
  return result;
} 