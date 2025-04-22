# SnapHealth Environment Setup Guide

This guide explains how to set up the environment variables required for running the SnapHealth application.

## Prerequisites

- Node.js (v16 or higher)
- npm (v7 or higher)
- A Firebase project with Firestore enabled
- An OpenAI API key

## Setting Up Environment Variables

The application requires the following environment variables to work properly:

1. Firebase Client Configuration (Public)
2. Firebase Admin Configuration (Server-side)
3. OpenAI API Configuration

We've created several utilities to help you set up these variables.

### Step 1: Clone the repository and install dependencies

```bash
git clone <repository-url>
cd Health
npm install
```

### Step 2: Set up base environment

Run the base environment setup script:

```bash
npm run setup-env
```

This will create a `.env.local` file with all the required variable names.

### Step 3: Set up Firebase Admin

You need a Firebase service account key file (JSON) to set up Firebase Admin. If you don't have one, you can generate it from the Firebase Console:

1. Go to your Firebase project settings
2. Navigate to "Service accounts"
3. Click "Generate new private key"
4. Save the JSON file in your project directory

Then run:

```bash
npm run setup-firebase
```

This will extract and configure the necessary Firebase Admin credentials.

### Step 4: Set up OpenAI API Key

You need an OpenAI API key for image analysis. If you don't have one, you can get it from [OpenAI's platform](https://platform.openai.com/api-keys).

Run:

```bash
npm run setup-openai
```

Follow the prompts to enter your OpenAI API key.

### Step 5: Verify Environment Setup

To verify that all environment variables are correctly set up:

```bash
npm run verify-firebase
```

This will check all environment variables and test the Firebase connection.

### Step 6: Backup Your Configuration

Once you have your environment properly configured, it's a good idea to create a backup:

```bash
npm run backup-env
```

This will create a timestamped backup file of your `.env.local` file that you can restore if needed.

## Environment Variables

These are the key environment variables used by the application:

| Variable | Description | Required |
|----------|-------------|----------|
| NEXT_PUBLIC_FIREBASE_API_KEY | Firebase Web API Key | Yes |
| NEXT_PUBLIC_FIREBASE_PROJECT_ID | Firebase Project ID | Yes |
| NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN | Firebase Auth Domain | Yes |
| NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET | Firebase Storage Bucket | Yes |
| FIREBASE_CLIENT_EMAIL | Firebase Admin Client Email | Yes |
| FIREBASE_PRIVATE_KEY_BASE64 | Firebase Admin Private Key (Base64 encoded) | Yes |
| OPENAI_API_KEY | OpenAI API Key | Yes |
| OPENAI_MODEL | OpenAI Model to use (default: "gpt-4o") | Yes |
| NUTRITIONIX_API_KEY | Nutritionix API Key (optional) | No |
| NUTRITIONIX_APP_ID | Nutritionix App ID (optional) | No |

## Running the Application

Once everything is set up:

- Development mode: `npm run dev`
- Production build: `npm run build`
- Start production server: `npm run start`

## Utility Scripts

| Script | Description |
|--------|-------------|
| `npm run setup-env` | Initial setup of .env.local file |
| `npm run setup-firebase` | Configure Firebase Admin credentials |
| `npm run setup-openai` | Configure OpenAI API key |
| `npm run verify-env` | Basic verification of environment variables |
| `npm run verify-firebase` | Comprehensive verification with connection testing |
| `npm run backup-env` | Create a timestamped backup of your .env.local file |

## Restoring from Backup

If you need to restore from a backup:

```bash
cp /path/to/backup/.env.backup.TIMESTAMP /path/to/project/.env.local
```

Replace `TIMESTAMP` with the timestamp of the backup you want to restore.

## Troubleshooting

If you encounter issues:

1. Make sure all required environment variables are set
2. Check that your Firebase service account has the necessary permissions
3. Verify that your OpenAI API key is valid and has sufficient quota
4. Run `npm run verify-firebase` to diagnose configuration issues 