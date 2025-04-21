/**
 * Google Vision API Credential Verification Tool
 * 
 * This script tests both methods of credential configuration:
 * 1. Base64 encoded credentials (GOOGLE_VISION_PRIVATE_KEY_BASE64)
 * 2. File path credentials (GOOGLE_APPLICATION_CREDENTIALS)
 * 
 * Run with: node scripts/verify-vision-credentials.js
 */

require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const os = require('os');
const { ImageAnnotatorClient } = require('@google-cloud/vision');

// Test constants
const TEST_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAABGdBTUEAALGPC/xhBQAAAAlwSFlzAAAuIwAALiMBeKU/dgAAABl0RVh0U29mdHdhcmUAcGFpbnQubmV0IDQuMC4yMfEgaZUAAAHTSURBVDhPrZS9SwJxHMX9K1wKImiooKGhJYqIUKIhkIaQhgYbGhoiasihpT9AqKklaGmIiKAogqCQIi0vDfXQh7vc+S1P6CKuHORdns83n/d5v/v7/SL+BDuN7v8VMLgcHBxi0L9Av33Gl9pz1l0IEFYq1W9x2B9xiJZBbDmXHwliDXSVytXvQlY6hdfjXX6rN+eXVQARrDaL75e+Pvdt5XqPn8ZdxcqcwmhSVAGi6HCOyHmHG5SLebpBvqzIeQH+zLvgGN15I0k3tLrqxNsEGQf0gEDgV8A94EbLuKhayJTZHLJbWWRzx1jMX9J+QNAGIRSaSJI+YDqRRLFwQdA8LS6q2mTCRCKJCMH0BNuaIWRppVzO0S4ItE9QHW8Vv3NdBCnSNkG0IpuLr4q8wvt7nWAagm1QJ3EEmGnFIUCE4PLVQf7eMpfMXhKZrIusrCJYF8H6CbaT+cPJLKGwD5omK4CbWMZWyoH01h6yhRwt8xbYQQKWgTZRLlzq/oNBsHzRikDGFQdHR2M8WT1mYDPZodUbugTcg37vDEH/IkbCuyGFIZUZ3R1j7Ib8WA5uYNxnTZnNmm6FIa21W/rl0L7B0Wl3Oik+1mX4F/wAGe2T+5OXLxUAAAAASUVORK5CYII=';

// Color terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

/**
 * Create a temporary file from base64 credentials
 */
function createTempCredentialFile(base64Credentials) {
  try {
    const credentialsBuffer = Buffer.from(base64Credentials, 'base64');
    const credentialsJson = credentialsBuffer.toString('utf-8');
    
    // Validate JSON structure
    const credentials = JSON.parse(credentialsJson);
    
    // Create a unique temporary file
    const tmpDir = os.tmpdir();
    const fileName = `vision-credentials-verify-${Date.now()}.json`;
    const filePath = path.join(tmpDir, fileName);
    
    // Write credentials to temporary file
    fs.writeFileSync(filePath, credentialsJson, { encoding: 'utf-8' });
    
    console.log(`${colors.cyan}Created temporary credentials file at: ${filePath}${colors.reset}`);
    return filePath;
  } catch (error) {
    console.error(`${colors.red}Failed to create temporary credentials file: ${error.message}${colors.reset}`);
    return null;
  }
}

/**
 * Test API with base64 encoded credentials
 */
async function testBase64Credentials() {
  const base64Credentials = process.env.GOOGLE_VISION_PRIVATE_KEY_BASE64;
  
  if (!base64Credentials) {
    console.log(`${colors.yellow}⚠️ GOOGLE_VISION_PRIVATE_KEY_BASE64 is not set in .env.local${colors.reset}`);
    return false;
  }
  
  console.log(`${colors.cyan}Testing Base64 encoded credentials...${colors.reset}`);
  
  try {
    // Create temporary file
    const tempFilePath = createTempCredentialFile(base64Credentials);
    if (!tempFilePath) {
      return false;
    }
    
    // Initialize client with temporary file
    const visionClient = new ImageAnnotatorClient({ keyFilename: tempFilePath });
    
    // Test with simple image
    const [result] = await visionClient.textDetection({
      image: { content: Buffer.from(TEST_IMAGE_BASE64, 'base64') }
    });
    
    const success = result && (result.textAnnotations || result.fullTextAnnotation);
    
    if (success) {
      console.log(`${colors.green}✅ Base64 credentials are valid!${colors.reset}`);
      // Clean up temp file
      fs.unlinkSync(tempFilePath);
      return true;
    } else {
      console.log(`${colors.red}❌ Base64 credentials didn't produce expected results${colors.reset}`);
      return false;
    }
  } catch (error) {
    console.error(`${colors.red}❌ Base64 credential test failed: ${error.message}${colors.reset}`);
    return false;
  }
}

/**
 * Test API with credentials file
 */
async function testFileCredentials() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  
  if (!credentialsPath) {
    console.log(`${colors.yellow}⚠️ GOOGLE_APPLICATION_CREDENTIALS is not set in .env.local${colors.reset}`);
    return false;
  }
  
  console.log(`${colors.cyan}Testing credentials from file: ${credentialsPath}${colors.reset}`);
  
  try {
    // Make path absolute if it's relative
    const absolutePath = credentialsPath.startsWith('./') || credentialsPath.startsWith('../') 
      ? path.resolve(process.cwd(), credentialsPath)
      : credentialsPath;
    
    // Check if the file exists
    if (!fs.existsSync(absolutePath)) {
      console.error(`${colors.red}❌ Credentials file not found at: ${absolutePath}${colors.reset}`);
      return false;
    }
    
    // Initialize client with credentials file
    const visionClient = new ImageAnnotatorClient({ keyFilename: absolutePath });
    
    // Test with simple image
    const [result] = await visionClient.textDetection({
      image: { content: Buffer.from(TEST_IMAGE_BASE64, 'base64') }
    });
    
    const success = result && (result.textAnnotations || result.fullTextAnnotation);
    
    if (success) {
      console.log(`${colors.green}✅ File credentials are valid!${colors.reset}`);
      return true;
    } else {
      console.log(`${colors.red}❌ File credentials didn't produce expected results${colors.reset}`);
      return false;
    }
  } catch (error) {
    console.error(`${colors.red}❌ File credential test failed: ${error.message}${colors.reset}`);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.log(`${colors.magenta}======================================${colors.reset}`);
  console.log(`${colors.magenta}Google Cloud Vision Credential Verifier${colors.reset}`);
  console.log(`${colors.magenta}======================================${colors.reset}`);
  
  // Output environment info
  console.log(`\n${colors.cyan}Environment Information:${colors.reset}`);
  console.log(`Node.js: ${process.version}`);
  console.log(`Platform: ${process.platform}`);
  console.log(`USE_OCR_EXTRACTION: ${process.env.USE_OCR_EXTRACTION}`);
  console.log(`OCR_PROVIDER: ${process.env.OCR_PROVIDER}`);
  
  // Test both credential methods
  console.log(`\n${colors.cyan}Testing credential methods:${colors.reset}`);
  
  const base64Success = await testBase64Credentials();
  const fileSuccess = await testFileCredentials();
  
  // Summary
  console.log(`\n${colors.magenta}======================================${colors.reset}`);
  console.log(`${colors.magenta}Results:${colors.reset}`);
  console.log(`Base64 Credentials (Preferred): ${base64Success ? colors.green + '✅ VALID' : colors.red + '❌ INVALID'}${colors.reset}`);
  console.log(`File Credentials (Fallback): ${fileSuccess ? colors.green + '✅ VALID' : colors.red + '❌ INVALID'}${colors.reset}`);
  
  // Recommendations
  console.log(`\n${colors.cyan}Recommendations:${colors.reset}`);
  
  if (base64Success) {
    console.log(`${colors.green}✅ Your Base64 credentials are properly configured.${colors.reset}`);
    console.log(`${colors.green}This is the preferred method for Vercel deployment.${colors.reset}`);
  } else if (fileSuccess) {
    console.log(`${colors.yellow}⚠️ Using file credentials works, but Base64 encoding is preferred for Vercel.${colors.reset}`);
    console.log(`${colors.yellow}To convert your credentials file to Base64, run:${colors.reset}`);
    console.log(`${colors.magenta}cat ${process.env.GOOGLE_APPLICATION_CREDENTIALS} | base64${colors.reset}`);
  } else {
    console.log(`${colors.red}❌ Neither credential method is working. Please check your credentials.${colors.reset}`);
    console.log(`${colors.yellow}Make sure you've downloaded the service account key from Google Cloud Console.${colors.reset}`);
  }
  
  console.log(`${colors.magenta}======================================${colors.reset}`);
}

// Run the script
main().catch(error => {
  console.error(`${colors.red}Script error: ${error.message}${colors.reset}`);
  process.exit(1);
}); 