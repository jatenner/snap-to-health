import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Get the OpenAI API key from environment variables
    const apiKey = process.env.OPENAI_API_KEY || '';
    
    // Validate the API key
    if (!apiKey || apiKey.length < 20) {
      console.error(`Invalid OpenAI API key: "${apiKey}" (length: ${apiKey.length})`);
      return NextResponse.json({
        success: false,
        error: 'Missing or invalid OpenAI API key',
        apiKeyLength: apiKey.length,
      }, { status: 200 });
    }
    
    // Mask the API key for security
    const apiKeyStart = apiKey.substring(0, 5);
    const apiKeyEnd = apiKey.substring(apiKey.length - 4);
    
    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: apiKey,
    });
    
    // Try to list available models as a simple API test
    const modelList = await openai.models.list();
    const models = modelList.data.map(model => model.id).slice(0, 5); // Just show first 5 for brevity
    
    // Make a simple test query to confirm the API key works
    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that responds with very short answers."
        },
        {
          role: "user",
          content: "Please respond with 'OpenAI API key is working correctly!' if you receive this message."
        }
      ],
      max_tokens: 20,
    });
    
    const modelResponse = chatCompletion.choices[0]?.message?.content || 'No response';
    
    // Get relevant environment variables for debugging
    const envVars = {
      NODE_ENV: process.env.NODE_ENV || 'not set',
      VERCEL_ENV: process.env.VERCEL_ENV || 'not set',
      USE_GPT4_VISION: process.env.USE_GPT4_VISION || 'not set',
      OPENAI_MODEL: process.env.OPENAI_MODEL || 'not set',
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ? 'set' : 'not set',
    };
    
    // Return success response with masked API key info
    return NextResponse.json({
      success: true,
      apiKeyStart,
      apiKeyEnd,
      apiKeyLength: apiKey.length,
      models,
      modelResponse,
      envVars,
    }, { status: 200 });
    
  } catch (error: any) {
    console.error('Error in update-env-vars API route:', error);
    
    // Return detailed error information
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error',
      errorType: error.constructor.name,
      errorStack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    }, { status: 200 });
  }
} 