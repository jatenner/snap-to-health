import { NextRequest, NextResponse } from 'next/server';
import { extractBase64Image, extractTextFromImage } from '@/lib/imageProcessing';
import { getNutritionData, createNutrientAnalysis } from '@/lib/nutritionixApi';
import crypto from 'crypto';

// Simple GET handler to provide test instructions
export async function GET() {
  return NextResponse.json({
    message: 'Image Test Endpoint',
    usage: {
      multipartFormData: 'Send a POST request with Content-Type: multipart/form-data and an image field',
      json: 'Send a POST request with Content-Type: application/json and a base64 encoded image'
    },
    examples: {
      curl: 'curl -X POST -F "image=@your-image.jpg" http://localhost:3000/api/image-test',
      fetch: `fetch('/api/image-test', {
        method: 'POST',
        body: JSON.stringify({ image: 'base64EncodedImageString' }),
        headers: { 'Content-Type': 'application/json' }
      })`
    }
  });
}

// POST handler to process image
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] Starting image-test endpoint`);
  
  try {
    // Parse request body
    const formData = await request.formData();
    const imageFile = formData.get('image');
    
    if (!imageFile) {
      return NextResponse.json({
        success: false,
        message: "No image provided"
      }, { status: 400 });
    }
    
    // Extract image as base64
    console.log(`[${requestId}] Extracting base64 from image`);
    const base64Image = await extractBase64Image(imageFile, requestId);
    
    if (!base64Image) {
      return NextResponse.json({
        success: false,
        message: "Failed to extract base64 from image"
      }, { status: 400 });
    }
    
    // Extract text from image
    console.log(`[${requestId}] Extracting text from image`);
    const textExtractionResult = await extractTextFromImage(base64Image, requestId);
    
    if (!textExtractionResult.success || !textExtractionResult.description) {
      return NextResponse.json({
        success: false,
        stage: "text_extraction",
        message: "Failed to extract text from image",
        error: textExtractionResult.error || "Unknown error"
      }, { status: 500 });
    }
    
    // Log the extracted description
    console.log(`[${requestId}] Extracted description: ${textExtractionResult.description}`);
    
    // Get nutrition data from the Nutritionix API
    console.log(`[${requestId}] Getting nutrition data from Nutritionix API`);
    const nutritionResult = await getNutritionData(textExtractionResult.description, requestId);
    
    if (!nutritionResult.success || !nutritionResult.data) {
      return NextResponse.json({
        success: false,
        stage: "nutrition_api",
        message: "Failed to get nutrition data",
        error: nutritionResult.error || "Unknown error",
        textDescription: textExtractionResult.description
      }, { status: 500 });
    }
    
    // Generate analysis from nutrition data
    const { nutrients, foods } = nutritionResult.data;
    const analysis = createNutrientAnalysis(nutrients, [], requestId);
    
    // Format the response
    return NextResponse.json({
      success: true,
      data: {
        textDescription: textExtractionResult.description,
        modelUsed: textExtractionResult.modelUsed,
        nutrients: nutrients,
        foods: foods,
        feedback: analysis.feedback,
        suggestions: analysis.suggestions,
        goalScore: analysis.goalScore
      }
    });
    
  } catch (error) {
    console.error(`[${requestId}] Error in image-test endpoint:`, error);
    return NextResponse.json({
      success: false,
      message: "An error occurred while processing the image",
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 