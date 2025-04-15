# Firebase CORS and Firestore Access Fixes

## Changes Made

### 1. Created Firebase Configuration Files

- **firebase/cors.json**: CORS configuration for Firebase Storage
  - Allows access from `http://localhost:3000`
  - Permits needed HTTP methods: GET, POST, PUT, DELETE
  - Sets appropriate headers for authorization and content

- **firebase/firestore.rules**: Security rules for Firestore
  - Allows authenticated users to read/write their own data
  - Follows the structure `users/{userId}/meals/{mealId}`

- **firebase/storage.rules**: Security rules for Firebase Storage
  - Allows authenticated users to read/write their own files
  - Follows the structure `users/{userId}/{allPaths=**}`

- **firebase/firestore.indexes.json**: Indexes for better query performance
  - Added index for `createdAt` field in descending order

### 2. Updated Application Code

- **src/lib/firebase.ts**:
  - Added improved error handling for Firebase initialization
  - Added logging to help diagnose connection issues
  - Added authentication state change monitoring

- **src/lib/mealUtils.ts**:
  - Added detailed error logging for CORS and authorization issues
  - Improved type safety with explicit Firebase type casting
  - Added metadata to storage uploads to help with CORS issues
  - Enhanced error messages with troubleshooting guidance

### 3. Created Deployment Tools

- **firebase/deploy.sh**: Script to automate the deployment of configurations
  - Sets CORS configuration for Firebase Storage
  - Deploys Firestore and Storage security rules
  - Verifies configurations were applied correctly

- **README-FIREBASE.md**: Documentation for configuring Firebase
  - Step-by-step instructions for fixing CORS issues
  - Guidance on deploying security rules
  - Troubleshooting tips for common issues

## How to Apply the Changes

1. Make sure you have the Firebase CLI and Google Cloud SDK installed
2. Log in to Firebase using `firebase login`
3. Run the deployment script: `./firebase/deploy.sh`
4. Restart your development server with `npm run dev`

## Verification

After applying these changes, you should be able to:

- ✅ Upload images to Firebase Storage from localhost
- ✅ Save meal analysis data to Firestore
- ✅ Retrieve meal history from Firestore

If issues persist, check the browser console for detailed error messages that now include troubleshooting guidance. 