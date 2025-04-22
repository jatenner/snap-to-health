#!/usr/bin/env node

/**
 * Verify OpenAI API Key in Deployed Environment
 * 
 * This script makes a request to the deployed application's
 * /api/update-env-vars endpoint to verify that the OpenAI API key
 * is properly set and working in the deployed environment.
 * 
 * Usage:
 *   node scripts/verify-deployed-api-key.js [deployment-url]
 * 
 * If no deployment URL is provided, it defaults to https://snap2health.vercel.app
 */

const https = require('https');
const url = require('url');

// Get deployment URL from command line argument or use default
const deploymentUrl = process.argv[2] || 'https://snap2health.vercel.app';
const apiPath = '/api/update-env-vars';

console.log(`\n🔍 Verifying OpenAI API key on: ${deploymentUrl}\n`);

// Parse the URL to get hostname and path
const parsedUrl = url.parse(`${deploymentUrl}${apiPath}`);

const options = {
  hostname: parsedUrl.hostname,
  path: parsedUrl.path,
  method: 'GET',
  headers: {
    'Accept': 'application/json'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      
      if (response.success) {
        console.log('✅ OpenAI API key verification SUCCESSFUL!');
        console.log(`\nAPI Key Information:`);
        console.log(`- Key Format: ${response.apiKeyStart}...${response.apiKeyEnd}`);
        console.log(`- Key Length: ${response.apiKeyLength} characters`);
        
        console.log(`\nAvailable Models:`);
        response.models.forEach(model => {
          console.log(`- ${model}`);
        });
        
        console.log(`\nTest Response: "${response.modelResponse}"`);
        
        console.log(`\nEnvironment Variables:`);
        Object.entries(response.envVars).forEach(([key, value]) => {
          console.log(`- ${key}: ${value}`);
        });
      } else {
        console.error('❌ API key verification FAILED!');
        console.error(`Error: ${response.error}`);
        if (response.apiKeyLength !== undefined) {
          console.error(`API key length: ${response.apiKeyLength} characters`);
        }
        if (response.errorType) {
          console.error(`Error type: ${response.errorType}`);
        }
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Failed to parse response:', error);
      console.error('Raw response:', data);
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request failed:', error.message);
  process.exit(1);
});

req.end();

console.log('Sending request to verify API key...'); 