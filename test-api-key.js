#!/usr/bin/env node

// Simple script to test the OpenAI API key
require('dotenv').config();
const OpenAI = require('openai');

// Use API key from environment
const apiKey = process.env.OPENAI_API_KEY;

// Simple colored output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

async function testKey() {
  console.log(`${colors.blue}Testing OpenAI API Key...${colors.reset}`);
  
  if (!apiKey) {
    console.log(`${colors.red}✗ ERROR: No API key found in environment variables${colors.reset}`);
    console.log(`Run this script with: node -r dotenv/config test-api-key.js`);
    return false;
  }
  
  console.log(`API Key: ${apiKey.substring(0, 12)}...${apiKey.substring(apiKey.length - 4)}`);
  
  try {
    const openai = new OpenAI({ apiKey });
    console.log(`${colors.green}✓ Initialized OpenAI client${colors.reset}`);
    
    console.log(`${colors.blue}Attempting to list models...${colors.reset}`);
    const modelList = await openai.models.list();
    
    console.log(`${colors.green}✓ Successfully connected to OpenAI API${colors.reset}`);
    console.log(`Found ${modelList.data.length} models`);
    
    // Check for specific vision models
    const visionModels = modelList.data.filter(model => 
      model.id.includes('vision') || model.id.includes('gpt-4o')
    );
    
    if (visionModels.length > 0) {
      console.log(`${colors.green}✓ Found vision-capable models:${colors.reset}`);
      visionModels.forEach(model => {
        console.log(`  - ${model.id}`);
      });
    } else {
      console.log(`${colors.yellow}⚠ No vision models found in your account${colors.reset}`);
    }
    
    return true;
  } catch (error) {
    console.log(`${colors.red}✗ Error: ${error.message}${colors.reset}`);
    
    if (error.status === 401) {
      console.log(`${colors.red}✗ Authentication failed. Your API key is invalid.${colors.reset}`);
    } else {
      console.log(`${colors.red}✗ Other error. Status: ${error.status || 'unknown'}${colors.reset}`);
    }
    
    return false;
  }
}

testKey().then(success => {
  if (!success) {
    process.exit(1);
  }
}); 