#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Create a readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Path to .env.local file
const envPath = path.resolve(process.cwd(), '.env.local');

// Function to prompt user for input
const prompt = (question) => {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
};

// Function to read existing .env.local file
const readEnvFile = () => {
  if (fs.existsSync(envPath)) {
    return fs.readFileSync(envPath, 'utf8');
  }
  return '';
};

// Function to update .env.local with new values
const updateEnvFile = (content, updates) => {
  let lines = content.split('\n');
  
  // Update existing keys or add new ones
  for (const [key, value] of Object.entries(updates)) {
    const index = lines.findIndex(line => line.startsWith(`${key}=`));
    
    if (index !== -1) {
      lines[index] = `${key}=${value}`;
    } else {
      // If the key doesn't exist, add it
      lines.push(`${key}=${value}`);
    }
  }
  
  return lines.join('\n');
};

// Main function
const main = async () => {
  console.log('🔧 OpenAI API Key Setup\n');
  
  try {
    // Read existing .env.local
    let envContent = readEnvFile();
    if (!envContent) {
      console.log('⚠️ No .env.local file found. Creating a new one.');
      envContent = '';
    } else {
      console.log('✅ Found existing .env.local file.');
    }
    
    console.log('\nOpenAI API Key is required for image analysis and other AI features.');
    console.log('You can get an API key from: https://platform.openai.com/api-keys\n');
    
    // Get API key from user
    const apiKey = await prompt('Enter your OpenAI API key (starts with "sk-"): ');
    
    if (!apiKey) {
      console.log('❌ No API key provided. Operation cancelled.');
      rl.close();
      return;
    }
    
    if (!apiKey.startsWith('sk-')) {
      console.warn('⚠️ Warning: OpenAI API keys typically start with "sk-".');
      const proceed = await prompt('Do you want to proceed anyway? (y/n): ');
      if (proceed.toLowerCase() !== 'y') {
        console.log('Operation cancelled.');
        rl.close();
        return;
      }
    }
    
    // Update .env.local file
    const updates = {
      'OPENAI_API_KEY': apiKey
    };
    
    const updatedContent = updateEnvFile(envContent, updates);
    fs.writeFileSync(envPath, updatedContent);
    
    console.log('\n✅ OpenAI API key has been successfully updated in .env.local!');
    
    console.log('\nTo verify your configuration, run:');
    console.log('npm run verify-firebase');
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  } finally {
    rl.close();
  }
};

// Run the main function
main(); 