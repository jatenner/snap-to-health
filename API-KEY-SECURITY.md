# API Key Security Measures

This document outlines the security measures implemented to protect sensitive API keys and credentials in the Snap-to-Health application.

## Overview

The application uses several third-party APIs and services that require sensitive credentials:
- OpenAI API
- Nutritionix API
- Firebase Admin SDK
- Google Vision API
- Vercel deployment tokens

To protect these credentials, we've implemented the following security measures.

## Security Measures

### 1. Environment Variable Management

All sensitive credentials are stored in environment variables, specifically in the `.env.local` file, which is:
- Listed in `.gitignore` to prevent accidental commits
- Not tracked by Git
- Used only on the server side (except for public Firebase client keys)

### 2. Base64 Encoding for Complex Credentials

For credentials that contain special characters or multi-line content (such as private keys):
- The credentials are Base64 encoded to preserve formatting across different environments
- This prevents issues with newlines and special characters in deployment environments
- Example: `FIREBASE_PRIVATE_KEY_BASE64` and `GOOGLE_VISION_PRIVATE_KEY_BASE64`

### 3. Git History Cleaning

We've implemented procedures to remove any sensitive data that may have been inadvertently committed:
- Used `git filter-repo` to completely remove `.env.local` from the Git history
- Created a sanitized version with placeholder values for demonstration

### 4. Automated Verification

We've created a verification script (`scripts/verify-api-keys.js`) that:
- Checks if `.env.local` is being properly ignored by Git
- Verifies that each sensitive key is properly formatted
- Detects placeholder values and provides warnings
- Creates a template `.env.local` file with placeholders if one doesn't exist

### 5. Placeholder System

For documentation and development purposes:
- Sensitive values are replaced with descriptive placeholders (e.g., `[REDACTED_OPENAI_API_KEY]`)
- The verification script identifies these placeholders and warns users
- This allows for easy setup guidance without exposing real credentials

## Verification Script

To check your API key security, run:

```bash
node scripts/verify-api-keys.js
```

This script will:
1. Check if `.env.local` exists and create a template if it doesn't
2. Verify that `.env.local` is not tracked by Git
3. Ensure it's listed in `.gitignore`
4. Check each sensitive key for proper formatting
5. Warn about placeholder values

## Best Practices for Developers

1. **Never commit the `.env.local` file**
2. **Never hardcode API keys in source code**
3. **Use the verification script before pushing changes**
4. **Regenerate any keys that may have been exposed**
5. **Use different API keys for development and production**

## Regenerating Compromised Keys

If you believe an API key has been compromised:

### OpenAI API
1. Visit [OpenAI Platform](https://platform.openai.com/api-keys)
2. Revoke the exposed key and create a new one
3. Update your `.env.local` file with the new key

### Firebase
1. Go to Firebase Console > Project Settings > Service Accounts
2. Generate a new private key
3. Update the `FIREBASE_PRIVATE_KEY_BASE64` in your `.env.local` file

### Nutritionix API
1. Log in to your Nutritionix account
2. Regenerate your API key in the developer dashboard
3. Update your `.env.local` file with the new credentials

## Continuous Security Improvements

We're continuously improving our security practices:
- Regular key rotation
- Automated security scanning
- Access control and permissions management
- Monitoring for unusual API usage patterns 