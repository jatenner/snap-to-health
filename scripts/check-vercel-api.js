#!/usr/bin/env node
const https = require('https');
const dotenv = require('dotenv');

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

// Get the Vercel URL from environment variables
const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL || 'snap-to-health-kcj35mgim-jonah-tenner-s-projects.vercel.app';

console.log(`🔍 Checking Vercel deployment at: https://${vercelUrl}`);

// Function to make a GET request to an endpoint and check the response
function checkEndpoint(endpoint, description) {
  return new Promise((resolve, reject) => {
    const url = `https://${vercelUrl}${endpoint}`;
    console.log(`\n🧪 Testing ${description}: ${url}`);
    
    const req = https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`Status code: ${res.statusCode}`);
        
        try {
          if (data && data.length > 0) {
            const jsonData = JSON.parse(data);
            console.log(`Response: ${JSON.stringify(jsonData, null, 2)}`);
            
            if (res.statusCode === 200) {
              console.log(`✅ ${description} - Success!`);
              resolve({ success: true, data: jsonData });
            } else {
              console.log(`❌ ${description} - Failed with status ${res.statusCode}`);
              resolve({ success: false, status: res.statusCode, error: jsonData.error || 'Unknown error' });
            }
          } else {
            console.log('Empty response');
            resolve({ success: false, error: 'Empty response' });
          }
        } catch (error) {
          console.log(`Error parsing response: ${error.message}`);
          console.log(`Raw response: ${data}`);
          resolve({ success: false, error: error.message, raw: data });
        }
      });
    });
    
    req.on('error', (error) => {
      console.log(`Network error: ${error.message}`);
      resolve({ success: false, error: error.message });
    });
    
    req.on('timeout', () => {
      req.destroy();
      console.log('Request timed out');
      resolve({ success: false, error: 'Request timed out' });
    });
    
    req.setTimeout(10000); // 10 second timeout
    req.end();
  });
}

async function runAllChecks() {
  try {
    // Check OpenAI API with public endpoint
    const openaiCheck = await checkEndpoint('/api/public-test-openai', 'Public OpenAI API');
    
    if (!openaiCheck.success) {
      console.log('\n⚠️ OpenAI API check failed. This could be due to:');
      console.log('1. Invalid or expired OpenAI API key in Vercel environment variables');
      console.log('2. Middleware not bypassing authentication for the test endpoint');
      console.log('3. Deployment not completed or still in progress');
      
      console.log('\n🔄 Results Summary:');
      console.log(`- OpenAI API: ❌ Failed`);
      process.exit(1);
    }
    
    // Summarize results
    console.log('\n🔄 Results Summary:');
    console.log(`- OpenAI API: ✅ Working`);
    console.log('\n🎉 OpenAI API key is working correctly in Vercel!');
    
  } catch (error) {
    console.error('Error running checks:', error);
    process.exit(1);
  }
}

// Run all checks
runAllChecks(); 