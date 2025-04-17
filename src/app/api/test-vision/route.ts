import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import crypto from 'crypto';
import { GPT_VISION_MODEL } from '@/lib/constants';

// Create a small red square as a base64 image for testing
function createRedSquareImage(): string {
  // This is a 10x10 red square PNG
  return 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAGElEQVR42mP8z8BQz0AEYBxVSF+FAABqegX3winNOAAAAABJRU5ErkJggg==';
}

export async function GET(request: NextRequest) {
  try {
    // Generate a request ID for tracking
    const requestId = crypto.randomBytes(6).toString('hex');
    console.log(`🧪 [${requestId}] Testing vision capabilities with ${GPT_VISION_MODEL}`);
    
    // Get the OpenAI API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        success: false,
        error: 'OpenAI API key is not configured'
      }, { status: 500 });
    }
    
    // Initialize OpenAI client
    const openai = new OpenAI({ apiKey });
    
    // Get base64 test image
    const base64Image = createRedSquareImage();
    console.log(`🖼️ [${requestId}] Created test image (red square)`);
    
    // Prepare the prompt
    const systemPrompt = `You are an AI visual analysis assistant. Describe the test image you see with precise detail.
    Your response must be in JSON format with the following structure:
    {
      "description": "Detailed description of what you see",
      "color": "The main color you detect",
      "shape": "The shape you detect",
      "confidence": "A number from 0-100 indicating your confidence"
    }`;
    
    // Make the OpenAI API request
    console.log(`⏳ [${requestId}] Sending request to OpenAI API with model: ${GPT_VISION_MODEL}`);
    const response = await openai.chat.completions.create({
      model: GPT_VISION_MODEL,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyze this test image and tell me what you see in JSON format.'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Image}`,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 500,
      temperature: 0.2,
      response_format: { type: 'json_object' }
    });
    
    // Parse the result
    const content = response.choices[0]?.message?.content || '';
    
    let parsedContent;
    try {
      parsedContent = JSON.parse(content);
      console.log(`✅ [${requestId}] Successfully parsed JSON response from vision model`);
    } catch (error) {
      console.error(`❌ [${requestId}] Failed to parse JSON: ${error}`);
      parsedContent = { raw: content };
    }
    
    // Return the test results
    return NextResponse.json({
      success: true,
      message: 'Vision test completed',
      requestId,
      model: GPT_VISION_MODEL,
      tokensUsed: response.usage?.total_tokens || 0,
      result: parsedContent,
      rawResponse: content
    });
    
  } catch (error: any) {
    console.error(`Error in test-vision endpoint:`, error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error',
      statusCode: error.status || error.statusCode || 500
    }, { status: 500 });
  }
} 