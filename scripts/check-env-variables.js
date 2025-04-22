#!/usr/bin/env node
const https = require('https');
require('dotenv').config({ path: '.env.local' });

console.log('Environment Variable Verification Script');
console.log('========================================');

// Check local environment variables
console.log('\nLocal Environment Variables:');
console.log('---------------------------');
console.log('OPENAI_API_KEY exists:', !!process.env.OPENAI_API_KEY);
if (process.env.OPENAI_API_KEY) {
  console.log('OPENAI_API_KEY format:', `${process.env.OPENAI_API_KEY.substring(0, 8)}...`);
  console.log('OPENAI_API_KEY length:', process.env.OPENAI_API_KEY.length);
}

console.log('NEXT_PUBLIC_OPENAI_API_KEY exists:', !!process.env.NEXT_PUBLIC_OPENAI_API_KEY);
if (process.env.NEXT_PUBLIC_OPENAI_API_KEY) {
  console.log('NEXT_PUBLIC_OPENAI_API_KEY format:', `${process.env.NEXT_PUBLIC_OPENAI_API_KEY.substring(0, 8)}...`);
  console.log('NEXT_PUBLIC_OPENAI_API_KEY length:', process.env.NEXT_PUBLIC_OPENAI_API_KEY.length);
}

// Check if both keys are the same
if (process.env.OPENAI_API_KEY && process.env.NEXT_PUBLIC_OPENAI_API_KEY) {
  console.log('Keys match:', process.env.OPENAI_API_KEY === process.env.NEXT_PUBLIC_OPENAI_API_KEY);
}

// Other important variables
console.log('\nOther Important Variables:');
console.log('-------------------------');
console.log('USE_GPT4_VISION:', process.env.USE_GPT4_VISION);
console.log('USE_OCR_EXTRACTION:', process.env.USE_OCR_EXTRACTION);
console.log('OPENAI_MODEL:', process.env.OPENAI_MODEL);
console.log('Firebase project ID:', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

// Function to test deployed API
function testDeployedApi(url) {
  return new Promise((resolve) => {
    console.log(`\nTesting API endpoint: ${url}`);
    
    const options = {
      method: 'GET',
      timeout: 10000
    };
    
    const req = https.request(url, options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log('Status code:', res.statusCode);
        try {
          if (data && data.length > 0) {
            const jsonData = JSON.parse(data);
            console.log('Response:', JSON.stringify(jsonData, null, 2));
            
            // Check for API key errors
            if (jsonData.error && 
                (jsonData.error.includes('API key') || 
                 jsonData.error.includes('authentication') || 
                 jsonData.error.includes('401'))) {
              console.log('❌ API key error detected!');
            } else {
              console.log('✅ No API key errors detected');
            }
          } else {
            console.log('Empty response');
          }
        } catch (error) {
          console.log('Error parsing response:', error.message);
          console.log('Raw response:', data);
        }
        
        resolve();
      });
    });
    
    req.on('error', (error) => {
      console.log('Error testing API:', error.message);
      resolve();
    });
    
    req.on('timeout', () => {
      req.destroy();
      console.log('Request timed out');
      resolve();
    });
    
    req.end();
  });
}

// Main function to run tests
async function runTests() {
  const deployUrl = process.env.NEXT_PUBLIC_VERCEL_URL || 
                    'snap-to-health-k68ewly9u-jonah-tenner-s-projects.vercel.app';
  
  const fullUrl = `https://${deployUrl}/api/test-openai-key`;
  await testDeployedApi(fullUrl);
  
  console.log('\nVerification completed!');
}

// Run the tests
runTests(); 