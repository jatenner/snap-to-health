#!/usr/bin/env node

/**
 * This script tests the OpenAI API key without using Next.js.
 * It reads the API key from .env.local and makes a direct call to OpenAI API.
 * 
 * Run with: npm run test-api-key
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Function to extract variables from .env file
function parseEnvFile(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const variables = {};
    
    fileContent.split('\n').forEach(line => {
      // Skip comments and empty lines
      if (!line || line.startsWith('#')) return;
      
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        variables[key] = value;
      }
    });
    
    return variables;
  } catch (error) {
    console.error(`Error reading .env file: ${error.message}`);
    return {};
  }
}

// Function to make a request to OpenAI API
function testOpenAIAPI(apiKey) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: "Respond with 'OK' if you can read this message."
        }
      ],
      max_tokens: 10,
      temperature: 0
    });
    
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
    
    const req = https.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonResponse = JSON.parse(responseData);
          resolve({
            status: res.statusCode,
            response: jsonResponse
          });
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error.message}, Response: ${responseData}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.write(data);
    req.end();
  });
}

// Main function
async function main() {
  console.log('🔍 Testing OpenAI API key...');
  
  try {
    // Read variables from .env.local
    const envPath = path.resolve(process.cwd(), '.env.local');
    const envVars = parseEnvFile(envPath);
    
    // Check if OpenAI API key exists
    if (!envVars.OPENAI_API_KEY) {
      console.error('❌ OpenAI API key not found in .env.local');
      process.exit(1);
    }
    
    const apiKey = envVars.OPENAI_API_KEY;
    console.log(`✅ Found OpenAI API key in .env.local - length: ${apiKey.length} chars`);
    console.log(`🔑 Key starts with: ${apiKey.substring(0, 7)}...`);
    
    console.log('🔄 Testing API key with OpenAI API...');
    const testResult = await testOpenAIAPI(apiKey);
    
    if (testResult.status === 200) {
      console.log('✅ API key is valid!');
      console.log(`📝 Response from GPT-4o: ${testResult.response.choices[0]?.message?.content || 'No content'}`);
      
      // Log model information
      if (testResult.response.model) {
        console.log(`🤖 Model used: ${testResult.response.model}`);
      }
      
      console.log('✅ Test completed successfully.');
    } else {
      console.error('❌ API key test failed!');
      console.error(`🔴 Status code: ${testResult.status}`);
      console.error(`🔴 Error: ${JSON.stringify(testResult.response)}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Error testing API key: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
main(); 