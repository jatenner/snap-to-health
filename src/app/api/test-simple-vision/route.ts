import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { nanoid } from 'nanoid';

// Very simple red square test image
const TEST_IMAGE = 'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyJpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuMy1jMDExIDY2LjE0NTY2MSwgMjAxMi8wMi8wNi0xNDo1NjoyNyAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENTNiAoV2luZG93cykiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6QzZGQ0RGQjVDODVDMTFFQTg0NTg4NUJBMzVGNTVERTYiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6QzZGQ0RGQjZDODVDMTFFQTg0NTg4NUJBMzVGNTVERTYiPiA8eG1wTU06RGVyaXZlZEZyb20gc3RSZWY6aW5zdGFuY2VJRD0ieG1wLmlpZDpDNkZDREZCM0M4NUMxMUVBODQ1ODg1QkEzNUY1NURFNiIgc3RSZWY6ZG9jdW1lbnRJRD0ieG1wLmRpZDpDNkZDREZCNEM4NUMxMUVBODQ1ODg1QkEzNUY1NURFNiIvPiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI/Pv/r/N8AAAGxSURBVHja7NxbbsIwEIVhhcf3vQFrYCWwEpbMMgrraDegEohwjicvMeLk8z9aVa1K1XQykzyepF6+A1PSxfsDfd/3/bNPsTzapWnYsSNGRZoYX8yhYa1HDymhIp1Xu2huB42hIQ10hIz8Q5poYrTQEPcNf/7u//w1ykBDE9m8/nQQDQmPEXoIY0RIqz1GhDTMHCNCesUwRoQ0fcUacXuAjCiNeD5ARhRHVFE8HSAjCiP6KJ6j/Md3QjF2vD6ijctHoK3L56C9ywegzcv7oe3Lm6GC5Y1QyfImqGh5PVS2vBKqXF4D1S6vgKqXl0P1y1tAI8sT0WUCsbPXq5UTu23DTBKFdNLZ7uZsayNKJ8cjdsGxS55TQ2uXPKeG1i55Tg2tXfIMGrT4Z5DpD9GMkFG75IFP4JeXPEpCzSePklDz5KtS0bquqyRUP3nMCXVPHnNCzZPHnFDtADKn9hE1g8acUOUAMqd4+wMND6BBIg1QVxqgxjRAnWmQmtMg9aRhakkD1KcGqJc0QPNLQzTbNED92zDxgzRADdAATfUYof5tQEKHkDRMHRtWfDfEfjUg1qD1K8AA2Sw2V4xKWCEAAAAASUVORK5CYII=';

export async function GET(req: NextRequest) {
  const requestId = nanoid();
  const startTime = Date.now();
  
  console.log(`[${requestId}] 🔍 Testing OpenAI Vision API with basic test image`);
  console.log(`[${requestId}] OpenAI Key present:`, !!process.env.OPENAI_API_KEY);
  
  try {
    // Validate API key
    if (!process.env.OPENAI_API_KEY) {
      console.error(`[${requestId}] ❌ Missing OpenAI API key`);
      return NextResponse.json(
        { error: 'Server configuration error: Missing API credentials' },
        { status: 500 }
      );
    }
    
    // Initialize OpenAI client with API key
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    // Make a basic vision request
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What color is this square? Reply with just one word." },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${TEST_IMAGE}`,
              },
            },
          ],
        },
      ],
      max_tokens: 300,
    });
    
    const result = response.choices[0]?.message?.content || "No response";
    
    // Calculate processing time
    const processingTime = Date.now() - startTime;
    console.log(`[${requestId}] ✅ Vision test completed in ${processingTime}ms`);
    
    return NextResponse.json({
      result,
      requestId,
      success: true,
      elapsedTime: processingTime,
      image: "red square test image",
      apiKeyFormat: process.env.OPENAI_API_KEY.substring(0, 8) + "..."
    });
  } catch (error: any) {
    console.error(`[${requestId}] ❌ Test failed:`, error);
    return NextResponse.json(
      { 
        error: `Test failed: ${error.message || 'Unknown error'}`,
        requestId,
        success: false,
        elapsedTime: Date.now() - startTime
      },
      { status: 500 }
    );
  }
} 