import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Get the OpenAI API key from the environment
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    // Check if the API key is available
    if (!OPENAI_API_KEY) {
      console.error('OpenAI API key is not configured');
      return NextResponse.json({
        error: 'OpenAI API key is not configured',
        status: 'error',
        keyDefined: false,
        keyMasked: null,
        timestamp: new Date().toISOString()
      }, { status: 500 });
    }

    // Create a simple test query to OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Say hello world' }],
        max_tokens: 10,
      }),
    });

    // Get the response data
    const data = await response.json();

    // Check for errors
    if (!response.ok) {
      console.error('OpenAI API Error:', data);
      return NextResponse.json({
        error: 'OpenAI API Error',
        status: 'error',
        statusCode: response.status,
        statusText: response.statusText,
        details: data.error || data,
        keyDefined: true,
        keyMasked: OPENAI_API_KEY ? `${OPENAI_API_KEY.substring(0, 7)}...${OPENAI_API_KEY.substring(OPENAI_API_KEY.length - 4)}` : null,
        timestamp: new Date().toISOString()
      }, { status: 500 });
    }

    // Return success response
    return NextResponse.json({
      message: 'OpenAI API key is working properly',
      status: 'success',
      openAiResponse: data,
      keyDefined: true,
      keyMasked: OPENAI_API_KEY ? `${OPENAI_API_KEY.substring(0, 7)}...${OPENAI_API_KEY.substring(OPENAI_API_KEY.length - 4)}` : null,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error testing OpenAI API:', error);
    return NextResponse.json({
      error: 'Error testing OpenAI API',
      message: error?.message || 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
      status: 'error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 