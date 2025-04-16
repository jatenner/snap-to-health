import { NextRequest, NextResponse } from 'next/server';
import { createEmptyFallbackAnalysis, createErrorResponse } from '@/lib/apiUtils';

// Placeholder image for development fallback
const PLACEHOLDER_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// Default health goals
const DEFAULT_HEALTH_GOALS = ['Improve Sleep', 'Weight Management', 'Build Muscle', 'Boost Energy'];

/**
 * Extract base64 image from various input formats
 */
async function extractBase64Image(formData: any, requestId: string = 'unknown'): Promise<string | null> {
  console.time(`⏱️ [${requestId}] extractBase64Image`);
  
  try {
    // Safety check - ensure formData is valid
    if (!formData) {
      console.warn(`⚠️ [${requestId}] Input is null or undefined`);
      console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
      return null;
    }
    
    // Get the file from FormData or use the input directly based on type
    let rawFile = null;
    
    if (typeof formData === 'object' && 'get' in formData && typeof formData.get === 'function') {
      // It's FormData, try to get both 'file' and 'image' fields
      rawFile = formData.get('file') || formData.get('image') || null;
    } else {
      // It's not FormData, use it directly
      rawFile = formData;
    }
    
    // Enhanced debug logging for the file
    const fileInfo = {
      type: typeof rawFile,
      constructor: rawFile?.constructor?.name || 'undefined',
      isNull: rawFile === null,
      isUndefined: rawFile === undefined,
      hasProperties: rawFile ? Object.keys(Object(rawFile)).slice(0, 20) : [],
      isFormDataEntryValue: rawFile !== null && 
                          rawFile !== undefined && 
                          typeof rawFile === 'object' && 
                          'size' in Object(rawFile)
    };
    
    console.log(`📝 [${requestId}] Image file info:`, JSON.stringify(fileInfo, null, 2));
    
    // Early exit if no file is provided
    if (!rawFile) {
      console.warn(`⚠️ [${requestId}] No image file provided in input`);
      console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
      return null;
    }
    
    // If it's already a string that starts with data:image, return as is
    if (typeof rawFile === 'string' && rawFile.startsWith('data:image/')) {
      console.log(`✅ [${requestId}] Input is already a data URL, returning as is`);
      console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
      return rawFile;
    }
    
    // For simplicity in the fixed version, just return null (could be expanded with actual logic)
    console.warn(`⚠️ [${requestId}] Unable to process this image format`);
    console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
    return null;
  } catch (error) {
    console.error(`❌ [${requestId}] Error extracting base64:`, error);
    console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
    return null;
  }
}

/**
 * Main POST handler for image analysis
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
        end: null
      },
      processingSteps: [],
      errorDetails: []
    },
    _meta: {
      imageError: null  // Add this to track image-related errors
    }
  };
  
  try {
    // Parse request data based on content type
    const contentType = request.headers.get('content-type');
    if (!contentType) {
      return createErrorResponse(requestId, 'Missing Content-Type header');
    }
    
    let rawFile: any = null;
    let userId: string = '';
    let healthGoals: string[] = [];
    
    try {
      if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData();
        rawFile = formData.get('file') || formData.get('image') || null;
        userId = (formData.get('userId') || '').toString();
        
        // Parse health goals if available
        const goalsParam = formData.get('healthGoals');
        if (goalsParam && typeof goalsParam === 'string') {
          try {
            healthGoals = JSON.parse(goalsParam);
          } catch {
            healthGoals = goalsParam.split(',').map(g => g.trim()).filter(Boolean);
          }
        }
      } else if (contentType.includes('application/json')) {
        try {
          const jsonData = await request.json();
          if (jsonData && typeof jsonData === 'object') {
            rawFile = jsonData.file || jsonData.image || jsonData.base64Image || null;
            userId = jsonData.userId || '';
            healthGoals = Array.isArray(jsonData.healthGoals) ? jsonData.healthGoals : [];
          } else {
            return createErrorResponse(requestId, 'Invalid JSON structure');
          }
        } catch (jsonError: any) {
          return createErrorResponse(
            requestId, 
            `Failed to parse JSON: ${jsonError?.message || 'Unknown JSON parsing error'}`
          );
        }
      } else {
        return createErrorResponse(requestId, `Unsupported content type: ${contentType}`);
      }
    } catch (requestParsingError: any) {
      return createErrorResponse(
        requestId,
        `Failed to parse request: ${requestParsingError?.message || 'Unknown request parsing error'}`,
        requestParsingError
      );
    }
    
    // Validate required parameters - most important fix is here
    if (!rawFile) {
      return createErrorResponse(requestId, 'No image uploaded');
    }
    
    // Extract base64 image data - with proper error handling
    let base64Image: string | null = null;
    
    try {
      responseData.debug.processingSteps.push('Attempting to extract image data');
      base64Image = await extractBase64Image(rawFile, requestId);
      
      if (!base64Image) {
        return createErrorResponse(requestId, 'Image could not be converted to base64');
      }
      
      responseData.debug.processingSteps.push('Image extracted successfully');
    } catch (extractionError: any) {
      return createErrorResponse(
        requestId,
        `Image extraction failed: ${extractionError?.message || 'Unknown extraction error'}`,
        extractionError
      );
    }
    
    // In this fixed version, we'll return a mock success response for demonstration
    return NextResponse.json({
      ...responseData,
      success: true,
      message: 'Image received and processed successfully (mock response)',
      analysis: {
        description: "This is a placeholder response. The actual analysis would happen here.",
        ingredientList: ["Sample ingredient 1", "Sample ingredient 2"],
        detailedIngredients: [
          { name: "Sample ingredient 1", category: "protein", confidence: 8.0 },
          { name: "Sample ingredient 2", category: "vegetable", confidence: 7.5 }
        ],
        goalName: healthGoals[0] || DEFAULT_HEALTH_GOALS[0],
        goalScore: 7
      }
    });
    
  } catch (error: any) {
    // Catch-all for any unexpected errors
    return createErrorResponse(
      requestId,
      `Fatal error in analysis API: ${error?.message || 'Unknown error'}`,
      error
    );
  } finally {
    console.timeEnd(`⏱️ [${requestId}] Total API execution time`);
  }
} 