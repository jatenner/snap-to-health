import { NextRequest, NextResponse } from 'next/server'
import { USE_GPT4_VISION, USE_OCR_EXTRACTION, OPENAI_API_KEY, validateApiKeys } from '@/lib/env'
import { nanoid } from 'nanoid'

/**
 * Health check endpoint that verifies the configuration
 * Used to validate that GPT-4o Vision is properly configured
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = nanoid()
  
  try {
    // Validate API keys
    const keysValid = validateApiKeys()
    
    // Determine which analysis method is active
    const activeAnalysisMethod = USE_GPT4_VISION 
      ? 'gpt4-vision' 
      : USE_OCR_EXTRACTION 
        ? 'ocr-fallback' 
        : 'none'
    
    // Check OpenAI API key
    const openaiConfigured = Boolean(OPENAI_API_KEY)
    
    return NextResponse.json({
      status: 'ok',
      requestId,
      config: {
        useGpt4Vision: USE_GPT4_VISION,
        useOcrExtraction: USE_OCR_EXTRACTION,
        activeAnalysisMethod,
        openaiConfigured,
        keysValid
      },
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    return NextResponse.json({
      status: 'error',
      requestId,
      error: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
} 