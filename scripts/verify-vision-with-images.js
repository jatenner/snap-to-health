#!/usr/bin/env node

/**
 * Script to verify GPT-4 Vision is working correctly on a deployed environment
 * Tests multiple predefined images and optionally a custom URL
 * 
 * Usage:
 *   node verify-vision-with-images.js [baseUrl] [imageUrl]
 * 
 * Parameters:
 *   baseUrl - Optional base URL of the deployed app (defaults to http://localhost:3000)
 *   imageUrl - Optional custom image URL to test
 * 
 * Examples:
 *   node verify-vision-with-images.js
 *   node verify-vision-with-images.js https://your-deployed-app.com
 *   node verify-vision-with-images.js https://your-deployed-app.com https://example.com/food.jpg
 */

const https = require('https');
const http = require('http');

// Default URL is localhost:3000
const baseUrl = process.argv[2] || 'http://localhost:3000';
const customImageUrl = process.argv[3];

// Test images to try
const TEST_IMAGES = ['orange', 'green', 'blue', 'red'];
// Health goals to test with
const TEST_GOALS = ['general health', 'weight loss', 'muscle gain'];

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
 * Logs the result of a vision test
 */
function logResult(data, imageSource) {
  console.log('\n---------------------------------------------');
  console.log(`TEST RESULTS FOR ${imageSource}`);
  console.log('---------------------------------------------');
  
  if (!data.success) {
    console.log('❌ Test FAILED');
    console.log(`Error: ${data.error}`);
    return;
  }
  
  console.log('✅ Test SUCCESSFUL');
  console.log(`Request ID: ${data.requestId}`);
  console.log(`Processing Time: ${data.processingTimeMs}ms`);
  console.log(`Health Goal: ${data.healthGoal}`);
  
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
}

/**
 * Runs a single test with a specific image and goal
 */
async function runTest(imageSource, goal) {
  let url;
  
  if (imageSource.startsWith('http')) {
    // It's a URL
    url = `${baseUrl}/api/test-vision-with-image?url=${encodeURIComponent(imageSource)}&goal=${encodeURIComponent(goal)}`;
  } else {
    // It's a predefined image
    url = `${baseUrl}/api/test-vision-with-image?image=${encodeURIComponent(imageSource)}&goal=${encodeURIComponent(goal)}`;
  }
  
  console.log(`Testing with ${imageSource} for goal "${goal}"...`);
  try {
    const data = await makeRequest(url);
    logResult(data, imageSource);
    return data.success;
  } catch (error) {
    console.error(`Failed to test with ${imageSource}:`, error.message);
    return false;
  }
}

/**
 * Runs all tests
 */
async function runAllTests() {
  console.log(`Verifying GPT-4 Vision integration on ${baseUrl}`);
  let failedTests = 0;
  let passedTests = 0;
  
  // First test the default goal with all test images
  for (const image of TEST_IMAGES) {
    const success = await runTest(image, 'general health');
    if (success) {
      passedTests++;
    } else {
      failedTests++;
    }
  }
  
  // Then test one image with different goals
  const testImage = TEST_IMAGES[0]; // Use the first test image
  for (const goal of TEST_GOALS.slice(1)) { // Skip 'general health' as we already tested it
    const success = await runTest(testImage, goal);
    if (success) {
      passedTests++;
    } else {
      failedTests++;
    }
  }
  
  // Finally, test with custom URL if provided
  if (customImageUrl) {
    const success = await runTest(customImageUrl, 'general health');
    if (success) {
      passedTests++;
    } else {
      failedTests++;
    }
  }
  
  // Print summary
  console.log('\n=============================================');
  console.log('TEST SUMMARY');
  console.log('=============================================');
  console.log(`Total Tests: ${passedTests + failedTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${failedTests}`);
  console.log('=============================================');
  
  process.exit(failedTests > 0 ? 1 : 0);
}

// Run the tests
runAllTests(); 