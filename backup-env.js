#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Path to .env.local file
const envPath = path.resolve(process.cwd(), '.env.local');
const now = new Date();
const timestamp = now.toISOString().replace(/:/g, '-').replace(/\./g, '-');
const backupPath = path.resolve(process.cwd(), `.env.backup.${timestamp}`);

console.log('🔄 Backing up environment variables...\n');

if (!fs.existsSync(envPath)) {
  console.error(`❌ No .env.local file found at ${envPath}`);
  process.exit(1);
}

try {
  // Read the current .env.local file
  const envContent = fs.readFileSync(envPath, 'utf8');
  
  // Create a backup
  fs.writeFileSync(backupPath, envContent);
  
  console.log(`✅ Environment backup created successfully!`);
  console.log(`Backup saved to: ${backupPath}`);
  
  // Count the number of variables
  const variableCount = envContent
    .split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .length;
  
  console.log(`\nBacked up ${variableCount} environment variables.`);
  console.log(`\nTo restore this backup, run:`);
  console.log(`cp "${backupPath}" "${envPath}"`);
} catch (error) {
  console.error(`❌ Error creating backup: ${error.message}`);
  process.exit(1);
} 