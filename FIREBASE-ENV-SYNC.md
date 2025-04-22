# Firebase Environment Sync for SnapHealth

## Changes Made

1. **Fixed Environment Variable Mismatches**
   - Updated `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` to `1026207510687`
   - Updated `NEXT_PUBLIC_FIREBASE_APP_ID` to `1:1026207510687:web:1fa5f82f2f80dbfca32431`
   - Updated `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` to `G-8ZSG6TMYYE`

2. **Removed Hardcoded Firebase Values**
   - Fixed `src/utils/firestoreProxyUtils.ts` by removing hardcoded fallbacks for project ID
   - Updated `src/app/api/proxy/firestore/route.ts` to properly check for environment variables
   - Fixed `src/lib/mealUtils.ts` to properly validate storage bucket

3. **Created Sync Script**
   - Added `scripts/sync-firebase-env.js` to verify environment variables
   - Script also generates Vercel CLI commands for syncing environments

## Deployment Instructions

1. **Login to Vercel**
   ```bash
   vercel login
   ```

2. **Sync Environment Variables**
   Run the following commands to add all Firebase environment variables to Vercel:

   ```bash
   vercel env add NEXT_PUBLIC_FIREBASE_API_KEY "AIzaSyDQzBnFnrPJbxi2-hFmuQd2bDVRo2ikHiU" production
   vercel env add NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN "snaphealth-39b14.firebaseapp.com" production
   vercel env add NEXT_PUBLIC_FIREBASE_PROJECT_ID "snaphealth-39b14" production
   vercel env add NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET "snaphealth-39b14.appspot.com" production
   vercel env add NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID "1026207510687" production
   vercel env add NEXT_PUBLIC_FIREBASE_APP_ID "1:1026207510687:web:1fa5f82f2f80dbfca32431" production
   vercel env add NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID "G-8ZSG6TMYYE" production
   vercel env add FIREBASE_CLIENT_EMAIL "firebase-adminsdk-fbsvc@snaphealth-39b14.iam.gserviceaccount.com" production
   vercel env add FIREBASE_CLIENT_ID "115934821794605256140" production
   ```

   For the Firebase private key, add it manually in the Vercel dashboard:
   - Go to Project Settings > Environment Variables
   - Add `FIREBASE_PRIVATE_KEY_BASE64` with the value from your `.env.local` file

3. **Deploy to Production**
   ```bash
   vercel --prod
   ```

4. **Verify Deployment**
   - Check that Firebase authentication works
   - Verify image uploads to Firebase Storage
   - Confirm Firestore operations are working

## Troubleshooting

If you encounter any issues with Firebase initialization:

1. Check the browser console for error messages
2. Verify that all environment variables are correctly set in Vercel
3. Try re-deploying with `vercel --prod`
4. If issues persist, compare environment variables in `.env.local` and Vercel

## Verifying Environment Variables

Run this script to verify your local environment variables:

```bash
node scripts/sync-firebase-env.js
``` 