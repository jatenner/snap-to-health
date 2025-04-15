# Firebase Storage CORS Configuration Update

This file contains instructions for applying the CORS configuration to your Firebase Storage bucket to allow cross-origin access from localhost:3009.

## Prerequisites

1. Install the Google Cloud SDK: https://cloud.google.com/sdk/docs/install
2. Authenticate with gcloud: `gcloud auth login`

## Apply CORS Configuration

The `cors.json` file has been updated to allow access from localhost:3009. To apply this configuration to your Firebase Storage bucket, run:

```bash
gsutil cors set cors.json gs://snaphealth-39b14.firebasestorage.app
```

## Verify CORS Configuration

To verify that the CORS configuration has been applied correctly, run:

```bash
gsutil cors get gs://snaphealth-39b14.firebasestorage.app
```

You should see a response that includes the following origins:
- `http://localhost:3007`
- `http://localhost:3009`

## Common CORS Issues

If you're still experiencing CORS issues:

1. Double-check your Firebase Storage bucket name. It should be `snaphealth-39b14.appspot.com` or `snaphealth-39b14.firebasestorage.app` depending on your configuration.

2. Ensure your Firebase Storage rules allow the operations you're trying to perform:
   ```
   service firebase.storage {
     match /b/{bucket}/o {
       match /{allPaths=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```

3. Check browser developer tools for specific CORS error messages.

4. Make sure you're using the correct port (3009) in your application.

5. Clear browser cache and reload the page after applying CORS changes.

## Firebase Configuration Review

Based on the review of your `.env.local` file and terminal output, here are some observations:

1. Your Firebase configuration appears to be correct with all required fields.
   
2. Your application is trying to use ports 3000-3007 before settling on an available port. Make sure port 3009 is available when running the application, or consider specifying port 3009 explicitly when starting the development server:
   ```bash
   npm run dev -- -p 3009
   ```

3. The Storage bucket name in your CORS command should match exactly what's in your `.env.local` file: `snaphealth-39b14.appspot.com` 