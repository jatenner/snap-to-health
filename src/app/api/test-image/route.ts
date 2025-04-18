import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * Simple test endpoint for OpenAI image analysis
 * This endpoint uses a very small, hardcoded test image to verify API functionality
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  return NextResponse.json({
    info: "This endpoint tests image processing. Send a POST request with an image.",
    acceptedFormats: [
      "multipart/form-data with 'file' or 'image' field",
      "application/json with 'image' or 'base64Image' field"
    ],
    example: "curl -X POST -F 'file=@./my-image.jpg' http://localhost:3000/api/test-image"
  });
}

// Local implementation of extractBase64Image
async function extractBase64Image(formData: any, requestId: string = 'unknown'): Promise<string> {
  console.time(`⏱️ [${requestId}] extractBase64Image`);
  
  try {
    // Safety check - ensure formData is valid
    if (!formData) {
      console.warn(`⚠️ [${requestId}] Input is null or undefined`);
      console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
      throw new Error('No input provided for image extraction');
    }
    
    // Get the file from FormData or use the input directly based on type
    let rawFile = null;
    
    if (typeof formData === 'object' && 'get' in formData && typeof formData.get === 'function') {
      // It's FormData, try to get both 'file' and 'image' fields
      rawFile = formData.get('file') || formData.get('image') || null;
    } else {
      // It's not FormData, use it directly
      rawFile = formData;
    }
    
    // Early exit if no file is provided
    if (!rawFile) {
      console.warn(`⚠️ [${requestId}] No image file provided in input`);
      console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
      throw new Error('No image file provided in input');
    }
    
    // Check if it's already a data URL (base64 string)
    if (typeof rawFile === 'string') {
      if (rawFile.startsWith('data:')) {
        console.log(`✅ [${requestId}] Input is already a data URL, using directly`);
        console.log(`📊 [${requestId}] Data URL length: ${rawFile.length} chars`);
        console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
        return rawFile;
      } else if (/^[A-Za-z0-9+/=]+$/.test(rawFile)) {
        // It's a raw base64 string without the data URL prefix
        console.log(`✅ [${requestId}] Input is a raw base64 string, adding data URL prefix`);
        const dataUrl = `data:image/jpeg;base64,${rawFile}`;
        console.log(`📊 [${requestId}] Data URL length: ${dataUrl.length} chars`);
        console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
        return dataUrl;
      }
    }
    
    // Convert the file to base64 using arrayBuffer method (for File/Blob)
    if (rawFile && typeof rawFile === 'object' && 'arrayBuffer' in rawFile && typeof rawFile.arrayBuffer === 'function') {
      try {
        const bytes = await rawFile.arrayBuffer();
        console.log(`📊 [${requestId}] arrayBuffer returned ${bytes.byteLength} bytes`);
        
        if (bytes && bytes.byteLength > 0) {
          const buffer = Buffer.from(new Uint8Array(bytes));
          console.log(`✓ [${requestId}] Successfully converted using arrayBuffer (${bytes.byteLength} bytes)`);
          
          // Convert buffer to base64
          const base64 = buffer.toString('base64');
          
          // Determine MIME type
          let mimeType = 'image/jpeg';
          // Try to get mime type from file object
          if ('type' in rawFile && typeof rawFile.type === 'string' && rawFile.type) {
            mimeType = rawFile.type;
          }
          
          // Construct complete data URL with correct MIME type
          const base64Image = `data:${mimeType};base64,${base64}`;
          
          console.log(`✅ [${requestId}] Successfully extracted base64 image (${base64Image.length} total chars)`);
          console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
          return base64Image;
        }
      } catch (error) {
        console.error(`❌ [${requestId}] Array buffer conversion failed:`, error);
      }
    }
    
    // Fallback for other types
    console.error(`❌ [${requestId}] Unable to process this file type. File info:`, {
      type: typeof rawFile,
      constructor: rawFile?.constructor?.name || 'unknown'
    });
    console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
    throw new Error('Unsupported file type or format');
  } catch (error) {
    console.error(`❌ [${requestId}] Failed to extract base64 image:`, error);
    console.timeEnd(`⏱️ [${requestId}] extractBase64Image`);
    throw error;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  console.log(`🔍 [${requestId}] Testing image processing`);
  
  try {
    // Parse request body
    let formData = null;
    
    const contentType = request.headers.get('content-type') || '';
    console.log(`📄 [${requestId}] Content-Type: ${contentType}`);
    
    if (contentType.includes('multipart/form-data')) {
      console.log(`📝 [${requestId}] Parsing multipart form data`);
      formData = await request.formData();
      console.log(`📋 [${requestId}] Form data keys:`, Array.from(formData.keys()));
    } else if (contentType.includes('application/json')) {
      console.log(`📝 [${requestId}] Parsing JSON data`);
      const jsonData = await request.json();
      console.log(`📋 [${requestId}] JSON data keys:`, Object.keys(jsonData));
      formData = jsonData.image || jsonData.file || jsonData.base64Image || null;
    } else {
      return NextResponse.json({
        success: false,
        error: `Unsupported content type: ${contentType}`
      }, { status: 400 });
    }
    
    // Validate that we have image data
    if (!formData) {
      return NextResponse.json({
        success: false,
        error: 'No image provided. Please include an image file.'
      }, { status: 400 });
    }
    
    // Extract base64 from the image
    let base64Image = '';
    try {
      console.log(`🔍 [${requestId}] Extracting base64 from image`);
      base64Image = await extractBase64Image(formData, requestId);
      
      // Log details about the processed image
      const hasDataPrefix = base64Image.startsWith('data:');
      const totalLength = base64Image.length;
      const contentLength = hasDataPrefix 
        ? base64Image.substring(base64Image.indexOf(',') + 1).length 
        : totalLength;
      
      console.log(`✅ [${requestId}] Base64 extraction successful:`);
      console.log(`📊 [${requestId}] Total length: ${totalLength} chars`);
      console.log(`📊 [${requestId}] Has data URL prefix: ${hasDataPrefix}`);
      console.log(`📊 [${requestId}] Content length: ${contentLength} chars`);
      
      return NextResponse.json({
        success: true,
        imageDetails: {
          totalLength,
          hasDataPrefix,
          contentLength,
          prefix: hasDataPrefix ? base64Image.substring(0, base64Image.indexOf(',')) : null,
          // Return a small preview of the image data
          preview: `${base64Image.substring(0, 50)}...${base64Image.substring(base64Image.length - 20)}`
        }
      });
    } catch (error: any) {
      console.error(`❌ [${requestId}] Failed to extract base64 from image:`, error);
      return NextResponse.json({
        success: false,
        error: `Failed to process image: ${error.message || 'Unknown error'}`
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error(`❌ [${requestId}] Test endpoint error:`, error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error occurred'
    }, { status: 500 });
  }
} 