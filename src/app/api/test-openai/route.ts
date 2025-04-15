import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(request: NextRequest) {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }
    
    console.log('Testing OpenAI API connection...');
    console.log('API Key available:', !!OPENAI_API_KEY);
    console.log('API Key first 5 chars:', OPENAI_API_KEY.substring(0, 5));
    
    // Simple text-only request to test the API
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'user', content: 'Hello, this is a test message. Please respond with "API connection successful".' }
        ],
        max_tokens: 20
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        }
      }
    );
    
    return NextResponse.json({
      status: 'success',
      message: 'OpenAI API connection successful',
      response: {
        status: response.status,
        statusText: response.statusText,
        content: response.data.choices[0].message.content
      }
    });
  } catch (error: any) {
    console.error('Error testing OpenAI API:', error.message);
    
    return NextResponse.json(
      { 
        error: 'Failed to connect to OpenAI API',
        details: error.message,
        response: error.response?.data || null,
        status: error.response?.status || null
      },
      { status: 500 }
    );
  }
} 