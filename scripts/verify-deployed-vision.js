#!/usr/bin/env node

/**
 * Script to verify GPT-4 Vision is working in a deployed environment
 * Uses a public image URL of an apple to test the integration
 * 
 * Usage:
 *   node verify-deployed-vision.js [baseUrl]
 * 
 * Parameters:
 *   baseUrl - Optional base URL of the deployed app (defaults to http://localhost:3000)
 */

const https = require('https');
const http = require('http');

// Default URL is localhost:3000
const baseUrl = process.argv[2] || 'http://localhost:3000';

// Public image of an apple for testing (using Unsplash which is more reliable)
const TEST_IMAGE_URL = 'https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=500&q=80';

/**
 * Makes an HTTP/HTTPS request and returns a promise with the response
 */
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    client.get(url, (res) => {
      const { statusCode } = res;
      const contentType = res.headers['content-type'];
      
      let error;
      if (statusCode !== 200) {
        error = new Error(`Request Failed.\nStatus Code: ${statusCode}`);
      } else if (!/^application\/json/.test(contentType)) {
        error = new Error(`Invalid content-type.\nExpected application/json but received ${contentType}`);
      }
      
      if (error) {
        console.error(error.message);
        res.resume(); // Consume response to free up memory
        reject(error);
        return;
      }
      
      res.setEncoding('utf8');
      let rawData = '';
      
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(rawData);
          resolve(parsedData);
        } catch (e) {
          console.error(e.message);
          reject(e);
        }
      });
    }).on('error', (e) => {
      console.error(`Got error: ${e.message}`);
      reject(e);
    });
  });
}

/**
 * Runs the test with the apple image
 */
async function runTest() {
  console.log(`Verifying GPT-4 Vision integration on ${baseUrl} with a real apple image`);
  
  const url = `${baseUrl}/api/test-vision-with-image?url=${encodeURIComponent(TEST_IMAGE_URL)}&goal=general health`;
  
  console.log(`Testing with URL: ${TEST_IMAGE_URL}`);
  
  try {
    const data = await makeRequest(url);
    
    if (!data.success) {
      console.log('❌ Test FAILED');
      console.log(`Error: ${data.error}`);
      console.log(`Error Detail: ${data.errorDetail || 'No additional details'}`);
      process.exit(1);
      return;
    }
    
    console.log('✅ Test SUCCESSFUL');
    console.log(`Request ID: ${data.requestId}`);
    console.log(`Processing Time: ${data.processingTimeMs}ms`);
    
    const result = data.result;
    if (result) {
      console.log('\nAnalysis Results:');
      console.log(`- Description: ${result.description || 'Not provided'}`);
      
      if (result.nutrients && result.nutrients.length > 0) {
        console.log('\nDetected Nutrients:');
        result.nutrients.forEach(nutrient => {
          console.log(`- ${nutrient.name}: ${nutrient.amount}${nutrient.unit}`);
        });
      } else {
        console.log('No nutrients detected');
      }
      
      if (result.foods && result.foods.length > 0) {
        console.log('\nDetected Foods:');
        result.foods.forEach(food => {
          console.log(`- ${food.name} (Confidence: ${food.confidence || 'unknown'})`);
        });
      } else {
        console.log('No foods detected');
      }
      
      if (result.feedback && result.feedback.length > 0) {
        console.log('\nFeedback:');
        result.feedback.forEach(item => {
          console.log(`- ${item}`);
        });
      }
      
      if (result.suggestions && result.suggestions.length > 0) {
        console.log('\nSuggestions:');
        result.suggestions.forEach(item => {
          console.log(`- ${item}`);
        });
      }
    }
    
    process.exit(0);
  } catch (error) {
    console.error(`Failed to test vision integration:`, error.message);
    process.exit(1);
  }
}

// Run the test
runTest(); 