import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import crypto from 'crypto';

// Load environment variables for OpenAI
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Simple GET handler to provide test instructions
export async function GET() {
  return NextResponse.json({
    info: 'This is a test endpoint for OpenAI GPT-4o Vision API',
    usage: {
      post: {
        description: 'Send an image for processing with OpenAI Vision API',
        formats: ['JSON with "image" field containing base64 data URL'],
        example: 'curl -X POST -H "Content-Type: application/json" -d \'{"image": "data:image/jpeg;base64,..."}\'',
        note: 'The endpoint requires a valid OPENAI_API_KEY in your environment'
      }
    },
    apiKeyConfigured: Boolean(OPENAI_API_KEY)
  });
}

// POST handler to test OpenAI Vision API
export async function POST(request: NextRequest) {
  const requestId = crypto.randomBytes(4).toString('hex');
  console.log(`[${requestId}] Received OpenAI test request`);

  try {
    // Verify API key is set
    if (!OPENAI_API_KEY) {
      console.error(`[${requestId}] Missing OPENAI_API_KEY environment variable`);
      return NextResponse.json(
        { error: 'OpenAI API key is not configured' },
        { status: 500 }
      );
    }

    // Get request body with image
    const body = await request.json();
    
    if (!body.image) {
      console.log(`[${requestId}] No image provided in request`);
      return NextResponse.json(
        { error: 'No image provided in request body' },
        { status: 400 }
      );
    }

    const imageData = body.image;
    
    // Validate image format
    if (!imageData.startsWith('data:')) {
      console.error(`[${requestId}] Invalid image format - must be a data URL`);
      return NextResponse.json(
        { error: 'Image must be a data URL (data:image/..;base64,...)' },
        { status: 400 }
      );
    }

    console.log(`[${requestId}] Processing image with OpenAI API (${imageData.length} chars)`);

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: OPENAI_API_KEY
    });

    // Prepare vision API request
    console.log(`[${requestId}] Sending request to OpenAI`);
    const systemPrompt = "You are a helpful assistant that analyzes images of food to provide nutritional information.";
    
    // Basic prompt for food analysis
    const userPrompt = "Analyze this food image and tell me what it contains. If it's food, provide basic nutritional information if you can.";
    
    const startTime = Date.now();
    
    // Call OpenAI API with image
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // Use gpt-4o which supports vision
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            {
              type: "image_url",
              image_url: {
                url: imageData,
              },
            },
          ],
        },
      ],
      max_tokens: 1000,
    });

    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    console.log(`[${requestId}] OpenAI response received in ${responseTime}ms`);
    console.log(`[${requestId}] Model used: ${response.model}`);
    console.log(`[${requestId}] Response length: ${response.choices[0]?.message?.content?.length || 0} chars`);

    // Return analysis results
    return NextResponse.json({
      success: true,
      model: response.model,
      response: response.choices[0]?.message?.content || '',
      metadata: {
        requestId,
        processingTimeMs: responseTime,
        prompt_tokens: response.usage?.prompt_tokens,
        completion_tokens: response.usage?.completion_tokens,
        total_tokens: response.usage?.total_tokens
      }
    });

  } catch (error: any) {
    console.error(`[${requestId}] Error calling OpenAI API:`, error);
    
    // Log detailed error information
    if (error.response) {
      console.error(`[${requestId}] OpenAI API error status:`, error.response.status);
      console.error(`[${requestId}] OpenAI API error data:`, error.response.data);
    }
    
    return NextResponse.json(
      { 
        error: 'OpenAI API request failed',
        message: error.message || 'Unknown error',
        details: error.response?.data || null
      },
      { status: 500 }
    );
  }
} 