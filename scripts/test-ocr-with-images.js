#!/usr/bin/env node

/**
 * OCR Testing Script
 * 
 * This script automatically tests the OCR functionality by:
 * 1. Reading images from the test-images directory
 * 2. Sending them to the OCR API endpoint
 * 3. Displaying and validating the results
 * 
 * Usage:
 *   node test-ocr-with-images.js [options]
 * 
 * Options:
 *   --dir=<directory>     Directory containing test images (default: ./test-images/ocr-samples)
 *   --api=<endpoint>      API endpoint to use (default: http://localhost:3000/api/test-ocr)
 *   --format=<format>     Image format to test (png, jpg, all) (default: all)
 *   --verbose             Enable verbose output
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  dir: './test-images/ocr-samples',
  api: 'http://localhost:3000/api/test-ocr',
  format: 'all',
  verbose: false
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
  }
});

// Main function to test OCR
async function testOCR() {
  console.log(`🔍 OCR Testing Tool`);
  console.log(`📁 Looking for images in: ${options.dir}`);
  console.log(`🌐 Using API endpoint: ${options.api}`);
  
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
      // Read the image file
      const imageBuffer = fs.readFileSync(filePath);
      const startTime = Date.now();
      
      // Create a FormData instance
      const formData = new FormData();
      formData.append('image', imageBuffer, { filename: file });
      
      // Send the request
      console.log(`🚀 Sending request to OCR API...`);
      const response = await axios.post(options.api, formData, {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: 30000, // 30s timeout
      });
      
      const endTime = Date.now();
      const elapsedTime = (endTime - startTime) / 1000;
      
      // Process the response
      const result = {
        file,
        elapsedTime,
        success: response.status === 200,
        status: response.status,
        extractedText: response.data.text || null,
        confidence: response.data.confidence || null,
        error: null
      };
      
      if (result.success) {
        console.log(`✅ OCR successful (${elapsedTime.toFixed(2)}s)`);
        console.log(`📋 Extracted text (first 150 chars):`);
        console.log(`   ${(result.extractedText || '').substring(0, 150).replace(/\n/g, ' ')}...`);
        if (result.confidence !== null) {
          console.log(`🎯 Confidence: ${result.confidence.toFixed(2)}%`);
        }
        results.success++;
      } else {
        console.error(`❌ OCR failed with status ${response.status}`);
        result.error = response.data;
        results.failed++;
      }
      
      results.details.push(result);
      
      if (options.verbose) {
        console.log(`📊 Full response:`, JSON.stringify(response.data, null, 2));
      }
      
    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
      results.details.push({
        file,
        success: false,
        error: error.message
      });
      results.failed++;
    }
  }
  
  // Print summary
  console.log(`\n📊 OCR Test Summary`);
  console.log(`🔢 Total tests: ${results.total}`);
  console.log(`✅ Successful: ${results.success}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`⏱️ Average processing time: ${results.details
    .filter(d => d.elapsedTime)
    .reduce((sum, d) => sum + d.elapsedTime, 0) / 
    results.details.filter(d => d.elapsedTime).length || 0}s`);
  
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