import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { analyzeWithGPT4Vision, convertVisionResultToAnalysisResult } from '@/lib/gptVision';
import { extractBase64Image } from '@/lib/imageProcessing';

/**
 * Processes an image analysis request from either formData or JSON
 * 
 * @param req The Next.js request object
 * @returns NextResponse with analysis results or error
 */
export async function processImageAnalysisRequest(req: NextRequest): Promise<NextResponse> {
  const requestId = uuidv4();
  const startTime = Date.now();
  
  try {
    console.log(`[${requestId}] Processing image analysis request`);
    
    // Check OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.error(`[${requestId}] Missing OpenAI API key`);
      return NextResponse.json({ 
        success: false, 
        message: "Missing OpenAI API key",
        requestId,
        error: "API configuration error"
      }, { status: 500 });
    }
    
    // Parse the request
    let imageBase64 = '';
    let healthGoal = 'general health';
    
    // Handle different content types
    const contentType = req.headers.get('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      // Process form data
      const formData = await req.formData();
      imageBase64 = await extractBase64Image(formData, requestId);
      healthGoal = formData.get('healthGoal')?.toString() || healthGoal;
    } 
    else if (contentType.includes('application/json')) {
      // Process JSON data
      const jsonData = await req.json();
      imageBase64 = jsonData.image || jsonData.base64Image;
      healthGoal = jsonData.healthGoal || healthGoal;
      
      if (!imageBase64) {
        throw new Error('No image data provided in JSON');
      }
    } else {
      console.error(`[${requestId}] Unsupported content type: ${contentType}`);
      throw new Error(`Unsupported content type: ${contentType}`);
    }
    
    // Validate the image
    if (!imageBase64 || imageBase64.length < 100) {
      console.error(`[${requestId}] Invalid or missing image data`);
      return NextResponse.json({ 
        success: false, 
        message: "Invalid or missing image data",
        requestId
      }, { status: 400 });
    }
    
    // Analyze the image with GPT-4 Vision
    console.log(`[${requestId}] Starting GPT-4o Vision analysis`);
    const visionResult = await analyzeWithGPT4Vision(imageBase64, healthGoal, requestId);
    
    // Convert to standard format
    const analysisResult = convertVisionResultToAnalysisResult(visionResult, requestId, healthGoal);
    
    console.log(`[${requestId}] GPT-4o Vision analysis successful`);
    
    // Create the successful response
    const elapsedTime = Date.now() - startTime;
    
    return NextResponse.json({
      success: true,
      fallback: false,
      requestId,
      message: "Analysis completed successfully with GPT-4o",
      result: analysisResult,
      elapsedTime,
      imageUrl: null
    });
    
  } catch (error: any) {
    console.error(`[${requestId}] Analysis error:`, error.message);
    
    return NextResponse.json({
      success: false,
      fallback: true,
      requestId,
      message: error.message || "An error occurred during analysis",
      result: null,
      error: error.message,
      elapsedTime: Date.now() - startTime,
      imageUrl: null
    }, { status: 500 });
  }
} 