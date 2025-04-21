import { NextRequest, NextResponse } from 'next/server';

// Create a simple orange-colored test image
function createTestImage(): string {
  // This is a simple 1x1 orange pixel encoded as base64 PNG
  // We're using a hardcoded minimal image to avoid server-side canvas issues
  return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
}

export async function GET(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(2, 15);
  
  try {
    console.log(`[${requestId}] Testing Basic GPT-4 Vision API`);
    
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    
    if (!OPENAI_API_KEY) {
      throw new Error('OpenAI API key is not configured');
    }
    
    // Create a simple test image - an orange image
    const imageBase64 = createTestImage();
    console.log(`[${requestId}] Using test image (${imageBase64.length} chars)`);
    
    // Configure the payload with a simple prompt
    const requestPayload = {
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that analyzes images."
        },
        {
          role: "user",
          content: [
            { 
              type: "text", 
              text: "Analyze this image and tell me what you see. Then try to describe what it might be used for."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${imageBase64}`
              }
            }
          ]
        }
      ],
      max_tokens: 500
    };
    
    console.log(`[${requestId}] Sending request to OpenAI API...`);
    
    // Use native fetch to call the OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify(requestPayload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API Error: ${response.status} ${response.statusText} - ${errorText}`);
    }
    
    const responseData = await response.json();
    
    // Check if the response has the expected structure
    if (
      !responseData.choices || 
      !responseData.choices[0] || 
      !responseData.choices[0].message || 
      !responseData.choices[0].message.content
    ) {
      throw new Error('Invalid response structure from OpenAI API');
    }
    
    // Extract the analysis text
    const analysisText = responseData.choices[0].message.content;
    
    // Return the success response
    return NextResponse.json({
      success: true,
      message: 'GPT-4 Vision test completed successfully',
      result: {
        raw_response: responseData,
        analysis: analysisText
      }
    });
  } catch (error: any) {
    console.error(`[${requestId}] Test failed:`, error);
    
    return NextResponse.json({
      success: false,
      message: `GPT-4 Vision test failed: ${error.message}`,
      error: error.message
    }, { status: 500 });
  }
} 