#!/usr/bin/env node

/**
 * Script to update Vercel environment variables
 * Run this script to output commands for updating Vercel environment variables
 */

// Load environment variables
require('dotenv').config({ path: '.env.local' });

console.log('Vercel Environment Variables Update Commands');
console.log('===========================================');
console.log('Run these commands to update your production environment:');
console.log('\n');

// OpenAI API Key
const openaiKey = process.env.OPENAI_API_KEY;
if (openaiKey) {
  console.log(`vercel env add OPENAI_API_KEY production`);
  console.log(`# Use this value: ${openaiKey}`);
  console.log('\n');
}

// Nutritionix API credentials
const nutritionixAppId = process.env.NUTRITIONIX_APP_ID;
const nutritionixApiKey = process.env.NUTRITIONIX_API_KEY;

if (nutritionixAppId) {
  console.log(`vercel env add NUTRITIONIX_APP_ID production`);
  console.log(`# Use this value: ${nutritionixAppId}`);
  console.log('\n');
}

if (nutritionixApiKey) {
  console.log(`vercel env add NUTRITIONIX_API_KEY production`);
  console.log(`# Use this value: ${nutritionixApiKey}`);
  console.log('\n');
}

// Firebase environment variables
const firebasePrivateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
const firebaseClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const firebaseClientId = process.env.FIREBASE_CLIENT_ID;

if (firebasePrivateKeyBase64) {
  console.log(`vercel env add FIREBASE_PRIVATE_KEY_BASE64 production`);
  console.log(`# Use this value (note: it's very long):`);
  console.log(`${firebasePrivateKeyBase64}`);
  console.log('\n');
}

if (firebaseClientEmail) {
  console.log(`vercel env add FIREBASE_CLIENT_EMAIL production`);
  console.log(`# Use this value: ${firebaseClientEmail}`);
  console.log('\n');
}

if (firebaseClientId) {
  console.log(`vercel env add FIREBASE_CLIENT_ID production`);
  console.log(`# Use this value: ${firebaseClientId}`);
  console.log('\n');
}

// OCR Configuration
console.log(`vercel env add USE_OCR_EXTRACTION production`);
console.log(`# Use this value: true`);
console.log('\n');

console.log(`vercel env add OCR_CONFIDENCE_THRESHOLD production`);
console.log(`# Use this value: 0.7`);
console.log('\n');

// API Timeout
console.log(`vercel env add OPENAI_TIMEOUT_MS production`);
console.log(`# Use this value: 30000`);
console.log('\n');

console.log(`Once you've updated all environment variables, deploy the application:`);
console.log(`vercel --prod`); 