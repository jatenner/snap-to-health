import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { nanoid } from 'nanoid';

export async function GET(req: NextRequest) {
  const requestId = nanoid();
  const startTime = Date.now();
  
  console.log(`[${requestId}] 🔍 Testing OpenAI API key validity`);
  console.log(`[${requestId}] OpenAI Key present:`, !!process.env.OPENAI_API_KEY);
  
  try {
    // Validate API key
    if (!process.env.OPENAI_API_KEY) {
      console.error(`[${requestId}] ❌ Missing OpenAI API key`);
      return NextResponse.json(
        { error: 'Server configuration error: Missing API credentials' },
        { status: 500 }
      );
    }
    
    // Initialize OpenAI client with API key
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    // Make a simple API call to verify the key works
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: "Say 'The OpenAI API key is working correctly' in JSON format"
        }
      ],
      max_tokens: 100,
      response_format: { type: "json_object" }
    });
    
    const result = response.choices[0]?.message?.content || "No response";
    
    // Calculate processing time
    const processingTime = Date.now() - startTime;
    console.log(`[${requestId}] ✅ API key test completed in ${processingTime}ms`);
    
    return NextResponse.json({
      result,
      requestId,
      success: true,
      elapsedTime: processingTime,
      apiKeyFormat: process.env.OPENAI_API_KEY.substring(0, 8) + "...",
      apiKeyLength: process.env.OPENAI_API_KEY.length,
      isProjKey: process.env.OPENAI_API_KEY.startsWith('sk-proj-'),
      isOrgKey: process.env.OPENAI_API_KEY.startsWith('sk-org-'),
      environment: process.env.NODE_ENV,
      isVercel: !!process.env.VERCEL || !!process.env.VERCEL_URL
    });
  } catch (error: any) {
    console.error(`[${requestId}] ❌ Test failed:`, error);
    return NextResponse.json(
      { 
        error: `Test failed: ${error.message || 'Unknown error'}`,
        requestId,
        success: false,
        elapsedTime: Date.now() - startTime,
        apiKeyFormat: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.substring(0, 8) + "..." : "none"
      },
      { status: 500 }
    );
  }
} 