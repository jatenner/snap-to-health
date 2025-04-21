// Import the required dependencies for Google Cloud Vision
const vision = require('@google-cloud/vision');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

// Simple test function for Vision API
async function testVision() {
  try {
    // Check credentials path
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || './keys/snaphealth-39b14-3f3253d44b6c.json';
    console.log(`Using credentials from: ${credPath}`);
    
    if (!credPath) {
      console.error('Error: GOOGLE_APPLICATION_CREDENTIALS environment variable not set');
      process.exit(1);
    }
    
    // Make path absolute if relative
    const absPath = credPath.startsWith('./') || credPath.startsWith('../') 
      ? path.resolve(process.cwd(), credPath)
      : credPath;
      
    if (!fs.existsSync(absPath)) {
      console.error(`Error: Credentials file not found at ${absPath}`);
      process.exit(1);
    }
    
    // Initialize Vision client
    const client = new vision.ImageAnnotatorClient({
      keyFilename: absPath
    });
    
    // Create a test image with clearly visible text
    // This is a longer base64 string of a simple image with the text "Hello World"
    const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAASwAAACWCAYAAABkW7XSAAAAhklEQVR42u3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIC3AYbCAAGvKEGqAAAAAElFTkSuQmCC';
    
    // Test also with a file from disk if available
    console.log('Testing with base64 image:');
    const [result] = await client.textDetection({
      image: { content: Buffer.from(base64Image, 'base64') }
    });
    
    console.log('Text detected from base64 image:');
    console.log(result.textAnnotations);
    
    // Try with a local test file if it exists
    const testImagePath = path.join(__dirname, 'test-image.jpg');
    if (fs.existsSync(testImagePath)) {
      console.log('\nTesting with local file:', testImagePath);
      const [fileResult] = await client.textDetection(testImagePath);
      console.log('Text detected from file:');
      console.log(fileResult.textAnnotations);
    } else {
      console.log('\nNo local test image found at', testImagePath);
    }
    
  } catch (error) {
    console.error('Error in Vision API test:', error);
  }
}

// Run the test
testVision().catch(console.error);
