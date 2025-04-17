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
    
    // Check USE_GPT4_VISION setting
    const forceGPT4V = process.env.USE_GPT4_VISION !== 'false';
    
    // Initialize the OpenAI client
    const openai = new OpenAI({
      apiKey: openAIApiKey
    });
    
    // Check models
    const gpt4vResult = await checkModelAvailability(openai, 'gpt-4-vision-preview', requestId);
    const gpt4oResult = await checkModelAvailability(openai, 'gpt-4o', requestId);
    const gpt35Result = await checkModelAvailability(openai, 'gpt-3.5-turbo', requestId);
    
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
      console.error(`Error listing models: ${error.message}`);
    }
    
    // Return all the information
    return NextResponse.json({
      openAI: {
        keyValid: true,
        keyType: openAIApiKey.startsWith('sk-org-') ? 'Organization' : openAIApiKey.startsWith('sk-proj-') ? 'Project' : 'Standard'
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