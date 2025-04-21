# Firebase Setup Guide

This guide explains how to set up Firebase credentials for the Snap to Health application.

## Prerequisites

- Firebase project with Firestore, Authentication, and Storage enabled
- Firebase Admin SDK service account JSON file

## Setup Instructions

### 1. Download the Firebase Service Account JSON File

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to Project Settings > Service accounts
4. Click "Generate new private key"
5. Save the JSON file to your local machine

### 2. Run the Setup Script

The project includes a script that will automatically configure your environment files with the Firebase credentials:

```bash
# Make the script executable
chmod +x scripts/setup-firebase-env.js

# Run the script with the path to your service account JSON file
node scripts/setup-firebase-env.js /path/to/your-service-account-file.json
```

This script will:
- Read the service account JSON file
- Generate the base64-encoded private key
- Update `.env.local` and `.env.local.firebase` with the correct environment variables

### 3. Verify the Configuration

Run the Firebase verification script to ensure everything is set up correctly:

```bash
node scripts/testFirebaseAll.js
```

All tests should pass, indicating that Firebase Admin SDK and client libraries are correctly configured.

## Manual Setup (if needed)

If you need to manually set up the environment variables, ensure that the following variables are defined in your `.env.local` file:

```
# Firebase Client Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=[your-api-key]
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=[your-project-id].firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=[your-project-id]
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=[your-project-id].appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=[your-messaging-sender-id]
NEXT_PUBLIC_FIREBASE_APP_ID=[your-app-id]
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=[your-measurement-id]

# Firebase Admin Configuration
FIREBASE_CLIENT_EMAIL=[your-client-email]
FIREBASE_CLIENT_ID=[your-client-id]
FIREBASE_PRIVATE_KEY_BASE64=[your-base64-encoded-private-key]
```

You can encode the private key with:

```bash
node scripts/encode-firebase-key.js /path/to/your-service-account-file.json
```

## Deployment to Vercel

When deploying to Vercel, add the following environment variables:

- `FIREBASE_CLIENT_EMAIL`: The client email from your service account
- `FIREBASE_CLIENT_ID`: The client ID from your service account
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`: Your Firebase project ID
- `FIREBASE_PRIVATE_KEY_BASE64`: The base64-encoded private key

## Troubleshooting

If you encounter issues with Firebase authentication, try:

1. Checking that all environment variables are correctly set
2. Running the verification script: `node scripts/verify-firebase-config.js`
3. Testing basic Firebase operations: `node scripts/testFirebaseAdmin.js`

For issues with the private key format, try:

1. Re-running the encode script: `node scripts/encode-firebase-key.js`
2. Manually checking the private key format: `node scripts/testPrivateKeyDecoding.js` 