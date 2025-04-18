import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { checkModelAvailability } from '@/lib/analyzeImageWithGPT4V';

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  
  try {
    // Check if OpenAI key is set
    const openAIApiKey = process.env.OPENAI_API_KEY;
    if (!openAIApiKey) {
      return NextResponse.json({ 
        error: 'OpenAI API key not found', 
      }, { status: 500 });
    }
    
    // Log API key format (safely, without exposing the actual key)
    const keyInfo = {
      keyType: openAIApiKey.startsWith('sk-org-') 
        ? 'Organization' 
        : openAIApiKey.startsWith('sk-proj-') 
          ? 'Project' 
          : openAIApiKey.startsWith('sk-') 
            ? 'Standard' 
            : 'Unknown',
      keyLength: openAIApiKey.length,
      keyPrefix: openAIApiKey.substring(0, 7) + '...',
      validFormat: (
        openAIApiKey.startsWith('sk-proj-') || 
        openAIApiKey.startsWith('sk-org-') || 
        /^sk-[A-Za-z0-9]{48,}$/.test(openAIApiKey)
      )
    };
    
    console.log(`🔑 [${requestId}] API Key Format: ${keyInfo.keyType}, Length: ${keyInfo.keyLength}, Valid format: ${keyInfo.validFormat}`);
    
    // Check USE_GPT4_VISION setting
    const forceGPT4V = process.env.USE_GPT4_VISION !== 'false';
    
    // Initialize the OpenAI client - we'll keep this for the models list
    const openai = new OpenAI({
      apiKey: openAIApiKey
    });
    
    // Test simple completion to validate key works at all
    let basicApiTest = { success: false, error: null };
    try {
      console.log(`🧪 [${requestId}] Testing basic API functionality...`);
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Hello" }
        ],
        max_tokens: 5
      });
      basicApiTest.success = true;
      console.log(`✅ [${requestId}] Basic API test successful`);
    } catch (error: any) {
      basicApiTest.success = false;
      basicApiTest.error = error.message;
      console.error(`❌ [${requestId}] Basic API test failed: ${error.message}`);
    }
    
    // Check models (updated to match new function signature)
    console.log(`🔍 [${requestId}] Checking GPT-4-Vision availability...`);
    const gpt4vResult = await checkModelAvailability('gpt-4-vision-preview', requestId);
    console.log(`🔍 [${requestId}] Checking GPT-4o availability...`);
    const gpt4oResult = await checkModelAvailability('gpt-4o', requestId);
    console.log(`🔍 [${requestId}] Checking GPT-3.5-Turbo availability...`);
    const gpt35Result = await checkModelAvailability('gpt-3.5-turbo', requestId);
    
    // List available models (only a subset for brevity)
    let availableModels: string[] = [];
    try {
      const models = await openai.models.list();
      availableModels = models.data
        .filter(model => 
          model.id.includes('gpt-4') || 
          model.id.includes('gpt-3.5') || 
          model.id.includes('vision')
        )
        .map(model => model.id);
    } catch (error: any) {
      console.error(`❌ [${requestId}] Error listing models: ${error.message}`);
    }
    
    // Return all the information
    return NextResponse.json({
      openAI: {
        keyValid: basicApiTest.success,
        keyType: keyInfo.keyType,
        keyLength: keyInfo.keyLength,
        validFormat: keyInfo.validFormat,
        basicApiTest
      },
      configuration: {
        forceGPT4V: forceGPT4V
      },
      modelAvailability: {
        'gpt-4-vision-preview': gpt4vResult,
        'gpt-4o': gpt4oResult,
        'gpt-3.5-turbo': gpt35Result
      },
      availableModels: availableModels,
      requestId
    });
  } catch (error: any) {
    return NextResponse.json({ 
      error: `OpenAI test failed: ${error.message}`,
      requestId
    }, { status: 500 });
  }
} 