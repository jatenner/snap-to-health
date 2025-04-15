# Firebase Storage CORS Configuration Guide

This document explains how to properly set up CORS (Cross-Origin Resource Sharing) for Firebase Storage in the SnapHealth project.

## Current Solution: CORS Proxy

We've set up a local CORS proxy to allow file uploads from `localhost:3007` to Firebase Storage. This is a temporary solution until proper CORS configuration can be applied to the Firebase Storage bucket.

### How to Use the CORS Proxy

1. Import the storage utility functions:
   ```js
   import { uploadFileWithCors, getFileUrlWithCors } from '@/utils/storageUtils';
   ```

2. Replace your existing Firebase Storage upload code with:
   ```js
   const downloadUrl = await uploadFileWithCors(file, path);
   ```

3. When retrieving file URLs, use:
   ```js
   const url = await getFileUrlWithCors(path);
   ```

## Permanent Solution: Configure CORS on Firebase Storage

To properly configure CORS on Firebase Storage, follow these steps:

### Option 1: Using Google Cloud SDK (Recommended)

1. Install the Google Cloud SDK: https://cloud.google.com/sdk/docs/install

2. Initialize gcloud and authenticate:
   ```bash
   gcloud init
   ```

3. Create a file named `cors.json` with the following content:
   ```json
   [
     {
       "origin": ["http://localhost:3007"],
       "method": ["GET", "POST", "PUT"],
       "responseHeader": ["Content-Type", "Authorization"],
       "maxAgeSeconds": 3600
     }
   ]
   ```

4. Apply the CORS configuration:
   ```bash
   gsutil cors set cors.json gs://snaphealth-39b14.appspot.com
   ```

5. Verify the CORS configuration:
   ```bash
   gsutil cors get gs://snaphealth-39b14.appspot.com
   ```

### Option 2: Using Firebase Admin SDK

If you have the Firebase Admin SDK set up in your project, you can configure CORS programmatically:

```javascript
const admin = require('firebase-admin');
const serviceAccount = require('./path/to/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "snaphealth-39b14.appspot.com"
});

const bucket = admin.storage().bucket();

bucket.setCorsConfiguration([
  {
    origin: ["http://localhost:3007"],
    method: ["GET", "POST", "PUT"],
    responseHeader: ["Content-Type", "Authorization"],
    maxAgeSeconds: 3600
  }
])
.then(() => {
  console.log('CORS configuration updated successfully!');
})
.catch((error) => {
  console.error('Error updating CORS configuration:', error);
});
```

### Option 3: Using the Google Cloud Console

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to Cloud Storage > Buckets
3. Find your bucket (`snaphealth-39b14.appspot.com`)
4. Click on the bucket name to view its details
5. Go to the "Configuration" tab
6. Find the "CORS configuration" section and click "Edit"
7. Add the following CORS configuration:
   ```json
   [
     {
       "origin": ["http://localhost:3007"],
       "method": ["GET", "POST", "PUT"],
       "responseHeader": ["Content-Type", "Authorization"],
       "maxAgeSeconds": 3600
     }
   ]
   ```
8. Click "Save"

## Production Considerations

For production environments, update the CORS configuration to include your production domain:

```json
[
  {
    "origin": ["https://your-production-domain.com"],
    "method": ["GET", "POST", "PUT"],
    "responseHeader": ["Content-Type", "Authorization"],
    "maxAgeSeconds": 3600
  }
]
```

You can include multiple origins in the `origin` array to support both development and production environments.

## Troubleshooting CORS Issues

If you're still experiencing CORS issues after configuring CORS on Firebase Storage, try the following:

1. Verify your CORS configuration:
   ```bash
   gsutil cors get gs://snaphealth-39b14.appspot.com
   ```

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

3. Check browser developer tools for specific CORS error messages

4. Try using the CORS proxy as a temporary solution while debugging

5. Make sure you're using HTTPS for production environments

## References

- [Google Cloud Storage CORS Documentation](https://cloud.google.com/storage/docs/cross-origin)
- [Firebase Storage Documentation](https://firebase.google.com/docs/storage)
- [MDN CORS Documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) 