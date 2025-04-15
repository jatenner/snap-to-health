#!/bin/bash

# Exit on error
set -e

echo "Snap-to-Health Firebase Configuration Tool"
echo "=========================================="
echo

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI is not installed. Please install it using:"
    echo "   npm install -g firebase-tools"
    exit 1
fi

# Check if gsutil is installed
if ! command -v gsutil &> /dev/null; then
    echo "❌ gsutil is not installed. Please install the Google Cloud SDK:"
    echo "   https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Login to Firebase if not already logged in
firebase projects:list &> /dev/null || firebase login

echo "1️⃣ Setting CORS configuration for Firebase Storage..."
gsutil cors set firebase/cors.json gs://snaphealth-39b14.firebasestorage.app
echo "✅ CORS configuration set successfully!"
echo

echo "2️⃣ Verifying CORS configuration..."
gsutil cors get gs://snaphealth-39b14.firebasestorage.app
echo "✅ CORS configuration verified!"
echo

echo "3️⃣ Deploying Firestore security rules..."
firebase deploy --only firestore:rules
echo "✅ Firestore rules deployed successfully!"
echo

echo "4️⃣ Deploying Storage security rules..."
firebase deploy --only storage:rules
echo "✅ Storage rules deployed successfully!"
echo

echo "🎉 All Firebase configurations have been applied successfully!"
echo "You should now be able to upload images and save meals from localhost."
echo
echo "If you still encounter issues, please check the browser console for detailed error messages."
echo "Refer to README-FIREBASE.md for troubleshooting guidance." 