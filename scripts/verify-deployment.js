#!/usr/bin/env node
const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

/**
 * Verify Deployment - Comprehensive API and Integration Test
 * 
 * This script runs a series of tests on a deployed Snap2Health instance:
 * 1. Verifies OpenAI API key configuration
 * 2. Tests GPT-4 Vision integration
 * 
 * Usage:
 *   node scripts/verify-deployment.js [deployment-url]
 * 
 * If no deployment URL is provided, it defaults to https://snap2health.vercel.app
 */

// Get the deployment URL from environment or use a default
// Use the most recent deployment
const DEPLOYMENT_URL = 'snap-to-health-2qk1uthgt-jonah-tenner-s-projects.vercel.app';
const DEPLOYMENT_URL_WITH_PROTOCOL = DEPLOYMENT_URL.startsWith('http') ? DEPLOYMENT_URL : `https://${DEPLOYMENT_URL}`;

console.log(`🔍 Verifying deployment on: ${DEPLOYMENT_URL_WITH_PROTOCOL}`);

// Parse URL to get hostname and path
function parseUrl(url) {
  const match = url.match(/^https?:\/\/([^\/]+)(\/.*)?$/);
  if (!match) {
    throw new Error(`Invalid URL: ${url}`);
  }
  return {
    hostname: match[1],
    path: match[2] || '/',
  };
}

// Check if the site is up and running
function checkSiteStatus() {
  return new Promise((resolve, reject) => {
    const parsedUrl = parseUrl(DEPLOYMENT_URL_WITH_PROTOCOL);
    
    const options = {
      hostname: parsedUrl.hostname,
      path: '/api/test-validator',
      method: 'GET',
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`Site status code: ${res.statusCode}`);
        if (res.statusCode === 200) {
          console.log('✅ Site is up and running');
          console.log('Response:', data);
          resolve(true);
        } else {
          console.log(`❌ Site returned status code: ${res.statusCode}`);
          console.log('Response:', data);
          resolve(false);
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Error checking site status:', error.message);
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      console.error('❌ Request timed out');
      resolve(false);
    });

    req.end();
  });
}

// Test the OpenAI API key
function testOpenAIKey() {
  return new Promise((resolve, reject) => {
    const parsedUrl = parseUrl(DEPLOYMENT_URL_WITH_PROTOCOL);
    
    const options = {
      hostname: parsedUrl.hostname,
      path: '/api/ping-openai',
      method: 'GET',
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.ok) {
            console.log('✅ OpenAI API key is working correctly');
            resolve(true);
          } else {
            console.log('❌ OpenAI API key error:', response.error);
            resolve(false);
          }
        } catch (error) {
          console.error('❌ Error parsing response:', error.message);
          resolve(false);
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Error testing OpenAI key:', error.message);
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      console.error('❌ Request timed out');
      resolve(false);
    });

    req.end();
  });
}

// Test the test-vision endpoint
function testVisionEndpoint() {
  return new Promise((resolve, reject) => {
    const parsedUrl = parseUrl(DEPLOYMENT_URL_WITH_PROTOCOL);
    
    const options = {
      hostname: parsedUrl.hostname,
      path: '/api/test-vision',
      method: 'GET',
      timeout: 15000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          console.log('Test vision endpoint response status:', res.statusCode);
          if (res.statusCode === 200) {
            console.log('✅ Test vision endpoint is working');
            resolve(true);
          } else {
            console.log('❌ Test vision endpoint error:', data);
            resolve(false);
          }
        } catch (error) {
          console.error('❌ Error testing vision endpoint:', error.message);
          resolve(false);
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ Error testing vision endpoint:', error.message);
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      console.error('❌ Request timed out');
      resolve(false);
    });

    req.end();
  });
}

// Run all verification checks
async function verifyDeployment() {
  console.log('🚀 Starting deployment verification...');
  
  const siteStatus = await checkSiteStatus();
  if (!siteStatus) {
    console.log('⚠️ Site is not responding. Deployment may still be in progress.');
    return;
  }
  
  const openAIStatus = await testOpenAIKey();
  const visionStatus = await testVisionEndpoint();
  
  console.log('\n🔍 Verification summary:');
  console.log(`Site status: ${siteStatus ? '✅ Working' : '❌ Not working'}`);
  console.log(`OpenAI API: ${openAIStatus ? '✅ Working' : '❌ Not working'}`);
  console.log(`Vision endpoint: ${visionStatus ? '✅ Working' : '❌ Not working'}`);
  
  if (siteStatus && openAIStatus && visionStatus) {
    console.log('\n🎉 Deployment verification successful! All systems are operational.');
  } else {
    console.log('\n⚠️ Some verification checks failed. Please check the logs for details.');
  }
}

// Run the verification
verifyDeployment(); 