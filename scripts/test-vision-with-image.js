#!/usr/bin/env node

/**
 * Script to test GPT-4 Vision with a single image on a deployed environment
 * 
 * Usage:
 *   node test-vision-with-image.js [baseUrl] [image] [goal]
 * 
 * Parameters:
 *   baseUrl - Optional base URL of the deployed app (defaults to http://localhost:3000)
 *   image - Optional image name or URL to test (defaults to 'apple')
 *   goal - Optional health goal to use (defaults to 'general health')
 * 
 * Examples:
 *   node test-vision-with-image.js
 *   node test-vision-with-image.js https://your-deployed-app.com
 *   node test-vision-with-image.js https://your-deployed-app.com apple
 *   node test-vision-with-image.js https://your-deployed-app.com https://example.com/food.jpg "weight loss"
 */

const https = require('https');
const http = require('http');

// Parse command line arguments
const baseUrl = process.argv[2] || 'http://localhost:3000';
const imageParam = process.argv[3] || 'apple';
const healthGoal = process.argv[4] || 'general health';

// Determine if the image parameter is a URL or a predefined image name
const isUrl = imageParam.startsWith('http');

/**
 * Makes an HTTP/HTTPS request and returns a promise with the response
 */
function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    console.log(`Making request to: ${url}`);
    
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
          console.error(`Error parsing JSON: ${e.message}`);
          reject(e);
        }
      });
    }).on('error', (e) => {
      console.error(`Network error: ${e.message}`);
      reject(e);
    });
  });
}

/**
 * Logs the result of a vision test
 */
function logResult(data) {
  console.log('\n---------------------------------------------');
  console.log('VISION API TEST RESULTS');
  console.log('---------------------------------------------');
  
  if (!data.success) {
    console.log('❌ Test FAILED');
    console.log(`Error: ${data.error}`);
    console.log(`Error Details: ${data.errorDetail || 'No details provided'}`);
    return false;
  }
  
  console.log('✅ Test SUCCESSFUL');
  console.log(`Request ID: ${data.requestId}`);
  console.log(`Processing Time: ${data.processingTimeMs}ms`);
  console.log(`Health Goal: ${data.healthGoal}`);
  console.log(`Source Type: ${data.sourceType}`);
  console.log(`Source: ${data.source}`);
  
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
    
    if (result.labelDetection) {
      console.log('\nLabel Detection Info:');
      console.log(`- Status: ${result.labelDetection.status}`);
      console.log(`- Processing Time: ${result.labelDetection.processingTimeMs}ms`);
      if (result.labelDetection.detectedLabels) {
        console.log('- Detected Labels:');
        result.labelDetection.detectedLabels.forEach(label => {
          console.log(`  - ${label.description} (Score: ${label.score})`);
        });
      }
    }
    
    if (result.ocrText) {
      console.log('\nOCR Text:');
      console.log(result.ocrText);
    }
    
    if (result.tokens) {
      console.log('\nToken Usage:');
      console.log(`- Prompt: ${result.tokens.prompt}`);
      console.log(`- Completion: ${result.tokens.completion}`);
      console.log(`- Total: ${result.tokens.total}`);
    }
  }
  
  console.log('---------------------------------------------');
  return true;
}

/**
 * Run the test
 */
async function runTest() {
  console.log(`Testing GPT-4 Vision on ${baseUrl}`);
  console.log(`Image: ${imageParam} (${isUrl ? 'URL' : 'Predefined image'})`);
  console.log(`Health Goal: ${healthGoal}`);
  
  // Construct the URL for the test
  let url;
  if (isUrl) {
    url = `${baseUrl}/api/test-vision-with-image?url=${encodeURIComponent(imageParam)}&goal=${encodeURIComponent(healthGoal)}`;
  } else {
    url = `${baseUrl}/api/test-vision-with-image?image=${encodeURIComponent(imageParam)}&goal=${encodeURIComponent(healthGoal)}`;
  }
  
  try {
    const data = await makeRequest(url);
    const success = logResult(data);
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('Test failed with error:', error.message);
    process.exit(1);
  }
}

// Run the test
runTest(); 