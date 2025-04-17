# Firebase Private Key Configuration Guide

This guide helps troubleshoot and fix issues with Firebase service account private keys, especially when working with environment variables in Next.js applications.

## Common Issues with Firebase Private Keys

Private keys in PEM format contain newlines (`\n`) which can cause issues when:
1. Stored in environment variables
2. Passed through build systems
3. Deployed to hosting platforms

## Recommended Solution: Base64 Encoding

The most reliable approach is to **base64 encode** your private key:

1. The key is stored in a format that preserves all characters and newlines
2. It works reliably across different environments and platforms
3. It can be easily decoded in the application code

## Step-by-Step Guide

### 1. Download your Service Account Key

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Project Settings** → **Service accounts**
4. Click **Generate new private key**
5. Save the JSON file to your local machine

### 2. Encode the Private Key

Use the provided script to encode your private key:

```bash
# From the project root
node scripts/encodePrivateKey.js "/path/to/your-service-account.json"
```

This will:
- Parse your service account file
- Extract the private key and encode it to base64
- Generate a file with environment variables ready to copy

### 3. Update Your Environment Variables

Copy the generated environment variables to your `.env.local` file:

```
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxx@your-project.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=your-client-id
FIREBASE_PRIVATE_KEY_BASE64=LS0tLS1CRUdJTi...base64-encoded-key...LS0tLS0K
```

### 4. Test Your Configuration

Run the test script to verify your Firebase Admin configuration:

```bash
node scripts/testFirebaseAdminInit.js
```

If successful, you should see:
```
✅ Firebase Admin initialized successfully!
✅ Successfully wrote to Firestore
✅ ALL TESTS PASSED - Firebase Admin is correctly configured
```

### 5. Deploy to Production

When deploying to production:

1. Make sure to set these environment variables in your hosting platform
2. For Vercel, add them in the Environment Variables section of your project settings
3. For other platforms, refer to their documentation on how to set environment variables

## Troubleshooting

If you encounter issues:

### Check the private key format

Run the diagnostic script:

```bash
node scripts/diagnosePrivateKey.js
```

This will analyze your environment variables and help identify issues with the private key.

### Common errors and solutions

1. **"Error: Failed to parse private key"**:
   - Make sure the private key is correctly base64 encoded
   - Try regenerating your service account key

2. **"Error: Invalid PEM formatted message"**:
   - The decoded private key doesn't have the correct PEM format
   - Check that the base64 encoding/decoding is working correctly

3. **"Error: The caller does not have permission"**:
   - The service account doesn't have the necessary permissions
   - Make sure the service account has the Firebase Admin SDK role

## How It Works in the Code

In `src/lib/firebaseAdmin.ts`, we handle the decoding of the base64 private key:

```js
// Decode the base64 encoded private key
const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
const decodedPrivateKey = Buffer.from(privateKeyBase64!, 'base64').toString('utf8');

// Initialize Firebase Admin
initializeApp({
  credential: cert({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: decodedPrivateKey,
  }),
});
```

## Alternative Approach: Using Escaped Newlines

If you prefer not to use base64 encoding, you can use escaped newlines:

1. Set the environment variable with escaped newlines: 
   ```
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANB...and-so-on\n-----END PRIVATE KEY-----\n"
   ```

2. In your code, replace escaped newlines with actual newlines:
   ```js
   const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
   ```

However, this approach is more prone to issues and is not recommended. 