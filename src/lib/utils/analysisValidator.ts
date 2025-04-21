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
  if (!result.description || typeof result.description !== 'string' || !result.description.trim()) {
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
  
  // Ensure feedback array exists - OPTIONAL
  if (!result.feedback || !Array.isArray(result.feedback)) {
    console.warn('Normalizing missing or invalid feedback');
    if (hasValidLabelDetection) {
      result.feedback = [`Detected food item: ${result._meta.detectedLabel} with ${Math.round(result._meta.labelConfidence * 100)}% confidence.`];
    } else {
      result.feedback = isFallbackResult 
        ? ["Analysis based on extracted text. Results may be limited."] 
        : ["No feedback generated."];
    }
  } else if (result.feedback.length === 0) {
    console.warn('Normalizing empty feedback array');
    if (hasValidLabelDetection) {
      result.feedback = [`Detected food item: ${result._meta.detectedLabel} with ${Math.round(result._meta.labelConfidence * 100)}% confidence.`];
    } else {
      result.feedback = isFallbackResult 
        ? ["Analysis based on extracted text. Results may be limited."] 
        : ["No feedback generated."];
    }
  }
  
  // Ensure suggestions array exists - OPTIONAL
  if (!result.suggestions || !Array.isArray(result.suggestions)) {
    console.warn('Normalizing missing or invalid suggestions');
    if (hasValidLabelDetection) {
      result.suggestions = ["Complete nutritional information based on detected food."];
    } else {
      result.suggestions = isFallbackResult 
        ? ["Try uploading a clearer image for more detailed analysis."] 
        : ["No suggestions available."];
    }
  } else if (result.suggestions.length === 0) {
    console.warn('Normalizing empty suggestions array');
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
    console.warn('Normalizing missing or invalid detailedIngredients');
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
  
  // Check if we should set fallback=true based on result characteristics
  if (!isFallbackResult) {
    // If we don't have enough data to be useful, mark as fallback
    const hasNoNutrients = !result.nutrients || (Array.isArray(result.nutrients) && result.nutrients.length === 0);
    const hasNoDescription = !result.description || typeof result.description !== 'string' || !result.description.trim();
    const hasNoIngredients = !result.detailedIngredients || !Array.isArray(result.detailedIngredients) || result.detailedIngredients.length === 0;
    
    // Set fallback if we're missing critical components, UNLESS we have label detection success
    if ((hasNoNutrients || hasNoDescription || hasNoIngredients) && !hasValidLabelDetection) {
      console.log('Setting fallback=true due to detected fallback characteristics');
      result.fallback = true;
      
      // Also update modelInfo
      if (result.modelInfo) {
        result.modelInfo.usedFallback = true;
      }
    }
  }
  
  // Ensure goalScore structure exists
  if (!result.goalScore || typeof result.goalScore !== 'object') {
    console.warn('Normalizing missing or invalid goalScore');
    
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