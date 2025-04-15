# Firebase Storage CORS Configuration

This document outlines how to configure Cross-Origin Resource Sharing (CORS) for your Firebase Storage bucket to enable direct uploads from browser applications.

## Why Configure CORS?

Without proper CORS configuration, your web application may encounter errors when attempting to upload files directly to Firebase Storage from the browser. This is particularly important for features like image uploads in Snap-to-Health.

## Configuration Steps

### Prerequisites

1. [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) installed and configured
2. Access to your Firebase project with Storage Admin permissions

### Configuration File

The CORS configuration is defined in `firebase/cors.json`:

```json
[
  {
    "origin": ["*"],
    "method": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type", "Content-Length", "Content-Encoding", "Content-Disposition"]
  }
]
```

> **Note:** The `"origin": ["*"]` setting allows requests from all origins. For production environments, you should restrict this to specific domains.

### Applying the Configuration

1. Make sure you're authenticated with Google Cloud:
   ```bash
   gcloud auth login
   ```

2. Set your project ID:
   ```bash
   gcloud config set project YOUR_PROJECT_ID
   ```

3. Run the provided script:
   ```bash
   ./apply-cors.sh
   ```

   The script will:
   - Check for the Google Cloud SDK installation
   - Verify the CORS configuration file exists
   - Apply the configuration to your storage bucket
   - Display the updated configuration

### Manual Application

If you prefer to apply the configuration manually:

```bash
gsutil cors set firebase/cors.json gs://YOUR_BUCKET_NAME.appspot.com
```

To verify the configuration:

```bash
gsutil cors get gs://YOUR_BUCKET_NAME.appspot.com
```

## Troubleshooting

### Common Issues

1. **Authentication Error**: Ensure you're authenticated with the correct Google account that has access to your Firebase project.

2. **Permission Denied**: Verify you have the Storage Admin role for your Firebase project.

3. **CORS Still Not Working**: If uploads still fail after configuration:
   - Check browser console for specific error messages
   - Verify the bucket name is correct
   - Confirm the CORS configuration has been applied successfully

### Fallback Proxy

If direct uploads still fail, the application includes a fallback CORS proxy route at `/api/proxy/storage`. This route proxies uploads through the server when direct uploads encounter CORS issues.

## Additional Resources

- [Firebase Storage CORS Documentation](https://firebase.google.com/docs/storage/web/download-files#cors_configuration)
- [Google Cloud Storage CORS Documentation](https://cloud.google.com/storage/docs/cross-origin)
- [gsutil cors command documentation](https://cloud.google.com/storage/docs/gsutil/commands/cors) 