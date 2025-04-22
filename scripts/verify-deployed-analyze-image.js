#!/usr/bin/env node

/**
 * Verify the deployed analyzeImage endpoint
 * 
 * Usage:
 *   node verify-deployed-analyze-image.js [url]
 * 
 * Parameters:
 *   url - Optional URL to the deployed API, defaults to https://health-production.vercel.app
 * 
 * Examples:
 *   node verify-deployed-analyze-image.js
 *   node verify-deployed-analyze-image.js https://your-deployment.vercel.app
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Default URL if none provided
const defaultBaseUrl = 'https://health-production.vercel.app';
const baseUrl = process.argv[2] || defaultBaseUrl;

console.log(`🧪 Verifying analyzeImage API at: ${baseUrl}`);

// Test image paths
const testImages = {
  apple: path.join(__dirname, '../public/test-images/apple.jpg'),
};

// Test health goals
const healthGoals = [
  'general health',
  'weight loss',
  'muscle gain'
];

// Utility to convert image to base64
function imageToBase64(filePath) {
  try {
    const data = fs.readFileSync(filePath);
    return data.toString('base64');
  } catch (error) {
    console.error(`❌ Error reading image file: ${filePath}`, error);
    process.exit(1);
  }
}

// Make POST request to analyzeImage endpoint
async function callAnalyzeImageAPI(imagePath, healthGoal) {
  return new Promise((resolve, reject) => {
    const base64Image = imageToBase64(imagePath);
    
    const data = JSON.stringify({
      image: base64Image,
      healthGoal: healthGoal
    });
    
    const options = {
      hostname: baseUrl.replace(/^https?:\/\//, ''),
      port: 443,
      path: '/api/analyzeImage',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    console.log(`📬 Sending request to ${options.hostname}${options.path} (image: ${path.basename(imagePath)}, goal: ${healthGoal})`);
    
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsedData = JSON.parse(responseData);
          resolve({
            statusCode: res.statusCode,
            data: parsedData
          });
        } catch (error) {
          console.error('❌ Error parsing JSON response:', error);
          reject({
            statusCode: res.statusCode,
            error: 'Failed to parse response',
            raw: responseData
          });
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('❌ Request error:', error);
      reject({ error: error.message });
    });
    
    req.write(data);
    req.end();
  });
}

// Log analysis results
function logAnalysisResults(response) {
  if (response.statusCode !== 200 || !response.data.success) {
    console.error('❌ API request failed:', response.data.error || 'Unknown error');
    return false;
  }
  
  const result = response.data.result;
  console.log(`✅ Request successful (ID: ${response.data.requestId})`);
  console.log(`⏱️ Processing time: ${response.data.elapsedTime}ms`);
  
  if (result) {
    console.log(`\n📝 Analysis results:`);
    console.log(`Description: ${result.description?.substring(0, 100)}...`);
    
    if (result.nutrients && result.nutrients.length > 0) {
      console.log(`\n🍎 Detected nutrients (${result.nutrients.length}):`);
      result.nutrients.slice(0, 5).forEach(nutrient => {
        console.log(`  - ${nutrient.name}: ${nutrient.amount} ${nutrient.unit}`);
      });
      if (result.nutrients.length > 5) {
        console.log(`  ... and ${result.nutrients.length - 5} more`);
      }
    }
    
    if (result.feedback) {
      console.log(`\n💬 Feedback: ${result.feedback.substring(0, 100)}...`);
    }
    
    if (result.suggestions && result.suggestions.length > 0) {
      console.log(`\n💡 Suggestions (${result.suggestions.length}):`);
      result.suggestions.slice(0, 3).forEach(suggestion => {
        console.log(`  - ${suggestion.substring(0, 80)}...`);
      });
      if (result.suggestions.length > 3) {
        console.log(`  ... and ${result.suggestions.length - 3} more`);
      }
    }
    
    if (result.detectedFoods && result.detectedFoods.length > 0) {
      console.log(`\n🍽️ Detected foods (${result.detectedFoods.length}):`);
      result.detectedFoods.forEach(food => {
        console.log(`  - ${food}`);
      });
    }
    
    return true;
  } else {
    console.error('❌ No analysis results in response');
    return false;
  }
}

// Run verification tests
async function runTests() {
  let successCount = 0;
  let failureCount = 0;
  const totalTests = Object.keys(testImages).length * healthGoals.length;
  
  console.log(`\n🚀 Running ${totalTests} tests...\n`);
  
  for (const [imageName, imagePath] of Object.entries(testImages)) {
    for (const goal of healthGoals) {
      console.log(`\n📊 Testing image "${imageName}" with goal "${goal}":`);
      console.log('------------------------------------------------');
      
      try {
        const response = await callAnalyzeImageAPI(imagePath, goal);
        const success = logAnalysisResults(response);
        
        if (success) {
          successCount++;
        } else {
          failureCount++;
        }
      } catch (error) {
        console.error('❌ Test failed with error:', error);
        failureCount++;
      }
      
      console.log('------------------------------------------------\n');
    }
  }
  
  // Print summary
  console.log('📋 Test Summary:');
  console.log(`✅ Successful tests: ${successCount}/${totalTests}`);
  console.log(`❌ Failed tests: ${failureCount}/${totalTests}`);
  
  return failureCount === 0;
}

// Run the verification
runTests()
  .then(success => {
    if (success) {
      console.log('🎉 All tests passed successfully!');
      process.exit(0);
    } else {
      console.error('⚠️ Some tests failed');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('💥 Verification failed with error:', error);
    process.exit(1);
  }); 