#!/usr/bin/env node

/**
 * This script verifies that GPT-4o Vision is working correctly and OCR fallback is available
 * It tests the /api/health endpoint and outputs the configuration
 */

// Run with: node src/scripts/verify-vision-ocr.js [environment URL]
// e.g., node src/scripts/verify-vision-ocr.js http://localhost:3000

const http = require('http');
const https = require('https');

// Get URL from command line or use default
const baseUrl = process.argv[2] || 'http://localhost:3000';

console.log(`🔍 Verifying GPT-4o Vision configuration on ${baseUrl}`);

// Function to make a GET request to the specified URL
async function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    const req = client.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve(jsonData);
        } catch (error) {
          reject(new Error(`Failed to parse JSON: ${error.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.end();
  });
}

// Main function to verify the configuration
async function verifyConfiguration() {
  try {
    // Get health endpoint data
    const healthData = await makeRequest(`${baseUrl}/api/health`);
    
    console.log('\n===== Configuration =====');
    console.log(`Status: ${healthData.status}`);
    console.log(`GPT-4o Vision: ${healthData.config.useGpt4Vision ? 'ENABLED ✅' : 'DISABLED ❌'}`);
    console.log(`OCR Extraction: ${healthData.config.useOcrExtraction ? 'ENABLED ✅' : 'DISABLED ❌'}`);
    console.log(`Active Method: ${healthData.config.activeAnalysisMethod}`);
    console.log(`OpenAI API Key: ${healthData.config.openaiConfigured ? 'PRESENT ✅' : 'MISSING ❌'}`);
    console.log(`API Keys Valid: ${JSON.stringify(healthData.config.keysValid)}`);
    
    // Check if everything is working correctly
    if (healthData.status === 'ok' && 
        healthData.config.useGpt4Vision && 
        healthData.config.activeAnalysisMethod === 'gpt4-vision' &&
        healthData.config.openaiConfigured) {
      console.log('\n✅ GPT-4o meal analysis active');
      console.log('The system is properly configured to use GPT-4o Vision for meal analysis with OCR as fallback.');
      process.exit(0);
    } else {
      console.log('\n❌ Configuration issues detected');
      
      if (!healthData.config.useGpt4Vision) {
        console.log('Manual Action Required: Enable GPT-4o Vision by setting USE_GPT4_VISION=true in .env.local');
      }
      
      if (!healthData.config.openaiConfigured) {
        console.log('Manual Action Required: Add valid OPENAI_API_KEY in .env.local');
      }
      
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Error verifying configuration: ${error.message}`);
    process.exit(1);
  }
}

// Run the verification
verifyConfiguration(); 