#!/bin/bash

# This script applies CORS configuration to Firebase Storage
# Load environment variables from .env.local
export $(grep -v '^#' ../.env.local | xargs)

BUCKET_NAME=${NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:-"snaphealth-39b14.firebasestorage.app"}

echo "Applying CORS settings to Firebase Storage bucket: $BUCKET_NAME"
gsutil cors set firebase/cors.json gs://$BUCKET_NAME

echo "CORS settings applied successfully!"
echo "Testing CORS configuration..."
gsutil cors get gs://$BUCKET_NAME 