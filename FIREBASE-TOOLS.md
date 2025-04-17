# Firebase Tools

This document provides information about the Firebase diagnostic and configuration tools available in this project. These tools help troubleshoot common Firebase issues and ensure your Firebase configuration is correct.

## Table of Contents

1. [Overview](#overview)
2. [Available Tools](#available-tools)
3. [Testing Firebase Configuration](#testing-firebase-configuration)
4. [Working with Private Keys](#working-with-private-keys)
5. [Troubleshooting](#troubleshooting)

## Overview

Firebase integration requires proper configuration of both client-side and server-side (Admin SDK) components. These tools help verify that your Firebase configuration is correct and assist with common issues like private key formatting and environment variable setup.

## Available Tools

| Tool | Description | Command |
|------|-------------|---------|
| `testFirebaseAll.js` | Comprehensive test of both client and admin Firebase configurations | `node scripts/testFirebaseAll.js` |
| `testFirebaseAdmin.js` | Test only the Firebase Admin SDK configuration | `node scripts/testFirebaseAdmin.js` |
| `testFirebaseClient.js` | Test only the Firebase client-side configuration | `node scripts/testFirebaseClient.js` |
| `fixPrivateKey.js` | Fix and encode Firebase private keys | `node scripts/fixPrivateKey.js` |
| `convertServiceAccountToEnv.js` | Convert a service account JSON file to environment variables | `node src/scripts/convertServiceAccountToEnv.js path/to/service-account.json` |
| `encodePrivateKey.js` | Encode a Firebase private key as Base64 | `node src/scripts/encodePrivateKey.js path/to/private-key.txt` |

## Testing Firebase Configuration

To run a comprehensive test of your Firebase configuration, use:

```bash
node scripts/testFirebaseAll.js
```

This script will:
1. Check for required environment variables
2. Validate the format of your Firebase private key
3. Test Firebase Admin SDK initialization
4. Test Firestore read/write functionality
5. Validate client-side Firebase configuration

You should see "ALL TESTS PASSED!" if your configuration is correct.

## Working with Private Keys

Firebase Admin SDK requires a valid private key. Common issues include:

1. Missing newlines in the key
2. Improperly encoded keys
3. Incorrect formatting

### Fixing Private Key Issues

If you're having issues with your private key, use the `fixPrivateKey.js` tool:

```bash
node scripts/fixPrivateKey.js
```

This interactive tool will:
- Help format your private key correctly
- Convert escaped newlines (`\\n`) to actual newlines
- Ensure proper PEM format with headers and footers
- Encode the key as Base64 for use in environment variables

### Setting Up a New Service Account

To set up a new Firebase service account:

1. Go to Firebase Console > Project Settings > Service Accounts
2. Click "Generate new private key"
3. Save the JSON file
4. Run:
   ```bash
   node src/scripts/convertServiceAccountToEnv.js path/to/downloaded-file.json
   ```
5. Add the generated variables to your `.env.local` file

## Troubleshooting

### Common Issues

#### Firebase Admin SDK Fails to Initialize

- Check that `FIREBASE_PRIVATE_KEY_BASE64` is correctly formatted
- Verify that the private key contains actual newlines when decoded
- Ensure the service account has the necessary permissions

#### Firebase Client Cannot Connect

- Verify all `NEXT_PUBLIC_FIREBASE_*` variables are set in `.env.local`
- Check that the API key, project ID, and other values match your Firebase console
- Ensure your Firebase project has the appropriate services enabled

#### Storage or Firestore Operations Fail

- Verify the service account has the necessary permissions
- Check that security rules allow the operations you're attempting
- Ensure the storage bucket format is correct

For persistent issues, run `testFirebaseAll.js` for detailed diagnostics. 