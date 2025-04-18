import { NextRequest, NextResponse } from 'next/server';
import { getLogLevels } from '@/lib/logger';
import { getModelConfiguration } from '@/lib/constants';

/**
 * This endpoint provides diagnostic information about the logging configuration
 * and the model settings used for image analysis.
 */
export async function GET(request: NextRequest) {
  try {
    // Get the current log levels
    const logLevels = getLogLevels();
    
    // Get the model configuration
    const modelConfig = getModelConfiguration();
    
    // Get environment variables related to logging and OpenAI (without exposing secrets)
    const envDiagnostics = {
      NODE_ENV: process.env.NODE_ENV || 'not set',
      LOG_LEVEL: process.env.LOG_LEVEL || 'not set',
      OPENAI_API_KEY_SET: Boolean(process.env.OPENAI_API_KEY),
      FIREBASE_INITIALIZED: process.env.FIREBASE_PROJECT_ID ? true : false,
    };
    
    return NextResponse.json({
      status: 'success',
      logConfiguration: logLevels,
      modelConfiguration: modelConfig,
      environment: envDiagnostics,
      message: 'Diagnostic information for image analysis logging'
    });
  } catch (error) {
    console.error('Error generating diagnostics:', error);
    
    return NextResponse.json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
      error: error
    }, { status: 500 });
  }
} 