#!/usr/bin/env node

/**
 * Verify GPT-4 Vision Integration in Deployed Environment
 * 
 * This script makes a request to the deployed application's
 * /api/test-vision endpoint to verify that the GPT-4 Vision
 * integration is properly set up and working.
 * 
 * Usage:
 *   node scripts/verify-vision-integration.js [deployment-url]
 * 
 * If no deployment URL is provided, it defaults to https://snap2health.vercel.app
 */

const https = require('https');
const url = require('url');

// Get deployment URL from command line argument or use default
const deploymentUrl = process.argv[2] || 'https://snap2health.vercel.app';
const apiPath = '/api/test-vision';

console.log(`\n🔍 Verifying GPT-4 Vision integration on: ${deploymentUrl}\n`);
console.log('This test will use a simple test image to verify the OpenAI GPT-4 Vision API integration.');
console.log('The test may take up to 30 seconds to complete...\n');

// Parse the URL to get hostname and path
const parsedUrl = url.parse(`${deploymentUrl}${apiPath}`);

const options = {
  hostname: parsedUrl.hostname,
  path: parsedUrl.path,
  method: 'GET',
  headers: {
    'Accept': 'application/json'
  },
  timeout: 60000 // 60 second timeout
};

const req = https.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      
      if (response.success) {
        console.log('✅ GPT-4 Vision integration test SUCCESSFUL!');
        console.log('\nTest Details:');
        console.log(`- Request ID: ${response.requestId}`);
        console.log(`- Processing Time: ${response.processingTimeMs}ms`);
        
        console.log('\nAnalysis Results:');
        if (response.result && response.result.description) {
          console.log(`- Description: "${response.result.description}"`);
        }
        
        if (response.rawResponse) {
          console.log('\nRaw Response Preview:');
          const preview = typeof response.rawResponse === 'string' 
            ? response.rawResponse.substring(0, 200) + '...' 
            : JSON.stringify(response.rawResponse).substring(0, 200) + '...';
          console.log(preview);
        }
        
        console.log('\n✨ The GPT-4 Vision integration is working properly!');
      } else {
        console.error('❌ GPT-4 Vision integration test FAILED!');
        console.error(`Error: ${response.error || 'Unknown error'}`);
        if (response.errorDetails) {
          console.error(`Error Details: ${response.errorDetails}`);
        }
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Failed to parse response:', error);
      console.error('Raw response:', data);
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request failed:', error.message);
  if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
    console.error('The request timed out. This could be because:');
    console.error('- The server is experiencing high load');
    console.error('- The GPT-4 Vision API is slow to respond');
    console.error('- The request is being rate limited');
  }
  process.exit(1);
});

req.on('timeout', () => {
  console.error('❌ Request timed out after 60 seconds');
  req.destroy();
});

req.end();

console.log('Sending request to test GPT-4 Vision integration...'); 