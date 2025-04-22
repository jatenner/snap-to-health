#!/usr/bin/env node

/**
 * This script verifies the environment variables in a deployed application
 * by calling the /api/test-env endpoint.
 * 
 * Usage:
 *   node scripts/verify-environment-vars.js [url]
 * 
 * Parameters:
 *   url - Optional URL to check. Defaults to 'https://snap-to-health.vercel.app'
 * 
 * Example:
 *   node scripts/verify-environment-vars.js
 *   node scripts/verify-environment-vars.js https://dev-branch.vercel.app
 */

const https = require('https');
const url = require('url');

// Default URL if none provided
const DEFAULT_URL = 'https://snap-to-health.vercel.app';

// Get the URL from command-line arguments, falling back to default
const targetUrl = process.argv[2] || DEFAULT_URL;
const apiUrl = `${targetUrl}/api/test-env`;

console.log(`🔍 Verifying environment variables at: ${apiUrl}`);

// Parse URL to get hostname for headers
const parsedUrl = url.parse(apiUrl);

// Make the HTTP request
const req = https.get(
  apiUrl,
  {
    headers: {
      'Host': parsedUrl.hostname,
      'User-Agent': 'Environment-Var-Verifier/1.0',
    },
  },
  (res) => {
    const { statusCode } = res;
    const contentType = res.headers['content-type'];

    let error;
    if (statusCode !== 200) {
      error = new Error(`Request Failed. Status Code: ${statusCode}`);
    } else if (!/^application\/json/.test(contentType)) {
      error = new Error(`Invalid content-type. Expected application/json but received ${contentType}`);
    }

    if (error) {
      console.error(error.message);
      // Consume response data to free up memory
      res.resume();
      process.exit(1);
      return;
    }

    res.setEncoding('utf8');
    let rawData = '';
    res.on('data', (chunk) => { rawData += chunk; });
    res.on('end', () => {
      try {
        const data = JSON.parse(rawData);
        console.log('\n✅ Environment verification complete:');
        
        // Display OpenAI API key information
        console.log('\n📋 OpenAI API Keys:');
        console.log(`   Server API Key: ${data.openaiApiKey.server} (Valid: ${data.openaiApiKey.serverValid ? '✓' : '✗'})`);
        console.log(`   Public API Key: ${data.openaiApiKey.public} (Valid: ${data.openaiApiKey.publicValid ? '✓' : '✗'})`);
        console.log(`   Keys Match: ${data.openaiApiKey.keysMatch ? '✓' : '✗'}`);
        
        // Display environment
        console.log(`\n🌐 Environment: ${data.environment}`);
        console.log(`   Vercel Deployment: ${data.isVercel ? '✓' : '✗'}`);
        console.log(`   Deployment URL: ${data.deploymentUrl}`);
        
        // Display environment variables
        console.log('\n⚙️  Environment Variables:');
        Object.entries(data.envVariables).forEach(([key, value]) => {
          const icon = typeof value === 'boolean' ? (value ? '✓' : '✗') : '📄';
          console.log(`   ${icon} ${key}: ${value}`);
        });
        
        // Meta information
        console.log(`\n🆔 Request ID: ${data.requestId}`);
        console.log(`⏱️  Timestamp: ${data.timestamp}`);
        
        // Check for critical issues
        const criticalIssues = [];
        
        if (!data.openaiApiKey.serverValid) {
          criticalIssues.push('❌ SERVER OpenAI API key is invalid or missing');
        }
        
        if (!data.envVariables.FIREBASE_PROJECT_ID) {
          criticalIssues.push('❌ Firebase Project ID is missing');
        }
        
        if (!data.envVariables.FIREBASE_PRIVATE_KEY_SET && !data.envVariables.FIREBASE_PRIVATE_KEY_B64_SET) {
          criticalIssues.push('❌ Both Firebase Private Key formats are missing');
        }
        
        if (!data.envVariables.NUTRITIONIX_API_ID_SET || !data.envVariables.NUTRITIONIX_API_KEY_SET) {
          criticalIssues.push('❌ Nutritionix API credentials are missing');
        }
        
        if (criticalIssues.length > 0) {
          console.log('\n⚠️ CRITICAL ISSUES DETECTED:');
          criticalIssues.forEach(issue => console.log(issue));
          process.exit(1);
        } else {
          console.log('\n✅ All critical environment variables appear to be set!');
          process.exit(0);
        }
      } catch (e) {
        console.error('Error parsing JSON response:', e.message);
        process.exit(1);
      }
    });
  }
).on('error', (e) => {
  console.error(`HTTP Request Error: ${e.message}`);
  process.exit(1);
});

req.end(); 