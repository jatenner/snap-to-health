#!/usr/bin/env node
const dotenv = require('dotenv');
const { OpenAI } = require('openai');
const path = require('path');
const fs = require('fs');

// Load environment variables
dotenv.config({ path: '.env.local' });

// Define colors for better console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m'
};

// Main function
async function checkOpenAIKey() {
  console.log(`${colors.blue}${colors.bold}OpenAI API Key Verification${colors.reset}\n`);
  
  // Get OpenAI API key from environment
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.log(`${colors.red}❌ No OpenAI API key found in environment variables!${colors.reset}`);
    console.log(`Make sure you have the OPENAI_API_KEY set in .env.local file.`);
    return false;
  }
  
  // Basic format check
  console.log(`API Key format check:`);
  const isProjKey = apiKey.startsWith('sk-proj-');
  const isOrgKey = apiKey.startsWith('sk-org-');
  const isStandardKey = apiKey.startsWith('sk-') && !isProjKey && !isOrgKey;
  const keyLength = apiKey.length;
  
  if (isProjKey) {
    console.log(`${colors.green}✓ Project key format detected (sk-proj-...)${colors.reset}`);
  } else if (isOrgKey) {
    console.log(`${colors.green}✓ Organization key format detected (sk-org-...)${colors.reset}`);
  } else if (isStandardKey) {
    console.log(`${colors.green}✓ Standard key format detected (sk-...)${colors.reset}`);
  } else {
    console.log(`${colors.red}❌ Invalid key format! OpenAI API keys should start with "sk-"${colors.reset}`);
    return false;
  }
  
  console.log(`Key length: ${keyLength} characters`);
  
  // Test OpenAI API key
  console.log(`\n${colors.blue}Testing OpenAI API connectivity:${colors.reset}`);
  
  try {
    const openai = new OpenAI({ apiKey });
    
    // Test list models endpoint
    console.log(`- Attempting to list available models...`);
    const modelsResponse = await openai.models.list();
    
    if (modelsResponse.data && modelsResponse.data.length > 0) {
      console.log(`${colors.green}✓ Successfully connected to OpenAI API and listed ${modelsResponse.data.length} models${colors.reset}`);
      
      // Check for GPT-4o availability
      const gpt4o = modelsResponse.data.find(model => model.id === 'gpt-4o');
      if (gpt4o) {
        console.log(`${colors.green}✓ GPT-4o model is available${colors.reset}`);
      } else {
        console.log(`${colors.yellow}⚠️ GPT-4o model not found. Your application may need to use a different model.${colors.reset}`);
      }
      
      // Make a simple chat completion request
      console.log(`\n- Testing chat completion with GPT-3.5-turbo...`);
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Say 'OpenAI API is working!'" }
        ],
        max_tokens: 20
      });
      
      console.log(`${colors.green}✓ Chat completion successful!${colors.reset}`);
      console.log(`Response: "${completion.choices[0].message.content}"`);
      
      console.log(`\n${colors.green}${colors.bold}✓ OpenAI API key is valid and working correctly!${colors.reset}`);
      return true;
    } else {
      console.log(`${colors.yellow}⚠️ Connected to API but no models were returned.${colors.reset}`);
      return false;
    }
  } catch (error) {
    console.log(`${colors.red}❌ API test failed: ${error.message}${colors.reset}`);
    
    if (error.status === 401) {
      console.log(`${colors.red}❌ Authentication failed. Your API key is invalid or expired.${colors.reset}`);
    } else if (error.status === 403) {
      console.log(`${colors.red}❌ Forbidden. Your API key doesn't have permission to use the requested resource.${colors.reset}`);
    } else if (error.status === 429) {
      console.log(`${colors.red}❌ Rate limit exceeded. Your account has hit rate limits.${colors.reset}`);
    }
    
    return false;
  }
}

// Run the verification
checkOpenAIKey()
  .then(isValid => {
    if (!isValid) {
      console.log(`\n${colors.yellow}RECOMMENDATION: Update your OpenAI API key in .env.local and sync to Vercel${colors.reset}`);
      process.exit(1);
    }
  })
  .catch(error => {
    console.error(`${colors.red}Unexpected error:${colors.reset}`, error);
    process.exit(1);
  }); 