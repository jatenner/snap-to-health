import { NextRequest, NextResponse } from 'next/server'
import { analyzeWithGPT4Vision, convertVisionResultToAnalysisResult } from '@/lib/gptVision'
import { extractBase64Image } from '@/lib/imageProcessing'
import { nanoid } from 'nanoid'

export const runtime = 'nodejs'

/**
 * Handles POST requests to /api/analyzeImage
 * Processes images and returns nutrition analysis using GPT-4 Vision
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = nanoid()
  const startTime = Date.now()
  console.log(`[${requestId}] 📸 Image analysis request received`)
  
  try {
    // Check for valid OpenAI API key
    if (!process.env.OPENAI_API_KEY) {
      console.error(`[${requestId}] ❌ Missing OpenAI API key`)
      return NextResponse.json(
        { error: 'Server configuration error: Missing API credentials' },
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
          { error: 'Invalid or missing image data' },
          { status: 400 }
        )
      }

      // Clean up base64 image if it includes the data URL prefix
      if (base64Image.startsWith('data:')) {
        base64Image = base64Image.split(',')[1]
      }

      // Process image with GPT-4 Vision
      console.log(`[${requestId}] 🔍 Processing image with GPT-4 Vision (health goal: ${healthGoal})`)
      const analysisResult = await analyzeWithGPT4Vision(base64Image, healthGoal, requestId)
      
      // Convert to standardized response format
      const result = convertVisionResultToAnalysisResult(analysisResult, requestId, healthGoal)

      // Calculate total processing time
      const processingTime = Date.now() - startTime
      console.log(`[${requestId}] ✅ Analysis completed in ${processingTime}ms`)

      return NextResponse.json({
        result,
        requestId,
        success: true,
        elapsedTime: processingTime
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
          authError: statusCode === 401
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
        elapsedTime: Date.now() - startTime
      },
      { status: 500 }
    )
  }
}
