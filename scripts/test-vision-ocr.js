#!/usr/bin/env node

/**
 * Test script for Google Cloud Vision OCR implementation
 * 
 * This script tests the Vision API with both credential approaches:
 * 1. Local file-based credentials (GOOGLE_APPLICATION_CREDENTIALS)
 * 2. Base64 encoded credentials (GOOGLE_VISION_PRIVATE_KEY_BASE64)
 * 
 * Usage:
 *   node test-vision-ocr.js
 */

// Load environment variables from .env.local
require('dotenv').config({ path: '.env.local' });

const { ImageAnnotatorClient } = require('@google-cloud/vision');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

/**
 * Creates a temporary credential file from Base64 encoded credentials
 */
function createTempCredentialFile(base64Credentials) {
  try {
    // Decode Base64 credentials
    const credentialsBuffer = Buffer.from(base64Credentials, 'base64');
    const credentialsJson = credentialsBuffer.toString('utf-8');
    
    // Create a unique temporary file name in the system temp directory
    const tmpDir = os.tmpdir();
    const fileName = `vision-credentials-${Date.now()}.json`;
    const filePath = path.join(tmpDir, fileName);
    
    // Write credentials to temporary file
    fs.writeFileSync(filePath, credentialsJson, { encoding: 'utf-8' });
    
    console.log(`${colors.dim}Created temporary credentials file at: ${filePath}${colors.reset}`);
    return filePath;
  } catch (error) {
    console.error(`${colors.red}Failed to create temporary credentials file:${colors.reset}`, error);
    throw new Error('Failed to create temporary credentials file');
  }
}

/**
 * Create a simple test image with text
 */
function createTestImage() {
  // Create a Canvas with text
  const { createCanvas } = require('canvas');
  const canvas = createCanvas(400, 200);
  const ctx = canvas.getContext('2d');
  
  // Draw a white background
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, 400, 200);
  
  // Draw some text
  ctx.fillStyle = 'black';
  ctx.font = 'bold 24px Arial';
  ctx.fillText('OCR Test 123', 50, 50);
  ctx.fillText('Grilled Chicken Salad', 50, 100);
  ctx.fillText('Quinoa with Vegetables', 50, 150);
  
  // Return as buffer
  return canvas.toBuffer();
}

/**
 * Run OCR on a test image using Vision API
 */
async function testOCRWithClient(client, testName) {
  console.log(`${colors.bright}${colors.blue}Running Google Vision OCR Test (${testName})${colors.reset}`);
  
  try {
    // Create a test image
    const imageBuffer = createTestImage();
    console.log(`${colors.dim}Created test image${colors.reset}`);
    
    // Call Vision API for text detection
    console.log(`${colors.yellow}Sending image to Google Cloud Vision API...${colors.reset}`);
    const startTime = Date.now();
    const [result] = await client.textDetection({
      image: { content: imageBuffer }
    });
    const endTime = Date.now();
    
    // Process results
    const detections = result.textAnnotations || [];
    if (!detections.length) {
      console.error(`${colors.red}No text detected in image${colors.reset}`);
      return false;
    }
    
    // The first annotation contains the entire extracted text
    const fullTextAnnotation = detections[0];
    const extractedText = fullTextAnnotation.description || '';
    
    console.log(`${colors.green}✓ OCR test successful (${endTime - startTime}ms)${colors.reset}`);
    console.log(`${colors.cyan}• Extracted text:${colors.reset} "${extractedText}"`);
    console.log(`${colors.cyan}• Words detected:${colors.reset} ${detections.length - 1}`);
    
    // Check for expected text
    if (extractedText.includes('OCR Test 123') && 
        extractedText.includes('Grilled Chicken')) {
      console.log(`${colors.green}✓ Test text correctly identified${colors.reset}`);
      return true;
    } else {
      console.log(`${colors.yellow}⚠ Test text not fully identified${colors.reset}`);
      return false;
    }
  } catch (error) {
    console.error(`${colors.red}✗ OCR Test failed:${colors.reset}`, error);
    return false;
  }
}

/**
 * Main test function that runs both credential approaches
 */
async function runTests() {
  console.log(`${colors.bright}${colors.magenta}Google Cloud Vision API Credential Tests${colors.reset}`);
  console.log(`${colors.dim}Testing both credential approaches for Vision API${colors.reset}`);
  console.log('');
  
  let fileClient = null;
  let base64Client = null;
  let fileClientSuccess = false;
  let base64ClientSuccess = false;
  let tempFilePath = '';
  
  // 1. Test file-based credentials
  try {
    console.log(`${colors.bright}[TEST 1] Using file-based credentials${colors.reset}`);
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    
    if (!credentialsPath) {
      console.error(`${colors.red}GOOGLE_APPLICATION_CREDENTIALS not set in .env.local${colors.reset}`);
    } else {
      console.log(`${colors.dim}Using credentials from: ${credentialsPath}${colors.reset}`);
      
      // Make path absolute if it's relative
      const absolutePath = credentialsPath.startsWith('./') || credentialsPath.startsWith('../') 
        ? path.resolve(process.cwd(), credentialsPath)
        : credentialsPath;
      
      // Check if the file exists
      if (fs.existsSync(absolutePath)) {
        // Initialize client with the file
        fileClient = new ImageAnnotatorClient({
          keyFilename: absolutePath
        });
        
        // Run the test
        fileClientSuccess = await testOCRWithClient(fileClient, 'file-based credentials');
      } else {
        console.error(`${colors.red}Credentials file not found at: ${absolutePath}${colors.reset}`);
      }
    }
  } catch (error) {
    console.error(`${colors.red}Error testing file-based credentials:${colors.reset}`, error);
  }
  
  console.log('\n-------------------------------------------\n');
  
  // 2. Test Base64 encoded credentials
  try {
    console.log(`${colors.bright}[TEST 2] Using Base64 encoded credentials${colors.reset}`);
    const base64Credentials = process.env.GOOGLE_VISION_PRIVATE_KEY_BASE64;
    
    if (!base64Credentials) {
      console.error(`${colors.red}GOOGLE_VISION_PRIVATE_KEY_BASE64 not set in .env.local${colors.reset}`);
    } else if (base64Credentials.length < 100) {
      console.error(`${colors.red}GOOGLE_VISION_PRIVATE_KEY_BASE64 is too short, might be invalid${colors.reset}`);
    } else {
      // Create temporary file
      tempFilePath = createTempCredentialFile(base64Credentials);
      
      // Initialize client
      base64Client = new ImageAnnotatorClient({
        keyFilename: tempFilePath
      });
      
      // Run the test
      base64ClientSuccess = await testOCRWithClient(base64Client, 'Base64 encoded credentials');
    }
  } catch (error) {
    console.error(`${colors.red}Error testing Base64 encoded credentials:${colors.reset}`, error);
  }
  
  // Clean up temporary file
  if (tempFilePath && fs.existsSync(tempFilePath)) {
    try {
      fs.unlinkSync(tempFilePath);
      console.log(`${colors.dim}Cleaned up temporary credentials file${colors.reset}`);
    } catch (error) {
      console.error(`${colors.yellow}Failed to clean up temporary file:${colors.reset}`, error);
    }
  }
  
  // Summary
  console.log('\n-------------------------------------------\n');
  console.log(`${colors.bright}${colors.magenta}Test Results Summary${colors.reset}`);
  console.log(`${colors.cyan}• File-based credentials:${colors.reset} ${fileClientSuccess ? colors.green + 'PASSED' : colors.red + 'FAILED'}${colors.reset}`);
  console.log(`${colors.cyan}• Base64 encoded credentials:${colors.reset} ${base64ClientSuccess ? colors.green + 'PASSED' : colors.red + 'FAILED'}${colors.reset}`);
  
  if (fileClientSuccess || base64ClientSuccess) {
    console.log(`\n${colors.green}✓ Google Cloud Vision API is correctly configured!${colors.reset}`);
    
    if (fileClientSuccess && !base64ClientSuccess) {
      console.log(`\n${colors.yellow}⚠ Only file-based credentials are working. You may need to fix the Base64 encoded credentials for Vercel deployment.${colors.reset}`);
    } else if (!fileClientSuccess && base64ClientSuccess) {
      console.log(`\n${colors.yellow}⚠ Only Base64 encoded credentials are working. Your local development setup may be affected.${colors.reset}`);
    }
  } else {
    console.log(`\n${colors.red}✗ Google Cloud Vision API configuration failed for both approaches.${colors.reset}`);
    console.log(`${colors.yellow}Check your credentials and ensure the Vision API is enabled in your Google Cloud project.${colors.reset}`);
  }
}

// Install required packages if not already installed
function ensurePackagesInstalled() {
  // Check if canvas is installed
  try {
    require.resolve('canvas');
  } catch (error) {
    console.error(`${colors.yellow}The 'canvas' package is required for this test but not installed.${colors.reset}`);
    console.log(`${colors.yellow}Please run: npm install --save-dev canvas${colors.reset}`);
    process.exit(1);
  }
}

// Run the tests
ensurePackagesInstalled();
runTests().catch(console.error);