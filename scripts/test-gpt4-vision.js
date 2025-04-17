#!/usr/bin/env node

require('dotenv').config({ path: '.env.local' });
const OpenAI = require('openai');

// ANSI color codes for colorful console output
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

/**
 * Test access to GPT-4 Vision model specifically
 */
async function testGPT4Vision() {
  console.log(`${COLORS.blue}===== TESTING GPT-4 VISION MODEL ACCESS =====${COLORS.reset}\n`);
  
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.log(`${COLORS.red}ERROR: OPENAI_API_KEY is not set in your .env.local file${COLORS.reset}`);
    return;
  }
  
  console.log(`${COLORS.cyan}API Key format: ${apiKey.substring(0, 10)}...${COLORS.reset}`);
  
  const openai = new OpenAI({ apiKey });
  
  try {
    console.log(`${COLORS.cyan}Testing direct model availability...${COLORS.reset}`);
    
    try {
      const model = await openai.models.retrieve('gpt-4-vision-preview');
      console.log(`${COLORS.green}SUCCESS: gpt-4-vision-preview model is available!${COLORS.reset}`);
      console.log(`Model details: ${model.id}, Created: ${model.created}`);
    } catch (modelError) {
      console.log(`${COLORS.yellow}WARNING: Could not directly verify gpt-4-vision-preview availability${COLORS.reset}`);
      console.log(`Error: ${modelError.message}`);
      console.log(`${COLORS.yellow}This could be due to API limitations. Let's try an actual API call...${COLORS.reset}`);
    }
    
    console.log(`\n${COLORS.cyan}Testing actual GPT-4 Vision API call...${COLORS.reset}`);
    console.log('Attempting to analyze a mock image with GPT-4-Vision...');
    
    // Create a simple base64 encoded 1x1 transparent PNG
    const mockImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFeAJc0cWN4wAAAABJRU5ErkJggg==';
    
    // Attempt to call GPT-4-Vision API
    try {
      const visionResponse = await openai.chat.completions.create({
        model: 'gpt-4-vision-preview',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is in this image?' },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${mockImageBase64}`,
                  detail: 'low'
                }
              }
            ]
          }
        ],
        max_tokens: 50
      });
      
      console.log(`${COLORS.green}SUCCESS: Successfully made API call to GPT-4-Vision!${COLORS.reset}`);
      console.log(`Response: "${visionResponse.choices[0]?.message?.content?.substring(0, 100)}..."`);
      console.log(`Model used: ${visionResponse.model}`);
      console.log(`Usage: ${JSON.stringify(visionResponse.usage)}`);
      
      return true;
    } catch (visionError) {
      console.log(`${COLORS.red}ERROR: Failed to make GPT-4-Vision API call${COLORS.reset}`);
      console.log(`Error message: ${visionError.message}`);
      
      if (visionError.status === 401) {
        console.log(`${COLORS.red}This is an authentication error (401) - your API key is invalid or revoked${COLORS.reset}`);
      } else if (visionError.status === 403) {
        console.log(`${COLORS.red}This is a permissions error (403) - your API key does not have access to GPT-4-Vision${COLORS.reset}`);
      } else if (visionError.status === 404) {
        console.log(`${COLORS.red}Model not found (404) - GPT-4-Vision is not available to your account${COLORS.reset}`);
      }
      
      return false;
    }
  } catch (error) {
    console.log(`${COLORS.red}General error: ${error.message}${COLORS.reset}`);
    return false;
  }
}

/**
 * Check if the current API key can access the legacy model (gpt-4-vision-preview)
 * or if it can access the newer (gpt-4o) model
 */
async function checkModelAccess() {
  console.log(`\n${COLORS.blue}===== CHECKING MODEL ACCESS =====${COLORS.reset}\n`);
  
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log(`${COLORS.red}ERROR: OPENAI_API_KEY is not set in your .env.local file${COLORS.reset}`);
    return;
  }
  
  const openai = new OpenAI({ apiKey });
  let modelsToCheck = [
    'gpt-4-vision-preview',  // Legacy vision model
    'gpt-4o',                // New model with vision capabilities
    'gpt-4o-mini',           // New smaller model with vision capabilities
    'gpt-3.5-turbo'          // Fallback model
  ];
  
  console.log(`${COLORS.cyan}Checking access to specific models:${COLORS.reset}`);
  
  // Try each model
  for (const modelId of modelsToCheck) {
    try {
      await openai.models.retrieve(modelId);
      console.log(`${COLORS.green}✓ ${modelId}: ACCESSIBLE${COLORS.reset}`);
    } catch (error) {
      console.log(`${COLORS.red}✗ ${modelId}: NOT ACCESSIBLE ${COLORS.reset} (${error.message})`);
    }
  }
  
  console.log(`\n${COLORS.cyan}Recommendation:${COLORS.reset}`);
  console.log(`If gpt-4-vision-preview is not accessible but gpt-4o is, update your code to use gpt-4o instead.`);
  console.log(`In src/lib/analyzeImageWithGPT4V.ts, change:`);
  console.log(`const preferredModel = 'gpt-4-vision-preview';`);
  console.log(`to:`);
  console.log(`const preferredModel = 'gpt-4o';`);
}

// Run tests
async function main() {
  try {
    console.log(`${COLORS.bright}${COLORS.blue}=================================================`);
    console.log(`            GPT-4 VISION ACCESS TEST`);
    console.log(`==================================================${COLORS.reset}\n`);
    
    await testGPT4Vision();
    await checkModelAccess();
    
    console.log('\n');
  } catch (error) {
    console.error(`Test failed with error: ${error.message}`);
    process.exit(1);
  }
}

main(); 