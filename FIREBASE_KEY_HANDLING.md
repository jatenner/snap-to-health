# Firebase Private Key Handling

This document outlines the approach for handling the Firebase service account private key in this application, especially for secure deployment on Vercel.

## Overview

Firebase Admin SDK requires a service account private key for server-side operations. This key should be:

1. Never committed to source code 
2. Properly encoded to avoid issues with newlines and special characters
3. Validated at runtime to catch configuration errors early

## Implementation

### Base-64 Key Encoding

The Firebase private key is encoded as a Base-64 string to:
- Preserve newlines and special characters across environment variables
- Allow for easier transport between systems
- Provide consistent handling across platforms

### Scripts

#### `scripts/generate-firebase-key.js`

This script automates the process of generating the Base-64 encoded private key:

```bash
# Run the script
node scripts/generate-firebase-key.js
```

The script:
1. Reads the Firebase service account JSON file from `keys/snaphealth-d32fe57.json`
2. Extracts the private key
3. Encodes it as a Base-64 string
4. Outputs the Vercel CLI command to add the key as an environment variable
5. Saves the key to `keys/firebase-private-key-base64.txt` for backup

### Runtime Validation

The application includes validation to ensure the Firebase private key is properly configured:

- `src/utils/validateEnv.ts` contains `assertFirebasePrivateKey()` which validates:
  - The environment variable exists
  - The string can be decoded from Base-64
  - The decoded key has the correct PEM format
  - The key is a reasonable length

### Integration with Firebase Admin

The Firebase Admin SDK initialization in `src/lib/firebaseAdmin.ts` uses the validation function to ensure the key is valid before attempting to use it.

### Testing

Jest tests in `__tests__/env.spec.ts` verify that the validation function works correctly by testing:
- Valid keys are accepted
- Missing keys throw appropriate errors
- Invalid Base-64 encoding is detected
- Keys with incorrect PEM format are rejected
- Keys that are too short are rejected

## Usage

### For Local Development

1. Obtain the Firebase service account JSON file
2. Save it to `keys/snaphealth-d32fe57.json`
3. Run `node scripts/generate-firebase-key.js`
4. Copy the output key to your `.env.local` file:
   ```
   FIREBASE_PRIVATE_KEY_BASE64=your-base64-encoded-key
   ```

### For Deployment

1. Run `node scripts/generate-firebase-key.js` to generate the key
2. Copy the Vercel CLI command output
3. Run the command or manually add the key to Vercel environment variables

## Security Considerations

- The `keys/` directory is in `.gitignore` to prevent accidental commits of service account files
- The Base-64 encoded key should only be stored in environment variables, never in code
- Runtime validation helps ensure deployments fail fast if misconfigured

## Troubleshooting

If you encounter issues with Firebase initialization:

1. Ensure the service account JSON file contains a valid private key
2. Regenerate the Base-64 key using the script
3. Verify the environment variable is set correctly
4. Check server logs for validation errors 