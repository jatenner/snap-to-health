import { NextRequest, NextResponse } from 'next/server';
import { createEmptyFallbackAnalysis } from '@/lib/analyzeImageWithGPT4V';
import OpenAI from 'openai';

/**
 * Diagnostic endpoint to check image analysis components
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = Math.random().toString(36).substring(2, 10);
  console.log(`📊 [${requestId}] Running image analysis diagnostics`);
  
  const diagnostics = {
    requestId,
    timestamp: new Date().toISOString(),
    environment: {
      node: process.version,
      environment: process.env.NODE_ENV,
    },
    openai: {
      apiKeyPresent: !!process.env.OPENAI_API_KEY,
      apiKeyValid: false,
      modelAvailability: {
        'gpt-4o': false,
        'gpt-4-vision-preview': false
      },
      models: [] as string[]
    },
    image: {
      processingComponents: {
        extractBase64: true,
        validateImage: true,
        uploadToFirebase: !!process.env.FIREBASE_ADMIN_EMAIL
      }
    },
    components: {
      validateGptAnalysisResult: true,
      createPartialFallbackAnalysis: true,
      extractJSONFromText: true,
      fallbackResponseGeneration: true
    },
    features: {
      gpt4oForced: process.env.USE_GPT4_VISION !== 'false',
      fallbacksEnabled: true
    },
    sampleCreateEmptyFallbackAnalysis: null as any
  };
  
  // Test OpenAI configuration
  try {
    // Check if API key is valid
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'invalid-key'
    });
    
    // List available models
    try {
      const modelsResponse = await openai.models.list();
      const modelIds = modelsResponse.data.map(model => model.id);
      
      diagnostics.openai.models = modelIds;
      diagnostics.openai.apiKeyValid = true;
      
      // Check specific model availability
      diagnostics.openai.modelAvailability['gpt-4o'] = modelIds.includes('gpt-4o');
      diagnostics.openai.modelAvailability['gpt-4-vision-preview'] = modelIds.includes('gpt-4-vision-preview');
    } catch (modelsError) {
      console.error(`❌ [${requestId}] Error fetching models:`, modelsError);
      diagnostics.openai.apiKeyValid = false;
    }
  } catch (openaiError) {
    console.error(`❌ [${requestId}] OpenAI client error:`, openaiError);
  }
  
  // Generate a sample fallback analysis for testing
  try {
    diagnostics.sampleCreateEmptyFallbackAnalysis = createEmptyFallbackAnalysis(
      requestId,
      'diagnostic-test',
      'This is a diagnostic test'
    );
  } catch (fallbackError) {
    console.error(`❌ [${requestId}] Error generating fallback analysis:`, fallbackError);
    diagnostics.components.fallbackResponseGeneration = false;
  }
  
  // Return comprehensive diagnostics
  return NextResponse.json({
    success: true,
    diagnostics,
    userGuide: {
      title: "Troubleshooting Image Analysis",
      steps: [
        "Check that the OpenAI API key is valid and has access to the GPT-4o or GPT-4-Vision models",
        "Ensure image uploads are working correctly (try uploading a smaller, clearer image)",
        "Check server logs for detailed error messages with the request ID",
        "Verify that the response format from OpenAI matches the expected structure"
      ],
      commonIssues: [
        "API key lacks permissions for the required models",
        "Image is too large or in an unsupported format",
        "Network timeouts during image analysis",
        "Malformed JSON responses from the API"
      ]
    }
  });
} 