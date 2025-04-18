import { NextRequest, NextResponse } from 'next/server';

/**
 * This is a test endpoint to verify the /api/analyzeImage endpoint
 * It sends a controlled base64 image to the endpoint and logs the response
 */
export async function GET(request: NextRequest) {
  console.log('Starting test of /api/analyzeImage endpoint...');
  
  // A small, valid base64-encoded PNG image (1x1 transparent pixel)
  const smallPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  
  // A larger, more realistic food image (sandwich)
  const foodImage = 'data:image/jpeg;base64,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';
  
  try {
    // Construct request body
    const requestData = {
      image: foodImage, // Using the food image for more realistic test
      userId: "test_user",
      healthGoals: ["weight loss"],
      dietaryPreferences: ["low carb"]
    };
    
    // Send POST request to the analyze endpoint
    const response = await fetch(new URL('/api/analyzeImage', request.url).toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestData),
    });
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    // Verify the response has the required fields
    const validation = {
      hasDescription: Boolean(result.analysis?.description),
      hasNutrients: Array.isArray(result.analysis?.nutrients),
      hasFeedback: Boolean(result.analysis?.feedback),
      hasSuggestions: Array.isArray(result.analysis?.suggestions),
      hasSuccess: result.success === true,
      hasAllRequiredFields: false
    };
    
    validation.hasAllRequiredFields = 
      validation.hasDescription && 
      validation.hasNutrients && 
      validation.hasFeedback && 
      validation.hasSuggestions &&
      validation.hasSuccess;
    
    return NextResponse.json({
      status: 'success',
      responseData: result,
      validation,
      message: validation.hasAllRequiredFields 
        ? 'The API returned a valid response with all required fields' 
        : 'The API response is missing required fields',
    });
    
  } catch (error) {
    console.error('Error testing the API:', error);
    
    return NextResponse.json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
      error: error
    }, { status: 500 });
  }
} 