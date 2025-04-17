#!/usr/bin/env node

const https = require('https');
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

console.log(`${colors.cyan}${colors.bold}⚡ Production OpenAI API Verification ⚡${colors.reset}`);
console.log(`${colors.cyan}===========================================${colors.reset}\n`);

// Use the deployed endpoint URL 
const apiUrl = process.argv[2] || 'https://snap-to-health.vercel.app/api/test-openai';

console.log(`${colors.blue}Checking OpenAI API key at:${colors.reset} ${apiUrl}\n`);

const req = https.get(apiUrl, (res) => {
  let data = '';
  
  console.log(`${colors.blue}HTTP Status:${colors.reset} ${res.statusCode} ${res.statusMessage || ''}\n`);
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      
      if (response.status === 'success') {
        console.log(`${colors.green}${colors.bold}✅ SUCCESS!${colors.reset} ${colors.green}The OpenAI API key is working in production.${colors.reset}\n`);
        console.log(`${colors.blue}API Key:${colors.reset} ${response.keyMasked || 'not provided'}`);
        
        if (response.openAiResponse) {
          console.log(`${colors.blue}GPT Response:${colors.reset} "${response.openAiResponse.choices[0]?.message?.content || 'No content'}"`);
          console.log(`${colors.blue}Model:${colors.reset} ${response.openAiResponse.model}`);
        }
        
        process.exit(0);
      } else {
        console.error(`${colors.red}${colors.bold}❌ ERROR:${colors.reset} ${colors.red}The API check failed with status: ${response.status}${colors.reset}`);
        console.error(`${colors.red}Message:${colors.reset} ${response.error || response.message || 'Unknown error'}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`${colors.red}${colors.bold}❌ ERROR:${colors.reset} ${colors.red}Failed to parse API response: ${error.message}${colors.reset}`);
      console.error(`${colors.red}Raw response:${colors.reset} ${data.substring(0, 200)}...`);
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.error(`${colors.red}${colors.bold}❌ NETWORK ERROR:${colors.reset} ${colors.red}${error.message}${colors.reset}`);
  console.error(`${colors.yellow}This could be due to:${colors.reset}
1. The production site is not deployed yet
2. The URL is incorrect
3. Network connectivity issues
4. The server is down`);
  process.exit(1);
});

// Set a timeout
req.setTimeout(15000, () => {
  console.error(`${colors.red}${colors.bold}❌ TIMEOUT:${colors.reset} ${colors.red}Request timed out after 15 seconds${colors.reset}`);
  req.destroy();
  process.exit(1);
}); 