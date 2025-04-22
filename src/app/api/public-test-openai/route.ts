import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { nanoid } from 'nanoid';

export const runtime = 'nodejs';

// Mark this as a public route
export const config = {
  api: {
    bodyParser: false,
  },
};

export async function GET(req: NextRequest) {
  const requestId = nanoid();
  const startTime = Date.now();
  
  console.log(`[${requestId}] 🔍 Testing OpenAI API key validity`);
  
  try {
    // Check if OpenAI key is set
    const openAIApiKey = process.env.OPENAI_API_KEY;
    
    if (!openAIApiKey) {
      console.error(`[${requestId}] ❌ Missing OpenAI API key`);
      return NextResponse.json(
        { error: 'Server configuration error: Missing API credentials' },
        { status: 500 }
      );
    }
    
    // Initialize OpenAI client with API key
    const openai = new OpenAI({
      apiKey: openAIApiKey,
    });
    
    // Make a simple API call to verify the key works
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: "Say 'The OpenAI API key is working correctly' in one sentence"
        }
      ],
      max_tokens: 20
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
      apiKeyPrefix: openAIApiKey.substring(0, 8) + "...",
      apiKeyLength: openAIApiKey.length,
      isProjKey: openAIApiKey.startsWith('sk-proj-'),
      isOrgKey: openAIApiKey.startsWith('sk-org-'),
      model: "gpt-3.5-turbo"
    });
  } catch (error: any) {
    console.error(`[${requestId}] ❌ API key test failed:`, error.message);
    
    // Determine if this is an authentication error
    const isAuthError = error.status === 401 || 
                       (error.message && error.message.includes('auth')) ||
                       (error.message && error.message.includes('API key'));
    
    return NextResponse.json(
      { 
        error: `OpenAI API test failed: ${error.message}`,
        requestId,
        success: false,
        elapsedTime: Date.now() - startTime,
        isAuthError
      },
      { status: isAuthError ? 401 : 500 }
    );
  }
} 