#!/usr/bin/env node

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') });
const https = require('https');

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bold: '\x1b[1m'
};

console.log(`${colors.cyan}${colors.bold}OpenAI API Key Verification Tool${colors.reset}`);
console.log(`${colors.cyan}==============================${colors.reset}\n`);

// Get the API key from environment variables
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error(`${colors.red}${colors.bold}Error:${colors.reset} ${colors.red}OPENAI_API_KEY environment variable is not set.${colors.reset}`);
  console.log(`\nPlease set the OPENAI_API_KEY environment variable by:
1. Adding it to your .env file
2. Setting it in your shell environment
3. Adding it to your Vercel project environment variables\n`);
  process.exit(1);
}

// Basic validation of the API key format
if (!apiKey.startsWith('sk-')) {
  console.warn(`${colors.yellow}${colors.bold}Warning:${colors.reset} ${colors.yellow}The API key doesn't start with 'sk-', which is unusual for OpenAI API keys.${colors.reset}`);
}

console.log(`${colors.blue}Found API key:${colors.reset} ${apiKey.substring(0, 7)}...${apiKey.substring(apiKey.length - 4)}`);
console.log(`${colors.blue}Key length:${colors.reset} ${apiKey.length} characters\n`);
console.log(`${colors.blue}Testing connection to OpenAI API...${colors.reset}`);

// Prepare the request data
const data = JSON.stringify({
  model: 'gpt-3.5-turbo',
  messages: [{ role: 'user', content: 'Hello, this is a test request. Please respond with "OpenAI key is working".' }],
  max_tokens: 15
});

// API request options
const options = {
  hostname: 'api.openai.com',
  port: 443,
  path: '/v1/chat/completions',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
    'Content-Length': data.length
  }
};

// Make the request to the OpenAI API
const req = https.request(options, (res) => {
  let responseData = '';
  
  // Set a timeout for the request
  const timeout = setTimeout(() => {
    console.error(`${colors.red}Request timed out after 15 seconds.${colors.reset}`);
    process.exit(1);
  }, 15000);
  
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  
  res.on('end', () => {
    clearTimeout(timeout);
    
    console.log(`${colors.blue}HTTP Status:${colors.reset} ${res.statusCode} ${res.statusMessage || ''}\n`);
    
    if (res.statusCode === 200) {
      try {
        const parsedData = JSON.parse(responseData);
        const content = parsedData.choices[0]?.message?.content || 'No content';
        
        console.log(`${colors.green}${colors.bold}Success!${colors.reset} ${colors.green}The OpenAI API key is working correctly.${colors.reset}`);
        console.log(`${colors.blue}Response:${colors.reset} "${content.trim()}"\n`);
        console.log(`${colors.blue}Model:${colors.reset} ${parsedData.model}`);
        console.log(`${colors.blue}Usage:${colors.reset} ${JSON.stringify(parsedData.usage)}\n`);
        process.exit(0);
      } catch (error) {
        console.error(`${colors.red}${colors.bold}Error:${colors.reset} ${colors.red}Failed to parse API response: ${error.message}${colors.reset}`);
        process.exit(1);
      }
    } else {
      try {
        const parsedError = JSON.parse(responseData);
        console.error(`${colors.red}${colors.bold}API Error:${colors.reset} ${colors.red}${parsedError.error?.message || 'Unknown error'}${colors.reset}`);
        
        // Provide specific guidance based on error type
        if (res.statusCode === 401) {
          console.log(`\n${colors.yellow}This appears to be an authentication issue. Please check that:${colors.reset}
1. Your API key is correct and not expired
2. You have billing set up in your OpenAI account
3. The key has not been revoked\n`);
        } else if (res.statusCode === 429) {
          console.log(`\n${colors.yellow}This appears to be a rate limit issue. Please:${colors.reset}
1. Check your usage and limits in the OpenAI dashboard
2. Wait a minute and try again
3. Consider upgrading your account if you're hitting limits frequently\n`);
        }
        
        process.exit(1);
      } catch (error) {
        console.error(`${colors.red}${colors.bold}Error:${colors.reset} ${colors.red}Failed to parse error response: ${error.message}${colors.reset}`);
        console.error(`${colors.red}Raw response:${colors.reset} ${responseData}`);
        process.exit(1);
      }
    }
  });
});

req.on('error', (error) => {
  console.error(`${colors.red}${colors.bold}Network Error:${colors.reset} ${colors.red}${error.message}${colors.reset}`);
  process.exit(1);
});

// Send the request
req.write(data);
req.end(); 