# Firebase Admin SDK Setup

This guide explains how to properly configure the Firebase Admin SDK for Snap to Health, particularly focusing on proper private key handling.

## Key Changes

1. **Base64 Encoded Private Key**: We now exclusively use `FIREBASE_PRIVATE_KEY_BASE64` instead of `FIREBASE_PRIVATE_KEY`.
2. **Improved Key Validation**: Enhanced validation ensures proper PEM format with newlines.
3. **Better Error Diagnostics**: More detailed error messages help troubleshoot initialization issues.

## Why Base64 Encoding?

Firebase service account private keys contain special characters and newlines, which can cause issues when stored in environment variables:

1. **Newline Preservation**: Base64 encoding preserves the exact format of the key including newlines.
2. **No Escaping Required**: Eliminates issues with escaped characters (`\n` vs `\\n`).
3. **Cross-Platform Compatibility**: Works consistently across different hosting environments.
4. **Vercel Compatibility**: Prevents truncation or corruption in Vercel environment variables.

## How It Works

1. The service account JSON file contains the private key with literal newlines.
2. We encode this key to base64 using `Buffer.from(privateKey).toString('base64')`.
3. In `firebaseAdmin.ts`, we decode it back using `Buffer.from(base64Key, 'base64').toString('utf8')`.
4. We validate that the decoded key contains proper PEM headers and newlines.

## Setting Up Firebase Admin

### Step 1: Generate the Base64 Key

Use our helper script to convert your service account JSON to proper environment variables:

```bash
node src/scripts/convertServiceAccountToEnv.js path/to/your-service-account.json
```

This will create a `.env.local.firebase` file containing all necessary environment variables, including the base64-encoded private key.

### Step 2: Set Environment Variables

For local development, copy the variables from `.env.local.firebase` to your `.env.local` file.

For production (Vercel), use our helper script:

```bash
node src/scripts/vercel-env-check.js
```

This script will check and update your Vercel environment variables, ensuring:
- `FIREBASE_PRIVATE_KEY_BASE64` is properly set
- Legacy `FIREBASE_PRIVATE_KEY` is removed

### Step 3: Test the Configuration

To verify your Firebase Admin SDK configuration, use:

```bash
node src/scripts/testFirebaseAdmin.js
```

Or in production, visit the diagnostic endpoint:

```
/api/debug/firebase-check
```

(Note: In production, this endpoint requires authorization using the `ADMIN_API_KEY` environment variable)

## Troubleshooting

If you encounter Firebase Admin initialization issues:

### 1. Verify the Base64 Key

The most common issue is a corrupted or improperly formatted private key. Check:

- The key contains proper PEM headers (`-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`)
- Newlines are preserved properly when decoded
- The key isn't truncated

### 2. Check for Missing Variables

Ensure all required environment variables are set:
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY_BASE64`

### 3. Regenerate if Needed

If in doubt, regenerate the base64 key using the `convertServiceAccountToEnv.js` script.

## Migration Notes

If you previously used `FIREBASE_PRIVATE_KEY` with escaped newlines, migrate to `FIREBASE_PRIVATE_KEY_BASE64` by:

1. Running `node src/scripts/convertServiceAccountToEnv.js` with your service account JSON
2. Updating your environment variables to use the base64 version
3. Removing any references to the old `FIREBASE_PRIVATE_KEY` variable 