#!/usr/bin/env node

/**
 * Verify GPT-4 Vision Integration in Deployed Environment
 * 
 * This script makes a request to the deployed application's
 * /api/test-vision endpoint to verify that the GPT-4 Vision
 * integration is properly configured and working in the deployed environment.
 * 
 * Usage:
 *   node scripts/verify-deployed-vision.js [deployment-url]
 * 
 * If no deployment URL is provided, it defaults to https://snap2health.vercel.app
 */

const https = require('https');
const url = require('url');

// Get deployment URL from command line argument or use default
const deploymentUrl = process.argv[2] || 'https://snap2health.vercel.app';
const apiPath = '/api/test-vision';

console.log(`\n🔍 Verifying GPT-4 Vision integration on: ${deploymentUrl}\n`);

// Parse the URL to get hostname and path
const parsedUrl = url.parse(`${deploymentUrl}${apiPath}`);

const options = {
  hostname: parsedUrl.hostname,
  path: parsedUrl.path,
  method: 'GET',
  headers: {
    'Accept': 'application/json'
  }
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
        console.log('✅ GPT-4 Vision integration verification SUCCESSFUL!');
        console.log(`\nResponse Details:`);
        if (response.requestId) {
          console.log(`- Request ID: ${response.requestId}`);
        }
        if (response.processingTimeMs) {
          console.log(`- Processing Time: ${response.processingTimeMs}ms`);
        }
        
        if (response.result) {
          console.log(`\nAnalysis Result:`);
          console.log(`- Description: ${response.result.description || 'N/A'}`);
          
          if (response.result.nutrients && response.result.nutrients.length > 0) {
            console.log(`- Nutrients: ${response.result.nutrients.length} found`);
            response.result.nutrients.slice(0, 3).forEach(nutrient => {
              console.log(`  • ${nutrient.name}: ${nutrient.value}${nutrient.unit}`);
            });
            if (response.result.nutrients.length > 3) {
              console.log(`  • ... and ${response.result.nutrients.length - 3} more`);
            }
          }
          
          if (response.result.foods && response.result.foods.length > 0) {
            console.log(`- Foods: ${response.result.foods.length} detected`);
            response.result.foods.forEach(food => {
              console.log(`  • ${food.name}`);
            });
          }
        }
        
        if (response.usedLabelDetection) {
          console.log(`\nLabel Detection:`);
          console.log(`- Used Label Detection: ${response.usedLabelDetection}`);
          if (response.detectedLabel) {
            console.log(`- Detected Label: ${response.detectedLabel}`);
          }
          if (response.labelConfidence) {
            console.log(`- Confidence: ${response.labelConfidence}`);
          }
          if (response.labelMatchCandidates && response.labelMatchCandidates.length > 0) {
            console.log(`- Candidates: ${response.labelMatchCandidates.join(', ')}`);
          }
        }
      } else {
        console.error('❌ GPT-4 Vision integration verification FAILED!');
        console.error(`Error: ${response.error || 'Unknown error'}`);
        if (response.errorType) {
          console.error(`Error type: ${response.errorType}`);
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
  process.exit(1);
});

req.end();

console.log('Sending request to verify GPT-4 Vision integration...'); 