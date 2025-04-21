// A script to test GPT-4 Vision integration
require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// Test image - a simple 1x1 orange pixel
const TEST_BASE64_IMAGE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function testGPT4Vision() {
  console.log('⏳ Testing GPT-4 Vision API integration...');
  
  // Check for API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ Error: OPENAI_API_KEY environment variable not set');
    process.exit(1);
  }
  
  console.log('✅ API Key found, initializing test...');
  
  // Prepare the request payload
  const payload = {
    model: "gpt-4o",  // Use the latest model with vision capabilities
    messages: [
      {
        role: "user",
        content: [
          { 
            type: "text", 
            text: "Please describe this image in detail. What do you see? Return JSON format with 'description' field."
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/png;base64,${TEST_BASE64_IMAGE}`
            }
          }
        ]
      }
    ],
    max_tokens: 1000
  };
  
  console.log('📤 Sending request to OpenAI API...');
  
  try {
    const startTime = Date.now();
    
    // Create AbortController for timeout management
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.warn('⚠️ Request timeout reached (30s), aborting');
      controller.abort();
    }, 30000);
    
    // Send request to OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'OpenAI-Beta': 'assistants=v1'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    
    // Clear the timeout
    clearTimeout(timeoutId);
    
    const elapsedTime = (Date.now() - startTime) / 1000;
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ OpenAI API Error (${response.status}): ${errorText}`);
      process.exit(1);
    }
    
    const responseData = await response.json();
    console.log(`✅ OpenAI API response received in ${elapsedTime.toFixed(2)}s`);
    
    // Process the response
    if (
      !responseData.choices || 
      !responseData.choices[0] || 
      !responseData.choices[0].message || 
      !responseData.choices[0].message.content
    ) {
      console.error('❌ Invalid response structure:', JSON.stringify(responseData, null, 2));
      process.exit(1);
    }
    
    const responseContent = responseData.choices[0].message.content;
    console.log('\n📋 Response content:');
    console.log(responseContent);
    
    // Try to parse JSON from the response
    try {
      const jsonMatch = responseContent.match(/\{[\s\S]*\}/);
      const extractedJson = jsonMatch ? jsonMatch[0] : null;
      
      if (extractedJson) {
        const parsedJson = JSON.parse(extractedJson);
        console.log('\n✅ Successfully parsed JSON from response:');
        console.log(JSON.stringify(parsedJson, null, 2));
      } else {
        console.warn('⚠️ No valid JSON found in response');
      }
    } catch (jsonError) {
      console.warn('⚠️ Failed to parse JSON from response:', jsonError.message);
    }
    
    // Print final success message
    console.log(`\n🎉 Test completed successfully in ${elapsedTime.toFixed(2)}s`);
    console.log('🔍 GPT-4 Vision API integration is working properly');
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('❌ Request was aborted due to timeout');
    } else {
      console.error('❌ Error testing GPT-4 Vision:', error);
    }
    process.exit(1);
  }
}

// Run the test
testGPT4Vision().catch(console.error); 