import { NextRequest, NextResponse } from 'next/server';
import { analyzeWithGPT4Vision, convertVisionResultToAnalysisResult } from '@/lib/gptVision';
import { nanoid } from 'nanoid';

// Simple orange test image (Base64) - properly formatted JPEG
const ORANGE_TEST_IMAGE = 
  "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";

export async function GET(req: NextRequest) {
  const requestId = nanoid();
  const startTime = Date.now();
  
  console.log(`[${requestId}] 🔍 Testing OpenAI Vision API with orange test image`);
  console.log(`[${requestId}] OpenAI Key present:`, !!process.env.OPENAI_API_KEY);
  
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.error(`[${requestId}] ❌ Missing OpenAI API key`);
      return NextResponse.json(
        { error: 'Server configuration error: Missing API credentials' },
        { status: 500 }
      );
    }
    
    // Process the test image with GPT-4 Vision
    const analysisResult = await analyzeWithGPT4Vision(
      ORANGE_TEST_IMAGE, 
      "general health", 
      requestId
    );
    
    // Convert to standard format
    const result = convertVisionResultToAnalysisResult(
      analysisResult, 
      requestId, 
      "general health"
    );
    
    // Calculate processing time
    const processingTime = Date.now() - startTime;
    console.log(`[${requestId}] ✅ Test analysis completed in ${processingTime}ms`);
    
    return NextResponse.json({
      result,
      requestId,
      success: true,
      elapsedTime: processingTime,
      image: "orange test image"
    });
  } catch (error: any) {
    console.error(`[${requestId}] ❌ Test failed:`, error);
    return NextResponse.json(
      { 
        error: `Test failed: ${error.message || 'Unknown error'}`,
        requestId,
        success: false,
        elapsedTime: Date.now() - startTime
      },
      { status: 500 }
    );
  }
} 