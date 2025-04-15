import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    console.log('POST request received at /api/debug-image');
    const formData = await request.formData();
    
    // Check if image exists in the request
    const file = formData.get('image') as File;
    if (!file) {
      return NextResponse.json(
        { error: 'No image file provided' },
        { status: 400 }
      );
    }
    
    // Extract basic file information
    const fileInfo = {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified
    };
    
    console.log('File info:', fileInfo);
    
    // Extract base64 (just the first 100 chars for debugging)
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString('base64');
    const base64Preview = base64.substring(0, 100) + '...';
    
    console.log('Base64 length:', base64.length);
    console.log('Base64 preview:', base64Preview);
    
    return NextResponse.json({
      status: 'success',
      message: 'Image received and processed',
      fileInfo,
      base64Length: base64.length,
      base64Preview
    });
  } catch (error: any) {
    console.error('Error processing image:', error);
    return NextResponse.json(
      { error: error.message || 'An error occurred processing the image' },
      { status: 500 }
    );
  }
} 