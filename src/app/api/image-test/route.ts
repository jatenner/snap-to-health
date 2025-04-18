import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import * as parseMultipartForm from 'parse-multipart-data';

// Simple GET handler to provide test instructions
export async function GET() {
  return NextResponse.json({
    message: 'Image Test Endpoint',
    usage: {
      multipartFormData: 'Send a POST request with Content-Type: multipart/form-data and an image field',
      json: 'Send a POST request with Content-Type: application/json and a base64 encoded image'
    },
    examples: {
      curl: 'curl -X POST -F "image=@your-image.jpg" http://localhost:3000/api/image-test',
      fetch: `fetch('/api/image-test', {
        method: 'POST',
        body: JSON.stringify({ image: 'base64EncodedImageString' }),
        headers: { 'Content-Type': 'application/json' }
      })`
    }
  });
}

// Utility to extract file from multipart form data
function extractFileFromFormData(buffer: Buffer, contentType: string) {
  const boundary = contentType.split('boundary=')[1].trim();
  try {
    const parts = parseMultipartForm.parse(buffer, boundary);
    const imagePart = parts.find((part) => {
      return part && typeof part === 'object' && 'name' in part && part.name === 'image';
    });
    
    if (!imagePart) {
      return { success: false, error: 'No image field found in form data' };
    }
    
    return { 
      success: true, 
      data: imagePart.data, 
      filename: imagePart.filename,
      contentType: imagePart.type 
    };
  } catch (error: any) {
    return { 
      success: false, 
      error: `Failed to parse form data: ${error.message}` 
    };
  }
}

// Utility to convert buffer to data URL
function bufferToDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

// POST handler to process image
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  console.log(`[Image Test] Processing request ${requestId}`);
  
  const contentType = request.headers.get('content-type') || '';
  let imageBuffer: Buffer | null = null;
  let imageData = '';
  let imageMimeType = '';
  let originalFileName = '';
  
  try {
    if (contentType.includes('multipart/form-data')) {
      console.log(`[Image Test] Processing multipart form data`);
      const formBuffer = await request.arrayBuffer();
      const result = extractFileFromFormData(Buffer.from(formBuffer), contentType);
      
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
      
      imageBuffer = result.data as Buffer;
      imageMimeType = result.contentType || 'application/octet-stream';
      originalFileName = result.filename || 'unknown';
      imageData = bufferToDataUrl(imageBuffer, imageMimeType);
      
    } else if (contentType.includes('application/json')) {
      console.log(`[Image Test] Processing JSON data`);
      const { image } = await request.json();
      
      if (!image) {
        return NextResponse.json({ 
          success: false, 
          error: 'No image field in JSON payload' 
        }, { status: 400 });
      }
      
      imageData = image;
      
      // Handle both data URLs and raw base64
      if (image.startsWith('data:')) {
        const matches = image.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
          return NextResponse.json({ 
            success: false, 
            error: 'Invalid data URL format' 
          }, { status: 400 });
        }
        
        imageMimeType = matches[1];
        const base64Data = matches[2];
        imageBuffer = Buffer.from(base64Data, 'base64');
      } else {
        // Assume it's raw base64
        imageMimeType = 'application/octet-stream';
        try {
          imageBuffer = Buffer.from(image, 'base64');
        } catch (e) {
          return NextResponse.json({ 
            success: false, 
            error: 'Invalid base64 data' 
          }, { status: 400 });
        }
      }
      
      originalFileName = 'from-json-payload';
    } else {
      return NextResponse.json({ 
        success: false, 
        error: `Unsupported content type: ${contentType}` 
      }, { status: 415 });
    }
    
    // Ensure we have image data
    if (!imageBuffer) {
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to process image data' 
      }, { status: 400 });
    }

    // Return image processing results
    return NextResponse.json({
      success: true,
      processingResults: {
        requestId,
        originalFileName,
        mimeType: imageMimeType,
        bufferSize: imageBuffer.length,
        dataUrlLength: imageData.length,
        isDataUrl: imageData.startsWith('data:'),
        bufferSample: imageBuffer.slice(0, 16).toString('hex')
      }
    });
    
  } catch (error: any) {
    console.error(`[Image Test] Error processing request: ${error.message}`);
    return NextResponse.json({ 
      success: false, 
      error: `Error processing image: ${error.message}`,
      requestId
    }, { status: 500 });
  }
} 