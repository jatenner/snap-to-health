# Firebase Setup Guide

This guide will help you set up Firebase credentials for the application.

## Prerequisites

- A Firebase project
- A service account JSON file (for admin access)
- Node.js installed on your machine

## Steps to Configure Firebase

### 1. Create a Firebase Project (if you haven't already)

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" and follow the instructions
3. Enable Firestore, Storage, and Authentication as needed

### 2. Generate a Service Account JSON

1. In your Firebase project, go to **Project Settings** > **Service accounts**
2. Click **Generate new private key**
3. Save the JSON file securely on your computer
4. **IMPORTANT**: This file contains sensitive credentials. Never commit it to version control.

### 3. Configure Environment Variables

We provide a script to automatically extract the necessary values from your service account JSON and encode them properly.

```bash
# Navigate to the project directory
cd /path/to/project

# Run the conversion script
node src/scripts/convertServiceAccountToEnv.js /path/to/your-service-account.json
```

This will generate a `.env.local.firebase` file with all the necessary environment variables.

### 4. Update Your Environment File

Add the content from `.env.local.firebase` to your `.env.local` file. If you don't have a `.env.local` file yet, you can rename `.env.local.firebase` to `.env.local`.

### 5. Test the Configuration

Run the test script to verify that your Firebase credentials are working correctly:

```bash
node src/scripts/testFirebaseAdmin.js
```

If everything is configured correctly, you should see "Firebase Admin initialized successfully".

## Troubleshooting

### Invalid Private Key Format

If you encounter errors related to the private key format, ensure that:

1. You've used the provided script to generate the environment variables
2. The entire private key was properly base64 encoded
3. The environment variable is not truncated

### Firestore Connection Issues

If Firebase Admin initializes successfully but you can't connect to Firestore:

1. Check that your service account has the necessary permissions
2. Verify that Firestore is enabled in your Firebase project
3. Check your Firebase rules to ensure they allow the operations you're trying to perform

### Missing Environment Variables

If you see errors about missing environment variables:

1. Check that all variables from `.env.local.firebase` were copied to `.env.local`
2. Make sure there are no extra spaces or line breaks in your `.env.local` file
3. Restart your development server to ensure the new variables are loaded

## Environment Variables Reference

- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`: Your Firebase project ID
- `FIREBASE_CLIENT_EMAIL`: The client email from your service account
- `FIREBASE_PRIVATE_KEY_BASE64`: The private key from your service account, base64 encoded
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`: Your Firebase storage bucket name (optional) 