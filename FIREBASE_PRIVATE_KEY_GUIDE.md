# Firebase Private Key Troubleshooting Guide

This guide will help you fix common issues with Firebase private keys, especially when deploying to different environments like Vercel, Netlify, or other platforms.

## The Problem

Firebase Admin SDK requires a properly formatted private key in PEM format with actual newlines. However, environment variables typically don't support multi-line values, so there are several ways to handle this:

## Diagnostic Steps

Run the diagnostic script to test your private key configuration:

```bash
node src/scripts/testPrivateKey.js
```

## Common Solutions

### 1. For Local Development (.env.local file)

Use escaped newlines in your `.env.local` file:

```
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIB...\n...\n-----END PRIVATE KEY-----"
```

### 2. For Vercel Deployment

Vercel provides a specific UI option for multi-line environment variables:

1. Go to your project in the Vercel dashboard
2. Navigate to Settings > Environment Variables
3. Add `FIREBASE_PRIVATE_KEY` and click "Make multi-line"
4. Paste the raw key with actual newlines (copy directly from your service account JSON file)

### 3. For Other Deployment Platforms (Netlify, etc.)

Use escaped newlines in a single line string:

```
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIB...\n...\n-----END PRIVATE KEY-----"
```

### 4. Using Base64 Encoding (Most Reliable)

This approach works across all platforms:

1. Base64 encode your private key:
   ```bash
   # In your terminal, with the key in a file named private-key.txt:
   base64 -i private-key.txt
   ```

2. Add the encoded value to your environment:
   ```
   FIREBASE_PRIVATE_KEY_BASE64="LS0tLS1CRUdJTiBQUk..."
   ```

3. In your code, decode it:
   ```typescript
   // In firebaseAdmin.ts
   const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
   let privateKey = '';
   
   if (privateKeyBase64) {
     privateKey = Buffer.from(privateKeyBase64, 'base64').toString();
   } else {
     privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
   }
   ```

## Checking Your Private Key Format

A correct PEM-formatted private key should:

1. Start with `-----BEGIN PRIVATE KEY-----`
2. End with `-----END PRIVATE KEY-----`
3. Have actual newlines (`\n`) between the sections
4. Be approximately 1700 characters in length

## Updated Implementation

The latest version of the `firebaseAdmin.ts` file has been updated with improved handling:

1. Multiple parsing methods including:
   - Direct replacement of `\\n` with `\n`
   - JSON.parse method for handling escaped characters
   - Base64 decoding if the key is encoded
   
2. Better error reporting and diagnostics

If you're still having issues, run the diagnostic script and check the console for detailed information. 