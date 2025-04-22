import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] Testing OpenAI API key with GPT-4o model...`);
  
  try {
    // Initialize OpenAI client with API key from environment
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    
    if (!OPENAI_API_KEY) {
      console.error(`[${requestId}] OpenAI API key not found in environment variables`);
      return NextResponse.json({ 
        success: false, 
        error: "OpenAI API key is not configured",
        status: 500
      }, { status: 500 });
    }
    
    console.log(`[${requestId}] OpenAI API key found - length: ${OPENAI_API_KEY.length} chars, starting with: ${OPENAI_API_KEY.substring(0, 7)}...`);
    
    // Configure request headers for better performance
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'OpenAI-Beta': 'assistants=v1'
    };
    
    // Create a simple test request to check if the API key is valid
    const requestPayload = {
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: "Respond with a simple 'Hello from GPT-4o' if you can read this message."
        }
      ],
      max_tokens: 20,
      temperature: 0
    };
    
    console.log(`[${requestId}] Sending test request to OpenAI API with ${requestPayload.model} model`);
    
    // Send request to OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify(requestPayload)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${requestId}] OpenAI API Error Status:`, response.status);
      console.error(`[${requestId}] OpenAI API Error Response:`, errorText);
      
      return NextResponse.json({ 
        success: false, 
        error: `OpenAI API Error: ${response.status} ${response.statusText}`,
        details: errorText,
        status: response.status 
      }, { status: 500 });
    }
    
    const responseData = await response.json();
    console.log(`[${requestId}] GPT-4o Test Completed Successfully`);
    
    return NextResponse.json({
      success: true,
      message: "OpenAI API key is valid and GPT-4o model is accessible",
      modelResponse: responseData.choices?.[0]?.message?.content || "No response content",
      model: "gpt-4o"
    });
  } catch (error) {
    console.error(`[${requestId}] Error testing OpenAI API key:`, error);
    
    return NextResponse.json({
      success: false,
      message: "OpenAI API key test failed",
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 