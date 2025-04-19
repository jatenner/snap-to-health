import { NextRequest, NextResponse } from 'next/server';
import { checkOCRConfig, checkNutritionixCredentials } from '@/lib/diagnostics';

/**
 * API Diagnostics endpoint
 * This API endpoint provides diagnostic information about the API configuration and environment
 */
export async function GET(request: NextRequest) {
  console.log('Diagnostics API called');
  
  const startTime = Date.now();
  
  try {
    // Check OCR configuration
    const ocrConfig = checkOCRConfig();
    
    // Check Nutritionix credentials
    const nutritionixStatus = await checkNutritionixCredentials();
    
    // Check environment variables
    const envVars = {
      // OCR config
      USE_OCR_EXTRACTION: process.env.USE_OCR_EXTRACTION,
      OCR_CONFIDENCE_THRESHOLD: process.env.OCR_CONFIDENCE_THRESHOLD,
      OCR_SEGMENTATION_ENABLED: process.env.OCR_SEGMENTATION_ENABLED,
      
      // Timeouts
      OPENAI_TIMEOUT_MS: process.env.OPENAI_TIMEOUT_MS,
      
      // Deployment environment
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
      VERCEL_ENV: process.env.VERCEL_ENV,
    };
    
    // Build diagnostics response
    const diagnostics = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'unknown',
      apiKeys: {
        nutritionixAppId: nutritionixStatus.appId ? 'present' : 'missing',
        nutritionixAppIdValid: nutritionixStatus.appIdValid,
        nutritionixApiKey: nutritionixStatus.apiKey ? 'present' : 'missing',
        nutritionixApiKeyValid: nutritionixStatus.apiKeyValid,
        openaiApiKey: process.env.OPENAI_API_KEY ? 'present' : 'missing'
      },
      configuration: {
        ocr: ocrConfig,
        timeout: {
          openaiTimeoutMs: parseInt(process.env.OPENAI_TIMEOUT_MS || '30000', 10)
        }
      },
      serverInfo: {
        serverRuntime: 'edge',
        nodeVersion: process.version || 'unknown',
      },
      durationMs: Date.now() - startTime
    };
    
    return NextResponse.json(diagnostics);
  } catch (error) {
    console.error('Error in diagnostics API:', error);
    return NextResponse.json({
      error: 'Failed to generate diagnostics',
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 