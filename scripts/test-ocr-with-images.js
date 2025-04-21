#!/usr/bin/env node

/**
 * OCR Testing Script
 * 
 * This script automatically tests the OCR functionality by:
 * 1. Reading images from the test-images directory
 * 2. Sending them to the analyzeImage API endpoint
 * 3. Displaying and validating the results
 * 
 * Usage:
 *   node test-ocr-with-images.js [options]
 * 
 * Options:
 *   --dir=<directory>     Directory containing test images (default: ./test-images/ocr-samples)
 *   --api=<endpoint>      API endpoint to use (default: http://localhost:3000/api/analyzeImage)
 *   --format=<format>     Image format to test (png, jpg, all) (default: all)
 *   --verbose             Enable verbose output
 *   --health-goal=<goal>  Health goal to include (default: "General Health")
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  dir: './test-images/ocr-samples',
  api: 'http://localhost:3000/api/analyzeImage',
  format: 'all',
  verbose: false,
  healthGoal: 'General Health'
};

// Parse arguments
args.forEach(arg => {
  if (arg.startsWith('--dir=')) {
    options.dir = arg.split('=')[1];
  } else if (arg.startsWith('--api=')) {
    options.api = arg.split('=')[1];
  } else if (arg.startsWith('--format=')) {
    options.format = arg.split('=')[1].toLowerCase();
  } else if (arg === '--verbose') {
    options.verbose = true;
  } else if (arg.startsWith('--health-goal=')) {
    options.healthGoal = arg.split('=')[1];
  }
});

/**
 * Convert image file to base64 with proper data prefix
 */
function imageToBase64WithPrefix(filePath) {
  const imageBuffer = fs.readFileSync(filePath);
  const base64Image = imageBuffer.toString('base64');
  
  // Determine the mime type from file extension
  const ext = path.extname(filePath).toLowerCase();
  let mimeType = 'image/png'; // default
  
  if (ext === '.jpg' || ext === '.jpeg') {
    mimeType = 'image/jpeg';
  } else if (ext === '.gif') {
    mimeType = 'image/gif';
  }
  
  return `data:${mimeType};base64,${base64Image}`;
}

// Main function to test OCR
async function testOCR() {
  console.log(`🔍 OCR Testing Tool`);
  console.log(`📁 Looking for images in: ${options.dir}`);
  console.log(`🌐 Using API endpoint: ${options.api}`);
  console.log(`🎯 Health goal: ${options.healthGoal}`);
  
  // Check if directory exists
  if (!fs.existsSync(options.dir)) {
    console.error(`❌ Directory does not exist: ${options.dir}`);
    process.exit(1);
  }
  
  // Get all image files in the directory
  const files = fs.readdirSync(options.dir)
    .filter(file => {
      const ext = path.extname(file).toLowerCase();
      if (options.format === 'all') {
        return ['.png', '.jpg', '.jpeg'].includes(ext);
      }
      return ext === `.${options.format}`;
    });
  
  if (files.length === 0) {
    console.error(`❌ No ${options.format === 'all' ? 'image' : options.format} files found in ${options.dir}`);
    process.exit(1);
  }
  
  console.log(`📷 Found ${files.length} image(s) to test`);
  
  // Start tests
  const results = {
    total: files.length,
    success: 0,
    failed: 0,
    details: []
  };
  
  // Test each image
  for (const file of files) {
    const filePath = path.join(options.dir, file);
    console.log(`\n📄 Testing image: ${file}`);
    
    try {
      // Convert image to base64 with proper data prefix
      const base64Image = imageToBase64WithPrefix(filePath);
      console.log(`🖼️ Converted image to base64 (${base64Image.substring(0, 30)}...)`);
      
      const startTime = Date.now();
      
      // Prepare request payload
      const payload = {
        image: base64Image,
        healthGoal: options.healthGoal
      };
      
      // Send the request
      console.log(`🚀 Sending request to: ${options.api}`);
      const response = await axios.post(options.api, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 60000, // 60s timeout - OCR analysis may take longer
      });
      
      const endTime = Date.now();
      const elapsedTime = (endTime - startTime) / 1000;
      
      // Process the response
      const result = {
        file,
        elapsedTime,
        success: response.status === 200 && response.data.success === true,
        status: response.status,
        httpStatus: response.status,
        apiSuccess: response.data.success,
        fallback: response.data.fallback || false,
        extractedText: null,
        analysisResult: null,
        error: null
      };
      
      // Extract relevant data from response
      if (response.data.result) {
        result.analysisResult = response.data.result;
        
        if (response.data.result.modelInfo && response.data.result.modelInfo.ocrExtracted) {
          result.extractedText = 'OCR extraction successful';
        }
      }
      
      if (result.success) {
        console.log(`✅ Analysis successful (${elapsedTime.toFixed(2)}s)`);
        if (result.fallback) {
          console.log(`⚠️ Fallback mode was used`);
        }
        
        if (result.analysisResult) {
          console.log(`📋 Analysis description: ${result.analysisResult.description?.substring(0, 150) || 'N/A'}...`);
          console.log(`🍽️ Found ${result.analysisResult.detailedIngredients?.length || 0} ingredients`);
          console.log(`📊 Nutrients: ${result.analysisResult.nutrients?.length || 0} items`);
        }
        
        results.success++;
      } else {
        console.error(`❌ Analysis failed with status ${response.status}`);
        result.error = response.data.message || 'Unknown error';
        console.error(`   Error: ${result.error}`);
        results.failed++;
      }
      
      results.details.push(result);
      
      if (options.verbose) {
        console.log(`📊 Full response:`, JSON.stringify(response.data, null, 2));
      }
      
    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
      
      // Capture HTTP error details
      let errorDetails = error.message;
      let responseData = null;
      let status = 0;
      
      if (error.response) {
        status = error.response.status;
        responseData = error.response.data;
        errorDetails = `HTTP ${status}: ${error.response.statusText}`;
        console.error(`   Response data:`, JSON.stringify(responseData, null, 2));
      } else if (error.request) {
        errorDetails = `No response received: ${error.message}`;
      }
      
      results.details.push({
        file,
        success: false,
        status: status,
        httpStatus: status,
        error: errorDetails,
        responseData: responseData
      });
      
      results.failed++;
    }
  }
  
  // Print summary
  console.log(`\n📊 OCR Test Summary`);
  console.log(`🔢 Total tests: ${results.total}`);
  console.log(`✅ Successful: ${results.success}`);
  console.log(`❌ Failed: ${results.failed}`);
  
  if (results.details.filter(d => d.elapsedTime).length > 0) {
    const avgTime = results.details
      .filter(d => d.elapsedTime)
      .reduce((sum, d) => sum + d.elapsedTime, 0) / 
      results.details.filter(d => d.elapsedTime).length;
    
    console.log(`⏱️ Average processing time: ${avgTime.toFixed(2)}s`);
  }
  
  // Save results to file
  const resultsPath = path.join(options.dir, 'ocr-test-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`💾 Results saved to: ${resultsPath}`);
}

// Run the main function
testOCR().catch(err => {
  console.error('🔥 Fatal error:', err);
  process.exit(1);
}); 