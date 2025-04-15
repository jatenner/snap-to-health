import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function GET(request: NextRequest) {
  const results = {
    openai: { status: 'Not tested', error: null as string | null },
    nutritionix: { status: 'Not tested', error: null as string | null }
  };

  // Test OpenAI API
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    
    if (!OPENAI_API_KEY) {
      results.openai.status = 'Failed';
      results.openai.error = 'API key not found';
    } else {
      // Simple request to OpenAI to test the API key
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-3.5-turbo', // Using a simpler model for the test
          messages: [{ role: 'user', content: 'Hello, this is a test.' }],
          max_tokens: 10
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
        }
      );
      
      results.openai.status = 'Success';
    }
  } catch (error: any) {
    results.openai.status = 'Failed';
    results.openai.error = error.message || 'Unknown error';
  }

  // Test Nutritionix API
  try {
    const NUTRITIONIX_APP_ID = process.env.NUTRITIONIX_APP_ID;
    const NUTRITIONIX_API_KEY = process.env.NUTRITIONIX_API_KEY;
    
    if (!NUTRITIONIX_APP_ID || !NUTRITIONIX_API_KEY) {
      results.nutritionix.status = 'Failed';
      results.nutritionix.error = 'API credentials not found';
    } else {
      // Simple request to Nutritionix to test the API credentials
      const response = await axios.post(
        'https://trackapi.nutritionix.com/v2/natural/nutrients',
        {
          query: 'apple',
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-app-id': NUTRITIONIX_APP_ID,
            'x-app-key': NUTRITIONIX_API_KEY,
          },
        }
      );
      
      if (response.data && response.data.foods) {
        results.nutritionix.status = 'Success';
      } else {
        results.nutritionix.status = 'Failed';
        results.nutritionix.error = 'Invalid response from API';
      }
    }
  } catch (error: any) {
    results.nutritionix.status = 'Failed';
    results.nutritionix.error = error.message || 'Unknown error';
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    results
  });
} 