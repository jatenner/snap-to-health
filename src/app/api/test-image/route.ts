import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

/**
 * Simple test endpoint for OpenAI image analysis
 * This endpoint uses a very small, hardcoded test image to verify API functionality
 */
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  console.log(`🔍 [${requestId}] Starting test-image GET request`);
  
  try {
    // Simple tiny red square base64 image (very small, guaranteed to work if API is functional)
    const tinyTestImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg==";
    
    // Check if OpenAI key is set
    const openAIApiKey = process.env.OPENAI_API_KEY;
    if (!openAIApiKey) {
      console.error(`❌ [${requestId}] OpenAI API key not found`);
      return NextResponse.json({ 
        error: 'OpenAI API key not found', 
        requestId
      }, { status: 500 });
    }
    
    // Initialize OpenAI
    const openai = new OpenAI({
      apiKey: openAIApiKey
    });
    
    console.log(`⏳ [${requestId}] Sending test image to OpenAI API...`);
    
    // Make a simple request to OpenAI with the tiny test image
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that can analyze images. Describe what you see in the image.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'What is in this image?'
            },
            {
              type: 'image_url',
              image_url: {
                url: tinyTestImage,
                detail: 'low'
              }
            }
          ]
        }
      ],
      max_tokens: 1000
    });
    
    console.log(`✅ [${requestId}] OpenAI API response received, model: gpt-4o`);
    
    // Return the response
    return NextResponse.json({
      success: true,
      response: response.choices[0]?.message?.content,
      usage: response.usage,
      requestId
    });
  } catch (error: any) {
    console.error(`❌ [${requestId}] Error in test-image: ${error.message}`);
    
    // Additional error details
    const errorInfo: {
      message: string;
      type: string;
      status: string | number;
      requestId: string;
      responseDetails?: any;
    } = {
      message: error.message,
      type: error.type || 'unknown',
      status: error.status || 'unknown',
      requestId
    };
    
    if (error.response) {
      console.error(`❌ [${requestId}] API Error Details:`, JSON.stringify(error.response, null, 2));
      errorInfo.responseDetails = error.response;
    }
    
    return NextResponse.json({ 
      success: false,
      error: errorInfo
    }, { status: 500 });
  }
} 