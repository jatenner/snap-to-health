#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

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

// Main validation function
async function validateOpenAIKey() {
  console.log(`${COLORS.cyan}${COLORS.bright}===== OPENAI API KEY VALIDATION =====${COLORS.reset}\n`);
  
  // Get the API key from environment
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.log(`${COLORS.red}ERROR: OPENAI_API_KEY is missing from .env.local file${COLORS.reset}`);
    return false;
  }
  
  console.log(`${COLORS.cyan}API Key format check:${COLORS.reset}`);
  
  // Extract key type and format info (without exposing the key)
  const keyType = apiKey.startsWith('sk-org-') 
    ? 'Organization' 
    : apiKey.startsWith('sk-proj-') 
      ? 'Project'
      : apiKey.startsWith('sk-') 
        ? 'Standard' 
        : 'Unknown';
        
  const keyLength = apiKey.length;
  const keyPrefix = apiKey.substring(0, 7) + '...';
  const validFormat = /^sk-(org|proj)?-[A-Za-z0-9]{24,}$/.test(apiKey);
  
  console.log(`- Type: ${keyType}`);
  console.log(`- Length: ${keyLength}`);
  console.log(`- Prefix: ${keyPrefix}`);
  console.log(`- Valid format: ${validFormat ? 'Yes' : 'No'}`);
  
  if (!validFormat) {
    console.log(`${COLORS.red}ERROR: API key format is invalid${COLORS.reset}`);
    return false;
  }
  
  // Try to initialize the OpenAI client
  console.log(`\n${COLORS.cyan}Attempting to initialize OpenAI client...${COLORS.reset}`);
  let openai;
  try {
    openai = new OpenAI({ apiKey });
    console.log(`${COLORS.green}SUCCESS: OpenAI client initialized${COLORS.reset}`);
  } catch (error) {
    console.log(`${COLORS.red}ERROR: Failed to initialize OpenAI client: ${error.message}${COLORS.reset}`);
    return false;
  }
  
  // Test a simple API call
  console.log(`\n${COLORS.cyan}Testing simple API call...${COLORS.reset}`);
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Say hello" }
      ],
      max_tokens: 5
    });
    
    const content = completion.choices[0]?.message?.content || '';
    console.log(`${COLORS.green}SUCCESS: API call completed successfully${COLORS.reset}`);
    console.log(`Response: "${content}"`);
  } catch (error) {
    console.log(`${COLORS.red}ERROR: API call failed: ${error.message}${COLORS.reset}`);
    return false;
  }
  
  // Check available models
  console.log(`\n${COLORS.cyan}Checking available models...${COLORS.reset}`);
  try {
    const models = await openai.models.list();
    
    // Filter for vision-capable models
    const visionModels = models.data.filter(model => 
      model.id === 'gpt-4o' || 
      model.id === 'gpt-4-vision-preview' ||
      model.id.includes('vision')
    ).map(model => model.id);
    
    if (visionModels.length > 0) {
      console.log(`${COLORS.green}SUCCESS: Found ${visionModels.length} vision-capable models:${COLORS.reset}`);
      visionModels.forEach(model => console.log(`- ${model}`));
      
      if (visionModels.includes('gpt-4o')) {
        console.log(`${COLORS.green}${COLORS.bright}✓ GPT-4o is available for this API key!${COLORS.reset}`);
      } else {
        console.log(`${COLORS.yellow}⚠ GPT-4o is NOT available for this API key${COLORS.reset}`);
      }
    } else {
      console.log(`${COLORS.yellow}⚠ No vision-capable models found for this API key${COLORS.reset}`);
    }
    
    // Show a few other relevant models
    const otherModels = models.data
      .filter(model => model.id.includes('gpt-4') || model.id.includes('gpt-3.5'))
      .slice(0, 5)
      .map(model => model.id);
      
    console.log(`\n${COLORS.cyan}Other available models (sample):${COLORS.reset}`);
    otherModels.forEach(model => console.log(`- ${model}`));
    
  } catch (error) {
    console.log(`${COLORS.yellow}WARNING: Could not list models: ${error.message}${COLORS.reset}`);
    console.log(`This could be due to API permissions or rate limits.`);
  }
  
  console.log(`\n${COLORS.green}${COLORS.bright}API key validation complete!${COLORS.reset}`);
  return true;
}

// Run the validation
validateOpenAIKey().catch(error => {
  console.error(`${COLORS.red}Unexpected error: ${error.message}${COLORS.reset}`);
  process.exit(1);
}); 