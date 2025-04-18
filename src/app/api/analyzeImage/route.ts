/**
 * Upload a base64 image to Firebase Storage for a specific user
 */
async function uploadImageToFirebase(base64Image: string, userId: string, requestId: string): Promise<string | null> {
  if (!userId) {
    console.warn(`⚠️ [${requestId}] No user ID provided for Firebase upload`);
    return null;
  }
  
  if (!base64Image) {
    console.error(`❌ [${requestId}] No base64 image provided for Firebase upload`);
    return null;
  }
  
  try {
    // Import Firebase functions dynamically to avoid SSR issues
    const { getStorage, ref, uploadString, getDownloadURL } = await import('firebase/storage');
    const { getFirebaseApp } = await import('@/lib/firebase');
    
    // Get Firebase app instance
    const app = getFirebaseApp();
    const storage = getStorage(app);
    
    // Generate a unique filename including the request ID
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 10);
    const filename = `meals/${userId}/${timestamp}-${randomId}-${requestId}.jpg`;
    
    // Create a reference to the file location
    const storageRef = ref(storage, filename);
    
    console.log(`⏳ [${requestId}] Uploading image to Firebase: ${filename}`);
    
    // Extract the base64 data (remove data URL prefix if present)
    let base64Data = base64Image;
    if (base64Data.includes('base64,')) {
      base64Data = base64Data.split('base64,')[1];
    }
    
    // Upload the image
    const snapshot = await uploadString(storageRef, base64Data, 'base64');
    
    // Get the public URL
    const downloadURL = await getDownloadURL(storageRef);
    
    console.log(`✅ [${requestId}] Image uploaded successfully to Firebase (${Math.round(snapshot.bytesTransferred / 1024)}KB)`);
    
    return downloadURL;
  } catch (error) {
    console.error(`❌ [${requestId}] Firebase upload error:`, error);
    return null;
  }
}

/**
 * Extract JSON from text, handling different formats and potential malformed responses
 */
function extractJSONFromText(text: string, requestId: string): any | null {
  if (!text || typeof text !== 'string') {
    console.warn(`⚠️ [${requestId}] extractJSONFromText: Invalid input - not a string or empty`);
    return null;
  }

  // First attempt: direct parsing if it's already valid JSON
  try {
    const parsed = JSON.parse(text);
    console.log(`✅ [${requestId}] Successfully parsed text directly as JSON`);
    return parsed;
  } catch (error) {
    // Not valid JSON, continue to alternative extraction methods
  }
  
  // Second attempt: find JSON within the text using regex
  try {
    const jsonRegex = /{(?:[^{}]|{(?:[^{}]|{[^{}]*})*})*}/g;
    const matches = text.match(jsonRegex);
    
    if (matches && matches.length > 0) {
      // Sort matches by length (longest first, as it's likely the most complete)
      const sortedMatches = [...matches].sort((a, b) => b.length - a.length);
      
      // Try to parse each match
      for (const match of sortedMatches) {
        try {
          const parsed = JSON.parse(match);
          console.log(`✅ [${requestId}] Successfully extracted JSON using regex`);
          return parsed;
        } catch (innerError) {
          // Continue to next match
        }
      }
    }
  } catch (error) {
    // Continue to next method
  }
  
  // Third attempt: look for code blocks (common in newer models)
  try {
    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/;
    const match = text.match(codeBlockRegex);
    
    if (match && match[1]) {
      try {
        const parsed = JSON.parse(match[1]);
        console.log(`✅ [${requestId}] Successfully extracted JSON from code block`);
        return parsed;
      } catch (error) {
        // Try with additional cleaning
        try {
          const cleaned = match[1]
            .replace(/(\r\n|\n|\r)/gm, '')  // Remove line breaks
            .replace(/,\s*}/g, '}')         // Remove trailing commas in objects
            .replace(/,\s*]/g, ']')         // Remove trailing commas in arrays
            .replace(/'/g, '"')             // Replace single quotes with double quotes
            .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3'); // Quote unquoted keys
            
          const parsed = JSON.parse(cleaned);
          console.log(`✅ [${requestId}] Successfully extracted JSON from cleaned code block`);
          return parsed;
        } catch (cleanError) {
          // Continue to next method
        }
      }
    }
  } catch (error) {
    // Continue to next method
  }
  
  console.warn(`⚠️ [${requestId}] Failed to extract JSON from text using all methods`);
  return null;
}

/**
 * Validate that an analysis result contains all required fields
 */
function validateRequiredFields(result: any): boolean {
  if (!result) return false;
  
  // Required top-level fields
  const requiredFields = [
    'description', 
    'nutrients', 
    'feedback', 
    'suggestions', 
    'detailedIngredients'
  ];
  
  // Check each required field exists
  const missingFields = requiredFields.filter(field => !result[field]);
  
  if (missingFields.length > 0) {
    console.warn(`Analysis missing required fields: ${missingFields.join(', ')}`);
    return false;
  }
  
  return true;
}

/**
 * Standardize nutrient values to ensure consistent format
 */
function standardizeNutrientValues(result: any): any {
  if (!result || !result.nutrients) return result;
  
  const standardized = { ...result };
  
  // Handle array format
  if (Array.isArray(standardized.nutrients)) {
    standardized.nutrients = standardized.nutrients.map((nutrient: any) => {
      const standardizedNutrient = { ...nutrient };
      
      // Convert value to string if it's a number
      if (typeof standardizedNutrient.value === 'number') {
        standardizedNutrient.value = standardizedNutrient.value.toString();
      }
      
      return standardizedNutrient;
    });
  }
  
  return standardized;
}

/**
 * Check if an analysis needs confidence enrichment
 */
function needsConfidenceEnrichment(analysis: any): boolean {
  // This is a stub implementation
  return false;
}

/**
 * Mock implementation for backward compatibility during migration
 */
async function enrichAnalysisResult(
  originalResult: any,
  healthGoals: string[],
  dietaryPreferences: string[],
  requestId: string
): Promise<any> {
  return originalResult;
}

/**
 * Validate that a GPT analysis result contains all required fields in the correct format
 */
function validateGptAnalysisResult(analysis: any): boolean {
  if (!analysis) {
    console.warn(`Analysis validation failed: analysis is null or undefined`);
    return false;
  }
  
  // Check for required top-level fields
  const requiredFields = [
    'description', 
    'nutrients', 
    'feedback', 
    'suggestions', 
    'detailedIngredients'
  ];
  
  for (const field of requiredFields) {
    if (!analysis[field]) {
      console.warn(`Analysis validation failed: missing '${field}'`);
      return false;
    }
  }
  
  // Check nutrients structure - either array or object format is acceptable
  if (Array.isArray(analysis.nutrients)) {
    if (analysis.nutrients.length === 0) {
      console.warn(`Analysis validation failed: nutrients array is empty`);
      return false;
    }
    
    // Check if the array contains at least one valid nutrient
    const hasValidNutrient = analysis.nutrients.some((nutrient: any) => 
      nutrient && typeof nutrient === 'object' && 
      nutrient.name && 
      (nutrient.value !== undefined)
    );
    
    if (!hasValidNutrient) {
      console.warn(`Analysis validation failed: nutrients array does not contain valid nutrient objects`);
      return false;
    }
  } else if (typeof analysis.nutrients === 'object') {
    // If nutrients is an object, check for at least one of the required nutrients
    const requiredNutrients = ['calories', 'protein', 'carbs', 'fat'];
    const hasRequiredNutrient = requiredNutrients.some(nutrient => 
      typeof analysis.nutrients[nutrient] === 'number' || 
      typeof analysis.nutrients[nutrient] === 'string'
    );
    
    if (!hasRequiredNutrient) {
      console.warn(`Analysis validation failed: nutrients object does not contain any required nutrients`);
      return false;
    }
  } else {
    console.warn(`Analysis validation failed: nutrients is neither an array nor an object`);
    return false;
  }
  
  // Ensure arrays are present
  const requiredArrays = ['suggestions', 'detailedIngredients'];
  for (const arrayField of requiredArrays) {
    if (!Array.isArray(analysis[arrayField])) {
      console.warn(`Analysis validation failed: '${arrayField}' is not an array`);
      return false;
    }
  }
  
  // Ensure feedback is either a string or an array
  if (typeof analysis.feedback !== 'string' && !Array.isArray(analysis.feedback)) {
    console.warn(`Analysis validation failed: 'feedback' is neither a string nor an array`);
    return false;
  }
  
  return true;
}

/**
 * Create a standardized API response
 */
function createAnalysisResponse(data: any): NextResponse {
  // Ensure timestamps are complete
  data.debug.timestamps.end = new Date().toISOString();
  
  // Log completion
  console.timeEnd(`⏱️ [${data.requestId}] Total API execution time`);
  
  return NextResponse.json(data, { status: 200 });
}

/**
 * Use the utility function from the library
 */
function createFallbackResponse(reason: string, partialResult: any): any {
  return createFallbackResponseUtil(reason, partialResult);
}

/**
 * Create a sanitized analysis response with fallback defaults
 */
function createSanitizedAnalysisResponse(responseData: any, analysisResult: any, modelInfo: any): NextResponse {
  // Clone the response data to avoid mutation
  const responseToSend = { ...responseData };
  
  // Start with a valid, empty fallback analysis
  const sanitizedAnalysis = createEmptyFallbackAnalysis();
  
  // Override with any valid data from the actual result
  if (analysisResult) {
    // Copy basic fields if they exist and are valid
    if (typeof analysisResult.description === 'string') {
      sanitizedAnalysis.description = analysisResult.description;
    }
    
    // Handle feedback (string or array)
    if (typeof analysisResult.feedback === 'string') {
      sanitizedAnalysis.feedback = analysisResult.feedback;
    } else if (Array.isArray(analysisResult.feedback) && analysisResult.feedback.length > 0) {
      sanitizedAnalysis.feedback = analysisResult.feedback.join('. ');
    }
    
    // Handle suggestions (array)
    if (Array.isArray(analysisResult.suggestions) && analysisResult.suggestions.length > 0) {
      sanitizedAnalysis.suggestions = analysisResult.suggestions;
    }
    
    // Handle detailed ingredients
    if (Array.isArray(analysisResult.detailedIngredients) && analysisResult.detailedIngredients.length > 0) {
      sanitizedAnalysis.detailedIngredients = analysisResult.detailedIngredients;
    }
    
    // Handle nutrients (array or object format)
    if (analysisResult.nutrients) {
      if (Array.isArray(analysisResult.nutrients) && analysisResult.nutrients.length > 0) {
        sanitizedAnalysis.nutrients = analysisResult.nutrients;
      } else if (typeof analysisResult.nutrients === 'object') {
        // Convert object format to array format
        const nutrientsArray = [];
        const coreNutrients = [
          { key: 'calories', unit: 'kcal', highlight: true },
          { key: 'protein', unit: 'g', highlight: true },
          { key: 'carbs', unit: 'g', highlight: true },
          { key: 'fat', unit: 'g', highlight: true }
        ];
        
        for (const { key, unit, highlight } of coreNutrients) {
          let value = '0';
          if (analysisResult.nutrients[key] !== undefined) {
            value = String(analysisResult.nutrients[key]);
          }
          nutrientsArray.push({ name: key, value, unit, isHighlight: highlight });
        }
        
        // Add other nutrients if present
        Object.keys(analysisResult.nutrients).forEach(key => {
          if (!['calories', 'protein', 'carbs', 'fat'].includes(key)) {
            nutrientsArray.push({
              name: key,
              value: String(analysisResult.nutrients[key]),
              unit: key === 'sodium' ? 'mg' : 'g',
              isHighlight: false
            });
          }
        });
        
        sanitizedAnalysis.nutrients = nutrientsArray;
      }
    }
    
    // Handle goal score
    if (analysisResult.goalScore) {
      if (typeof analysisResult.goalScore === 'number') {
        sanitizedAnalysis.goalScore.overall = Math.max(0, Math.min(100, analysisResult.goalScore));
      } else if (typeof analysisResult.goalScore === 'object') {
        if (typeof analysisResult.goalScore.overall === 'number') {
          sanitizedAnalysis.goalScore.overall = Math.max(0, Math.min(100, analysisResult.goalScore.overall));
        }
        
        if (analysisResult.goalScore.specific && typeof analysisResult.goalScore.specific === 'object') {
          sanitizedAnalysis.goalScore.specific = analysisResult.goalScore.specific;
        }
      }
    }
    
    // Copy metadata if it exists
    if (analysisResult.metadata && typeof analysisResult.metadata === 'object') {
      sanitizedAnalysis.metadata = {
        ...sanitizedAnalysis.metadata,
        ...analysisResult.metadata
      };
    }
  }
  
  // Add model information to the analysis result
  // Use type assertion to avoid TypeScript errors
  const finalAnalysis = sanitizedAnalysis as any;
  if (modelInfo) {
    finalAnalysis.modelInfo = modelInfo;
  }
  
  // Set success and fallback flags based on whether this is a valid analysis
  const isValidAnalysis = validateGptAnalysisResult(analysisResult);
  responseToSend.success = isValidAnalysis;
  responseToSend.fallback = !isValidAnalysis;
  
  // Set appropriate message
  if (!isValidAnalysis) {
    responseToSend.message = "Analysis couldn't be completed. We've provided the best information available.";
    finalAnalysis.metadata.fallback = true;
  }
  
  // Combine everything into the final response
  responseToSend.analysis = finalAnalysis;
  
  // Log what we're returning
  console.log(`📤 [${responseToSend.requestId}] Returning ${isValidAnalysis ? 'valid' : 'fallback'} analysis with structure:`, 
    Object.keys(finalAnalysis).join(', '));
  
  return NextResponse.json(responseToSend, { status: 200 });
}

/**
 * The main POST handler for image analysis
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Generate a unique request ID for tracing this request through logs
  const requestId = Math.random().toString(36).substring(2, 10);
  console.time(`⏱️ [${requestId}] Total API execution time`);
  console.log(`✨ [${requestId}] Starting /api/analyzeImage POST request`);
  
  // Initialize response object we'll build throughout the process
  const responseData: any = {
    status: 200,
    success: false,
    requestId,
    message: 'Analysis starting',
    errors: [],
    debug: {
      requestId,
      timestamps: {
        start: new Date().toISOString(),
        imageProcessed: null,
        analysisCompleted: null,
        enrichmentCompleted: null,
        end: null
      },
      processingSteps: [],
      conversionMethod: null,
      errorDetails: [],
      rawGptResponse: null
    },
    _meta: {
      imageError: null  // Add this to track image-related errors
    }
  };
  
  try {
    // Validate request content type
    const contentType = request.headers.get('content-type');
    if (!contentType) {
      const error = 'Missing Content-Type header';
      responseData.errors.push(error);
      responseData.message = error;
      return createAnalysisResponse(responseData);
    }
    
    // Parse request data
    let requestData: FormData | null = null;
    let jsonData: any = null;
    let rawFile: any = null;
    let userId: string = '';
    let healthGoals: string[] = [];
    let dietaryPreferences: string[] = [];
    let mealName: string = '';
    
    if (contentType.includes('multipart/form-data')) {
      try {
        requestData = await request.formData();
        
        // Check if the 'image' field exists and is not null/empty
        if (!requestData.has('image') || !requestData.get('image')) {
          console.warn(`⚠️ [${requestId}] No image field in form data`);
          return NextResponse.json({ 
            _meta: { 
              success: false, 
              imageError: 'No image uploaded',
              requestId
            },
            analysis: createEmptyFallbackAnalysis()
          }, { status: 200 });
        }
        
        rawFile = requestData?.get('file') || requestData?.get('image') || null;
        userId = (requestData?.get('userId') || '').toString();
        mealName = (requestData?.get('mealName') || '').toString();
        
        // Parse health goals and dietary preferences
        const goalsParam = requestData?.get('healthGoals');
        if (goalsParam && typeof goalsParam === 'string') {
          try {
            healthGoals = JSON.parse(goalsParam);
          } catch {
            healthGoals = goalsParam.split(',').map(g => g.trim()).filter(Boolean);
          }
        }
        
        const dietParam = requestData?.get('dietaryPreferences');
        if (dietParam && typeof dietParam === 'string') {
          try {
            dietaryPreferences = JSON.parse(dietParam);
          } catch {
            dietaryPreferences = dietParam.split(',').map(d => d.trim()).filter(Boolean);
          }
        }
      } catch (error) {
        const errorMessage = `Failed to parse form data: ${error instanceof Error ? error.message : 'Unknown error'}`;
        responseData.errors.push(errorMessage);
        responseData.message = errorMessage;
        responseData._meta.imageError = errorMessage;
        return createAnalysisResponse({
          ...responseData,
          success: false,
          fallback: true,
          analysis: createEmptyFallbackAnalysis()
        });
      }
    } else if (contentType.includes('application/json')) {
      try {
        jsonData = await request.json();
        if (jsonData && typeof jsonData === 'object') {
          // Check if the image field exists and is not null/empty
          if (!jsonData.file && !jsonData.image && !jsonData.base64Image) {
            console.warn(`⚠️ [${requestId}] No image data in JSON payload`);
            return NextResponse.json({ 
              _meta: { 
                success: false, 
                imageError: 'No image uploaded',
                requestId
              },
              analysis: createEmptyFallbackAnalysis()
            }, { status: 200 });
          }
          
          rawFile = jsonData.file || jsonData.image || jsonData.base64Image || null;
          userId = jsonData.userId || '';
          mealName = jsonData.mealName || '';
          healthGoals = Array.isArray(jsonData.healthGoals) ? jsonData.healthGoals : [];
          dietaryPreferences = Array.isArray(jsonData.dietaryPreferences) ? jsonData.dietaryPreferences : [];
        } else {
          const error = 'Invalid JSON structure';
          responseData.errors.push(error);
          responseData.message = error;
          responseData._meta.imageError = error;
          return createAnalysisResponse({
            ...responseData,
            success: false,
            fallback: true,
            analysis: createEmptyFallbackAnalysis()
          });
        }
      } catch (error) {
        const errorMessage = `Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`;
        responseData.errors.push(errorMessage);
        responseData.message = errorMessage;
        responseData._meta.imageError = errorMessage;
        return createAnalysisResponse({
          ...responseData,
          success: false,
          fallback: true,
          analysis: createEmptyFallbackAnalysis()
        });
      }
    } else {
      const error = `Unsupported content type: ${contentType}`;
      responseData.errors.push(error);
      responseData.message = error;
      responseData._meta.imageError = error;
      return createAnalysisResponse({
        ...responseData,
        success: false,
        fallback: true,
        analysis: createEmptyFallbackAnalysis()
      });
    }
    
    // Validate required parameters
    if (!rawFile) {
      const error = 'No image file provided';
      responseData.errors.push(error);
      responseData.message = error;
      responseData._meta.imageError = error;
      
      console.error(`❌ [${requestId}] ${error}`);
      return createAnalysisResponse({
        ...responseData,
        success: false,
        fallback: true,
        analysis: createEmptyFallbackAnalysis()
      });
    }
    
    // Additional validation for empty/invalid file objects
    if ((typeof rawFile === 'object' && 'size' in rawFile && rawFile.size === 0) ||
        (typeof rawFile === 'string' && rawFile.length < 10)) {
      const error = 'Empty or invalid image file provided';
      responseData.errors.push(error);
      responseData.message = error;
      responseData._meta.imageError = error;
      
      console.error(`❌ [${requestId}] ${error}`);
      return createAnalysisResponse({
        ...responseData,
        success: false,
        fallback: true,
        analysis: createEmptyFallbackAnalysis()
      });
    }
    
    // Extract base64 image
    let base64Image: string;
    try {
      base64Image = await extractBase64Image(rawFile, requestId);
      responseData.debug.processingSteps.push('Image data extracted successfully');
      
      // Add validation for empty base64 result
      if (!base64Image) {
        const error = 'Image extraction returned empty result';
        responseData.errors.push(error);
        responseData.message = error;
        responseData._meta.imageError = error;
        
        console.error(`❌ [${requestId}] ${error}`);
        return createAnalysisResponse({
          ...responseData,
          success: false,
          fallback: true,
          analysis: createEmptyFallbackAnalysis()
        });
      }
    } catch (error) {
      const errorMessage = `Image extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      responseData.errors.push(errorMessage);
      responseData.message = 'Failed to process image';
      responseData._meta.imageError = errorMessage;
      
      console.error(`❌ [${requestId}] ${errorMessage}`);
      return createAnalysisResponse({
        ...responseData,
        success: false,
        fallback: true,
        analysis: createEmptyFallbackAnalysis()
      });
    }
    
    // Upload image to Firebase if we have a user ID
    let imageUrl: string | null = null;
    if (userId && base64Image) {
      try {
        imageUrl = await uploadImageToFirebase(base64Image, userId, requestId);
        if (imageUrl) {
          responseData.debug.processingSteps.push('Image uploaded successfully');
        } else {
          responseData.debug.processingSteps.push('Image upload failed, continuing with analysis only');
        }
      } catch (error) {
        console.error(`❌ [${requestId}] Firebase upload error:`, error);
        responseData.debug.processingSteps.push('Image upload failed, continuing with analysis only');
        // Continue with analysis even if upload fails
      }
    }
    
    // Call the GPT-4-Vision model to analyze the image
    console.log(`🚀 [${requestId}] Calling analyzeImageWithGPT4V...`);
    const gptResult = await analyzeImageWithGPT4V(
      base64Image,
      healthGoals,
      dietaryPreferences,
      requestId
    );

    // Enhanced logging - Log full details of status and model used
    console.log(`📊 [${requestId}] GPT Analysis complete - Success: ${gptResult.success}, Model: ${gptResult.modelUsed}${gptResult.usedFallbackModel ? ' (fallback)' : ''}${gptResult.forceGPT4V ? ' (forced)' : ''}`);
    
    // Add model information to the debug info
    responseData.debug.modelUsed = gptResult.modelUsed;
    responseData.debug.usedFallbackModel = gptResult.usedFallbackModel;
    responseData.debug.forceGPT4V = gptResult.forceGPT4V;
    
    // Capture model info for our response
    const modelInfo = {
      model: gptResult.modelUsed,
      usedFallback: gptResult.usedFallbackModel,
      forceGPT4V: gptResult.forceGPT4V
    };
    
    // If there was an error with the analysis, log it in detail
    if (!gptResult.success) {
      console.error(`❌ [${requestId}] GPT Analysis failed: ${gptResult.error}`);
      
      // Log detailed raw response for errors (truncated for log readability)
      if (gptResult.rawResponse) {
        const truncatedResponse = gptResult.rawResponse.length > 1000 
          ? `${gptResult.rawResponse.substring(0, 1000)}... (truncated)`
          : gptResult.rawResponse;
        console.error(`❌ [${requestId}] Raw GPT response for failed analysis: ${truncatedResponse}`);
        
        // Store full raw response in debug info
        responseData.debug.rawGptResponse = gptResult.rawResponse;
      }
      
      // Add error details to debug info
      responseData.debug.gptError = gptResult.error;
    }
    
    // Extract the GPT analysis result
    const analysisResult = gptResult.analysis;
    
    // Log analysis structure for debugging
    if (analysisResult) {
      // Log structure overview (what fields are present/missing)
      const analysisKeys = Object.keys(analysisResult).join(', ');
      console.log(`🔍 [${requestId}] Analysis structure contains keys: ${analysisKeys}`);
      
      // Check nutrient fields if present
      if (analysisResult.nutrients) {
        if (Array.isArray(analysisResult.nutrients)) {
          console.log(`🔍 [${requestId}] Nutrients: array with ${analysisResult.nutrients.length} items`);
        } else {
          const nutrientKeys = Object.keys(analysisResult.nutrients).join(', ');
          console.log(`🔍 [${requestId}] Nutrient fields (object): ${nutrientKeys}`);
        }
      } else {
        console.warn(`⚠️ [${requestId}] Missing nutrients object in analysis result`);
      }
      
      // Check array fields
      ['feedback', 'suggestions', 'detailedIngredients'].forEach(arrayField => {
        if (Array.isArray(analysisResult[arrayField])) {
          console.log(`🔍 [${requestId}] ${arrayField} array length: ${analysisResult[arrayField].length}`);
        } else {
          console.warn(`⚠️ [${requestId}] Missing or invalid ${arrayField} array in analysis result`);
        }
      });
    } else {
      console.error(`❌ [${requestId}] Analysis result is null or undefined`);
    }

    // Create the sanitized analysis response with proper fallbacks
    return createSanitizedAnalysisResponse(responseData, analysisResult, modelInfo);

  } catch (error) {
    // Catch-all for any unexpected errors
    const errorMessage = `Fatal error in analysis API: ${error instanceof Error ? error.message : 'Unknown error'}`;
    responseData.errors.push(errorMessage);
    responseData.message = 'An unexpected error occurred';
    responseData._meta.imageError = errorMessage;
    
    console.error(`❌ [${requestId}] FATAL ERROR:`, error);
    
    // Return a properly structured fallback response
    return createAnalysisResponse({
      ...responseData,
      success: false,
      fallback: true,
      analysis: createEmptyFallbackAnalysis()
    });
  }
} 