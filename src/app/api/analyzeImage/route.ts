import { NextRequest, NextResponse } from 'next/server'
import { analyzeWithGPT4Vision, convertVisionResultToAnalysisResult, AnalysisResult } from '@/lib/gptVision'
import { extractBase64Image, extractTextFromImage } from '@/lib/imageProcessing'
import { nanoid } from 'nanoid'
import { 
  USE_GPT4_VISION, 
  USE_OCR_EXTRACTION, 
  OPENAI_API_KEY,
  logEnvironmentConfig 
} from '@/lib/env'
import { runOCR } from '@/lib/runOCR'
import { analyzeImageWithOCR } from '@/lib/analyzeImageWithOCR'

export const runtime = 'nodejs'

// Extended metadata type to include analysis source information
interface ExtendedMetadata {
  ocrText?: string;
  foodTerms?: string[];
  isNutritionLabel?: boolean;
  foodConfidence?: number;
  debugTrace?: string;
  ocrConfidence?: number;
  usedLabelDetection?: boolean;
  detectedLabel?: string | null;
  labelConfidence?: number;
  // Extended properties
  analysisSource?: 'gpt4-vision' | 'ocr' | 'fallback';
  gptUsed?: boolean;
  ocrUsed?: boolean;
  usedFallback?: boolean;
  originalError?: string;
  failureSource?: 'config' | 'input' | 'processing' | 'server';
  reason?: string;
  errorDetail?: string;
}

// Update the AnalysisResult type to use the extended metadata
type EnhancedAnalysisResult = Omit<AnalysisResult, '_meta'> & {
  _meta?: ExtendedMetadata;
}

/**
 * Handles POST requests to /api/analyzeImage
 * Processes images and returns nutrition analysis using GPT-4o Vision by default,
 * with fallback to OCR-based analysis if GPT fails or if configured by environment.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = nanoid()
  const startTime = Date.now()
  console.log(`[${requestId}] 📸 Image analysis request received`)
  
  // Log environment configuration for debugging
  logEnvironmentConfig()
  
  try {
    // Check for valid OpenAI API key
    if (!OPENAI_API_KEY) {
      console.error(`[${requestId}] ❌ Missing OpenAI API key`)
      return NextResponse.json(
        { 
          error: 'Server configuration error: Missing API credentials',
          _meta: {
            failureSource: 'config',
            reason: 'missing_api_key'
          } as ExtendedMetadata
        },
        { status: 500 }
      )
    }

    let base64Image: string
    let healthGoal: string = 'general health'

    // Process request based on content type
    const contentType = req.headers.get('content-type') || ''

    try {
      if (contentType.includes('multipart/form-data')) {
        console.log(`[${requestId}] 📦 Processing multipart form data`)
        const formData = await req.formData()
        base64Image = await extractBase64Image(formData, requestId)
        healthGoal = formData.get('healthGoal')?.toString() || 'general health'
      } else {
        console.log(`[${requestId}] 📦 Processing JSON data`)
        const jsonData = await req.json()
        base64Image = jsonData.image || ''
        healthGoal = jsonData.healthGoal || 'general health'
      }

      // Validate image data
      if (!base64Image || base64Image.length < 1000) {
        console.error(`[${requestId}] ❌ Invalid image data (length: ${base64Image?.length || 0})`)
        return NextResponse.json(
          { 
            error: 'Invalid or missing image data',
            _meta: {
              failureSource: 'input',
              reason: 'invalid_image'
            } as ExtendedMetadata
          },
          { status: 400 }
        )
      }

      // Clean up base64 image if it includes the data URL prefix
      if (base64Image.startsWith('data:')) {
        base64Image = base64Image.split(',')[1]
      }

      // If GPT Vision is enabled (default), try using it first
      let result: EnhancedAnalysisResult | null = null
      let usedFallback = false
      let gptError = null
      let analysisSource = 'gpt4-vision'

      // Determine which analysis method to use based on configuration and availability
      if (USE_GPT4_VISION) {
        try {
          // Process image with GPT-4o Vision
          console.log(`[${requestId}] 🧠 Processing image with GPT-4o Vision (health goal: ${healthGoal})`)
          const analysisResult = await analyzeWithGPT4Vision(base64Image, healthGoal, requestId)
          
          // Convert to standardized response format
          result = convertVisionResultToAnalysisResult(analysisResult, requestId, healthGoal) as EnhancedAnalysisResult
          
          // Add metadata about the source
          result._meta = {
            ...(result._meta || {}),
            analysisSource: 'gpt4-vision',
            gptUsed: true,
            ocrUsed: false
          }
          
          console.log(`[${requestId}] ✅ GPT Vision analysis completed successfully`)
        } catch (visionError: any) {
          gptError = visionError
          console.error(`[${requestId}] ⚠️ GPT Vision analysis failed, checking fallback options:`, visionError.message)
          
          // Only attempt OCR fallback if it's enabled
          if (!USE_OCR_EXTRACTION) {
            throw new Error(`GPT Vision failed and OCR fallback is disabled: ${visionError.message}`)
          }
          
          usedFallback = true
        }
      }
      
      // If GPT Vision failed or is disabled, and OCR is enabled, use OCR-based analysis
      if ((usedFallback || !USE_GPT4_VISION) && USE_OCR_EXTRACTION) {
        try {
          console.log(`[${requestId}] 🔍 Falling back to OCR-based analysis`)
          
          // Run OCR to extract text from the image
          const ocrResult = await runOCR(base64Image, requestId)
          
          // If OCR successful, analyze the extracted text
          if (ocrResult.success && ocrResult.text) {
            console.log(`[${requestId}] 📝 OCR extracted text (${ocrResult.text.length} chars), proceeding with analysis`)
            
            // Process the OCR text to get the analysis
            const { analysis, success } = await analyzeImageWithOCR(
              base64Image,
              [healthGoal],
              [],
              requestId
            )
            
            if (success && analysis) {
              result = analysis as EnhancedAnalysisResult
              analysisSource = 'ocr'
              
              // Add metadata about the fallback and OCR process
              result._meta = {
                ...(result._meta || {}),
                ocrText: ocrResult.text,
                ocrConfidence: ocrResult.confidence,
                analysisSource: 'ocr',
                gptUsed: false,
                ocrUsed: true,
                usedFallback: true,
                originalError: gptError ? gptError.message : 'GPT Vision disabled'
              }
              
              console.log(`[${requestId}] ✅ OCR-based analysis completed successfully`)
            } else {
              throw new Error('OCR text analysis failed to produce valid results')
            }
          } else {
            throw new Error(`OCR extraction failed: ${ocrResult.error || 'No text extracted'}`)
          }
        } catch (ocrError: any) {
          console.error(`[${requestId}] ❌ OCR fallback also failed:`, ocrError.message)
          
          // If both methods failed, we need to throw a comprehensive error
          throw new Error(
            `Analysis failed: GPT Vision ${gptError ? `error: ${gptError.message}` : 'disabled'}, ` + 
            `OCR error: ${ocrError.message}`
          )
        }
      }
      
      // If we have no result at this point, something went wrong
      if (!result) {
        throw new Error('Analysis failed: No valid result from either GPT Vision or OCR')
      }

      // Calculate total processing time
      const processingTime = Date.now() - startTime
      console.log(`[${requestId}] ✅ Analysis completed in ${processingTime}ms via ${analysisSource}`)

      return NextResponse.json({
        result,
        requestId,
        success: true,
        elapsedTime: processingTime,
        analysisSource
      })
    } catch (processingError: any) {
      console.error(`[${requestId}] ❌ Error processing request:`, processingError)
      
      // Check if this is an API key issue
      const errorMessage = processingError.message || 'Unknown error'
      const statusCode = 
        errorMessage.includes('API key') || errorMessage.includes('authentication') ? 401 : 500
      
      return NextResponse.json(
        { 
          error: `Failed to process image: ${errorMessage}`,
          requestId,
          success: false,
          elapsedTime: Date.now() - startTime,
          authError: statusCode === 401,
          _meta: {
            failureSource: 'processing',
            reason: statusCode === 401 ? 'auth_error' : 'processing_error',
            errorDetail: errorMessage
          } as ExtendedMetadata
        },
        { status: statusCode }
      )
    }
  } catch (error: any) {
    console.error(`[${requestId}] ❌ Unexpected error:`, error)
    return NextResponse.json(
      { 
        error: `Server error: ${error.message || 'Unknown error'}`,
        requestId,
        success: false,
        elapsedTime: Date.now() - startTime,
        _meta: {
          failureSource: 'server',
          reason: 'unexpected_error',
          errorDetail: error.message
        } as ExtendedMetadata
      },
      { status: 500 }
    )
  }
} 