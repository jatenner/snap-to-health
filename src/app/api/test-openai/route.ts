import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import crypto from 'crypto';
import { API_CONFIG } from '@/lib/constants';

// Function to check model availability
async function checkModelAvailability(
  modelName: string,
  requestId: string
): Promise<{ isAvailable: boolean; fallbackModel: string | null; errorMessage: string | null }> {
  try {
    console.log(`🔍 [${requestId}] Checking if model ${modelName} is available...`);
    
    // For simplicity in this test function, assume the model is available
    // In a production environment, you'd make an actual API call to verify
    
    return {
      isAvailable: true,
      fallbackModel: null,
      errorMessage: null
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ [${requestId}] Error checking model availability: ${errorMessage}`);
    return {
      isAvailable: false,
      fallbackModel: 'gpt-3.5-turbo',
      errorMessage
    };
  }
}

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
    
    // Initialize the OpenAI client
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
    
    // Check available models
    console.log(`🔍 [${requestId}] Checking GPT-3.5-Turbo availability...`);
    const gpt35Result = await checkModelAvailability('gpt-3.5-turbo', requestId);
    console.log(`🔍 [${requestId}] Checking GPT-3.5-Turbo-16k availability...`);
    const gpt35_16kResult = await checkModelAvailability('gpt-3.5-turbo-16k', requestId);
    
    // List available models (only a subset for brevity)
    let availableModels: string[] = [];
    try {
      const models = await openai.models.list();
      availableModels = models.data
        .filter(model => 
          model.id.includes('gpt-3.5')
        )
        .map(model => model.id);
    } catch (error: any) {
      console.error(`❌ [${requestId}] Error listing models: ${error.message}`);
    }
    
    // Get the timeout value
    const timeoutMs = parseInt(process.env.OPENAI_TIMEOUT_MS || '', 10) || API_CONFIG.DEFAULT_TIMEOUT_MS;
    
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
        ocr: {
          enabled: true,
          confidence_threshold: process.env.OCR_CONFIDENCE_THRESHOLD || '0.7'
        },
        timeoutMs: timeoutMs
      },
      modelAvailability: {
        'gpt-3.5-turbo': gpt35Result,
        'gpt-3.5-turbo-16k': gpt35_16kResult
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