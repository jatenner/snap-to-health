# Firebase Configuration Guide

This guide provides instructions for fixing common Firebase issues with your Snap-to-Health application, specifically focusing on CORS configuration for Firebase Storage and security rules for Firestore.

## 1. Firebase Storage CORS Configuration

Firebase Storage requires CORS configuration to allow uploads from your development environment. Follow these steps to fix CORS issues:

### Prerequisites

- Install the [Google Cloud SDK](https://cloud.google.com/sdk/docs/install)
- Authenticate with Firebase using `firebase login`
- Ensure you have permission to manage the Firebase project

### Setting CORS Configuration

1. We've created a CORS configuration file in `firebase/cors.json`
2. Run the following command to apply the CORS settings:

```bash
gsutil cors set firebase/cors.json gs://snaphealth-39b14.appspot.com
```

3. Verify the CORS settings are applied:

```bash
gsutil cors get gs://snaphealth-39b14.appspot.com
```

You should see output confirming that `http://localhost:3000` is allowed.

## 2. Firebase Security Rules

We've created security rules for both Firestore and Storage in the `firebase` directory:

- `firebase/firestore.rules`: Controls access to Firestore collections
- `firebase/storage.rules`: Controls access to Firebase Storage

### Deploying Security Rules

Run the following commands to deploy the security rules:

```bash
# Deploy Firestore rules
firebase deploy --only firestore:rules

# Deploy Storage rules
firebase deploy --only storage:rules
```

## 3. Verification

After applying the CORS configuration and security rules, you should be able to:

1. Upload images to Firebase Storage from localhost
2. Save meal data to Firestore
3. Retrieve meal history from Firestore

## 4. Troubleshooting

### CORS Issues

If you continue to experience CORS issues:

- Check the browser console for specific error messages
- Ensure that the CORS configuration has been applied correctly
- Verify that your application is making requests from an allowed origin

### Firestore Access Issues

If you experience issues accessing Firestore:

- Ensure that the security rules allow the authenticated user to access their own data
- Check that your code is using the correct path structure: `users/{userId}/meals/{mealId}`
- Verify that authentication is working correctly before attempting to access Firestore

### Storage Access Issues

If you experience issues accessing Firebase Storage:

- Ensure that the security rules allow the authenticated user to upload to their directory
- Check that your code is using the correct path structure: `users/{userId}/mealImages/{imageId}`
- Verify that authentication is working correctly before attempting to upload

## 5. Enhanced Debugging

We've added enhanced debugging to the application code:

- The `firebase.ts` file now includes comprehensive error logging
- The `mealUtils.ts` file includes error handling specific to CORS and security rules issues
- Check the browser console for detailed error messages if issues persist 