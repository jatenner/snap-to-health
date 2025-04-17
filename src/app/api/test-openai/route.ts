import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function GET(request: NextRequest) {
  try {
    // Get OpenAI API key
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      console.error('OPENAI_API_KEY not found in environment variables');
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }
    
    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey,
    });
    
    // Make a simple request to test the API key
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Hello! This is a test message. Please respond with "OpenAI connection successful"' }],
      max_tokens: 50,
    });
    
    // Get the response content
    const content = completion.choices[0]?.message?.content || 'No content returned';
    
    // Return success response
    return NextResponse.json({
      status: 'success',
      apiKeyFirstChars: apiKey.substring(0, 7) + '...',
      apiKeyLength: apiKey.length,
      response: {
        content,
        model: completion.model,
        usage: completion.usage,
      },
    });
    
  } catch (error: any) {
    console.error('Error testing OpenAI API:', error);
    
    // Format error response
    let errorMessage = error?.message || 'Unknown error';
    let statusCode = 500;
    
    // Check for specific error types
    if (error?.status === 401) {
      errorMessage = 'Invalid OpenAI API key';
      statusCode = 401;
    } else if (error?.status === 429) {
      errorMessage = 'OpenAI rate limit exceeded';
      statusCode = 429;
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
} 