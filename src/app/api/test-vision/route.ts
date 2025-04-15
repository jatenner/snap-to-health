import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request: NextRequest) {
  try {
    console.log('POST request received at /api/test-vision');
    
    const contentType = request.headers.get('content-type') || '';
    console.log('Request content type:', contentType);
    
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Invalid content type. Expected multipart/form-data' },
        { status: 400 }
      );
    }
    
    const formData = await request.formData();
    const file = formData.get('image') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No image file provided' },
        { status: 400 }
      );
    }
    
    console.log('Image file details:', {
      name: file.name,
      type: file.type,
      size: file.size
    });
    
    // Convert file to base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64Image = buffer.toString('base64');
    
    console.log('Base64 image length:', base64Image.length);
    console.log('Base64 image preview:', base64Image.substring(0, 50) + '...');
    
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }
    
    // Simple GPT-4 Vision request
    console.log('Sending simple request to GPT-4 Vision API...');
    
    const requestPayload = {
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "You are a nutrition AI assistant. Analyze this image of a meal and return ONLY valid JSON that can be parsed with JSON.parse(). Use this format: { \"description\": \"brief description\", \"items\": [\"item1\", \"item2\"] }. Do not include any text outside the JSON." },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 300
    };
    
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        requestPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
          }
        }
      );
      
      console.log('Received response from GPT-4 Vision API');
      const content = response.data.choices[0].message.content;
      console.log('Raw content:', content);
      
      // Try to parse as JSON
      let parsedContent;
      try {
        parsedContent = JSON.parse(content);
        console.log('Successfully parsed JSON directly');
      } catch (directParseError) {
        console.warn('Direct JSON parsing failed, attempting to extract JSON from response...');
        
        // Try to extract JSON using regex
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[0];
          try {
            parsedContent = JSON.parse(jsonStr);
            console.log('Successfully extracted and parsed JSON');
          } catch (extractedParseError) {
            console.error('Failed to parse extracted JSON:', extractedParseError);
            // Use raw content since JSON parsing failed
            parsedContent = { text: content };
          }
        } else {
          console.error('No JSON-like structure found in response');
          // Use raw content since JSON extraction failed
          parsedContent = { text: content };
        }
      }
      
      return NextResponse.json({
        status: 'success',
        message: 'GPT-4 Vision API test successful',
        response: {
          status: response.status,
          content: parsedContent || content
        }
      });
    } catch (error: any) {
      console.error('Error calling GPT-4 Vision API:', error.message);
      console.error('Error status:', error.response?.status);
      console.error('Error details:', JSON.stringify(error.response?.data || 'No additional error details', null, 2));
      
      return NextResponse.json(
        { 
          error: 'Failed to call GPT-4 Vision API',
          details: error.message,
          response: error.response?.data || null,
          status: error.response?.status || null
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error processing request:', error);
    
    return NextResponse.json(
      { error: error.message || 'An error occurred during test' },
      { status: 500 }
    );
  }
} 