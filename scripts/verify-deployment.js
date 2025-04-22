#!/usr/bin/env node

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

const { spawn } = require('child_process');
const path = require('path');

// Get deployment URL from command line argument or use default
const deploymentUrl = process.argv[2] || 'https://snap2health.vercel.app';

console.log(`\n🚀 Running comprehensive verification tests on: ${deploymentUrl}\n`);
console.log('Test suite will verify:');
console.log('1. OpenAI API key configuration');
console.log('2. GPT-4 Vision integration');
console.log('\n=================================================\n');

// Function to run a verification script and return a promise
function runVerification(scriptName) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, scriptName);
    console.log(`Running: ${scriptPath} ${deploymentUrl}\n`);
    
    const child = spawn('node', [scriptPath, deploymentUrl], {
      stdio: 'inherit'
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Script ${scriptName} failed with exit code ${code}`));
      }
    });
    
    child.on('error', (err) => {
      reject(new Error(`Failed to execute script ${scriptName}: ${err.message}`));
    });
  });
}

// Run verification scripts sequentially
async function runVerifications() {
  let hasErrors = false;
  
  try {
    console.log('🔑 TESTING API KEY CONFIGURATION...');
    await runVerification('verify-deployed-api-key.js');
    console.log('\n✅ API Key verification completed successfully!\n');
    console.log('=================================================\n');
  } catch (error) {
    console.error(`\n❌ API Key verification failed: ${error.message}\n`);
    console.log('=================================================\n');
    hasErrors = true;
  }
  
  try {
    console.log('👁️ TESTING GPT-4 VISION INTEGRATION...');
    await runVerification('verify-vision-integration.js');
    console.log('\n✅ Vision integration verification completed successfully!\n');
    console.log('=================================================\n');
  } catch (error) {
    console.error(`\n❌ Vision integration verification failed: ${error.message}\n`);
    console.log('=================================================\n');
    hasErrors = true;
  }
  
  // Final summary
  console.log('\n📋 VERIFICATION SUMMARY:');
  if (hasErrors) {
    console.log('❌ Some verification tests failed. Please check the logs above for details.');
    process.exit(1);
  } else {
    console.log('✅ All verification tests passed successfully!');
    console.log(`🎉 The deployment at ${deploymentUrl} is configured correctly.`);
  }
}

runVerifications().catch(error => {
  console.error(`\n❌ Fatal error: ${error.message}`);
  process.exit(1);
}); 