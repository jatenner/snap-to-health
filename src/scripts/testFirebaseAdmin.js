#!/usr/bin/env node
/**
 * This script tests Firebase Admin initialization
 * Run with: node testFirebaseAdmin.js
 * 
 * Make sure you have the .env.local file with the proper Firebase variables:
 * - NEXT_PUBLIC_FIREBASE_PROJECT_ID
 * - FIREBASE_CLIENT_EMAIL
 * - FIREBASE_PRIVATE_KEY_BASE64
 */

// Load environment variables
require('dotenv').config({ path: '.env.local' });

// Check if required environment variables are available
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;

console.log("=== ENVIRONMENT VARIABLES CHECK ===");
console.log(`Project ID: ${projectId ? "✅ Present" : "❌ Missing"}`);
console.log(`Client Email: ${clientEmail ? "✅ Present" : "❌ Missing"}`);
console.log(`Private Key Base64: ${privateKeyBase64 ? "✅ Present" : "❌ Missing"}`);

if (!projectId || !clientEmail || !privateKeyBase64) {
  console.error('\n❌ Missing required environment variables. Please check your .env.local file.');
  process.exit(1);
}

// Decode the base64 encoded private key
let decodedPrivateKey;
try {
  decodedPrivateKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
  
  // Basic validation of the decoded key format
  if (!decodedPrivateKey.includes('-----BEGIN PRIVATE KEY-----') || 
      !decodedPrivateKey.includes('-----END PRIVATE KEY-----') || 
      !decodedPrivateKey.includes('\n')) {
    throw new Error('Decoded private key is not in valid PEM format');
  }
  
  console.log('\n=== PRIVATE KEY DECODING ===');
  console.log('✅ Successfully decoded base64 private key');
  console.log(`PEM format check: ${decodedPrivateKey.includes('-----BEGIN PRIVATE KEY-----') ? "✅ Valid" : "❌ Invalid"}`);
  console.log(`Newlines: ${decodedPrivateKey.includes('\n') ? "✅ Present" : "❌ Missing"}`);
  console.log(`Number of newlines: ${(decodedPrivateKey.match(/\n/g) || []).length}`);
  
} catch (error) {
  console.error(`\n❌ Failed to decode Firebase private key from base64: ${error.message}`);
  process.exit(1);
}

// Initialize Firebase Admin
try {
  console.log('\n=== FIREBASE ADMIN INITIALIZATION ===');
  
  const { initializeApp, cert } = require('firebase-admin/app');
  const { getFirestore } = require('firebase-admin/firestore');
  
  // Initialize the app
  const app = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: decodedPrivateKey,
    })
  });
  
  // Try to get a Firestore instance
  const db = getFirestore();
  
  console.log('✅ Firebase Admin initialized successfully');
  console.log('✅ Firestore instance created');
  
  // Try a simple Firestore operation
  console.log('\n=== TESTING FIRESTORE CONNECTION ===');
  console.log('Attempting to access a test collection...');
  
  db.collection('test').get()
    .then(() => {
      console.log('✅ Successfully connected to Firestore');
      process.exit(0);
    })
    .catch(error => {
      console.error(`❌ Error connecting to Firestore: ${error.message}`);
      process.exit(1);
    });
  
} catch (error) {
  console.error(`\n❌ Firebase Admin initialization error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
} 