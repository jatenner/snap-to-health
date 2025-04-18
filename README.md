# Snap-to-Health

A mobile-first health tracking web app that analyzes your meals to help you achieve health goals like improving sleep.

## Features

- Take or upload a photo of your meal
- Set your health goal (default: "Improve Sleep")
- Get AI-powered analysis of how your meal affects your health goal
- Receive nutrient information through Nutritionix API integration
- View personalized suggestions for your next meal
- User accounts with Firebase Authentication
- Save and view meal history
- Personalized health goals

## Health Goal-Specific Meal Analysis Features

We've implemented an enhanced meal analysis system that provides highly personalized nutritional feedback based on the user's specific health goals. The system works as follows:

1. **Free-form Health Goal Input**: Users can enter any health goal as text (e.g., "post-run recovery", "reduce inflammation", "stay sharp during meetings") instead of selecting from predefined options.

2. **Intelligent Goal Recognition**: The system intelligently categorizes goals into specialized domains (Sleep, Weight Management, Muscle Building, Energy, Heart Health, Recovery, Immune Support, Digestive Health, Cognitive Function, Athletic Performance) while preserving the unique context of the user's goal.

3. **Research-Backed Analysis**: For each goal category, the system instructs GPT to evaluate meals through a scientific lens, referencing specific nutrients, compounds, and biological mechanisms relevant to that goal.

4. **Contextual Nutrient Highlighting**: Nutrients in the meal are intelligently highlighted based on their relevance to the user's specific health goal. For example, magnesium would be highlighted for sleep goals, while protein would be highlighted for muscle building goals.

5. **Personalized Goal Score**: Meals receive a 1-10 score based on how well they support the user's specific health goal, with detailed explanations of why the meal received that score.

6. **Tailored Insights**: The system provides specific positive and negative factors about the meal in relation to the user's goal, along with research-backed suggestions for improvement.

Key technical enhancements include:

- Enhanced prompt construction for GPT with goal-specific contextual information
- Sophisticated nutrient categorization based on health domains
- Dynamic feedback generation that adapts to both the meal content and the user's goal
- Intelligent fallback mechanisms to ensure quality insights even with limited input

These improvements help users understand not just what's in their meal, but how it specifically impacts their unique health objectives.

## Tech Stack

- Next.js 14 with App Router
- TypeScript
- Tailwind CSS
- GPT-4o with vision capabilities for image analysis
- Nutritionix API for detailed nutrition data
- Firebase (Authentication, Firestore, Storage)

## Getting Started

### Prerequisites

- Node.js 18+ and npm installed
- OpenAI API key with GPT-4o access
- Nutritionix API credentials
- Firebase project with Authentication, Firestore, and Storage enabled
- Google Cloud SDK (for CORS configuration)

### Firebase Setup

1. Create a Firebase project at [firebase.google.com](https://firebase.google.com)
2. Enable Authentication (Email/Password), Firestore, and Storage
3. Create a web app in your Firebase project to get configuration values
4. Generate a service account key for admin access:
   - Go to Project Settings > Service Accounts
   - Click "Generate new private key"
   - Save the JSON file (keep it secure and don't commit to version control)
5. Configure CORS for Firebase Storage:
   - See [Firebase Storage CORS Configuration](CORS-UPDATE-SUMMARY.md) for detailed instructions
   - Run `./apply-cors.sh` after installing Google Cloud SDK

### Environment Setup

Create a `.env.local` file in the root directory with the following variables:

```
# OpenAI API key for GPT-4 Vision
OPENAI_API_KEY=your_openai_api_key_here

# Nutritionix API credentials
NUTRITIONIX_APP_ID=your_nutritionix_app_id
NUTRITIONIX_API_KEY=your_nutritionix_api_key_here

# Firebase Client Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_firebase_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id

# Firebase Admin Configuration 
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour...\n-----END PRIVATE KEY-----\n"

### Firebase Private Key

For Firebase Admin SDK to work correctly, the private key must be properly formatted with actual newlines. To ensure consistent behavior across different environments (local development, Vercel, etc.), we now use base64 encoding for the private key.

**Steps to set up your Firebase private key:**

1. Obtain your Firebase service account key from the Firebase console
2. Use the provided script to encode it: `node src/scripts/encodePrivateKey.js --paste`
3. Add the base64 encoded key to your `.env.local` file:
   ```
   FIREBASE_PRIVATE_KEY_BASE64=your_base64_encoded_key
   ```

This approach prevents issues with newline handling across different platforms and deployment environments.
```

### Firebase Security Rules

The application includes Firebase security rules for Firestore and Storage:

- `firestore.rules` - Rules for Firestore database
- `storage.rules` - Rules for Firebase Storage

These rules ensure users can only access their own data.

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Run the development server:

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

### Deploy Firebase Rules

To deploy the Firebase security rules, use the included script:

```bash
./deploy-firebase.sh
```

This will validate and deploy the Firestore and Storage security rules to your Firebase project.

## Deployment

### Vercel Deployment

The application is configured for seamless deployment with Vercel. To deploy:

1. Set up a Vercel account and connect it to your GitHub repository
2. Configure the following environment variables in Vercel:
   - All environment variables from your `.env.local` file
   - Make sure to use the base64-encoded Firebase private key

```bash
# Deploy to Vercel
vercel
```

For production deployment:

```bash
vercel --prod
```

### Continuous Integration

The project includes a GitHub Actions workflow for continuous integration in `.github/workflows/ci.yml`. This workflow:

1. Runs on pushes to `main` and `deploy/ocr-analysis-v1` branches
2. Installs dependencies
3. Creates necessary environment variables for testing
4. Builds the project
5. Runs linting

To check the status of your CI builds, visit the Actions tab in your GitHub repository.

## Validating Firebase Setup

To validate your Firebase configuration, run the test script:

```bash
node -r dotenv/config src/tests/firebase-test.js
```

This script tests connectivity with both the Firebase Client and Admin SDKs, and verifies that authentication, Firestore, and Storage are working correctly.

## Usage

1. Sign up for an account
2. Set your health goal or use the default "Improve Sleep"
3. Upload a photo of your meal
4. Click "Analyze Meal"
5. View the analysis results:
   - Meal description
   - Nutrient highlights (with goal-friendly nutrients highlighted)
   - Health improvement tips specific to your goal
   - Suggestions for your next meal
6. Access your meal history from the History tab

## Testing and Debugging

The application includes several endpoints for testing and debugging:

- `/test-upload` - A simple page for testing image uploads and verifying base64 conversion
- `/api/debug-image` - API endpoint that processes image uploads and returns file info and base64 preview
- `/api/api-test` - API endpoint that verifies OpenAI and Nutritionix API connections

For image upload issues, check the server logs for detailed error messages related to file processing and API responses.

### Troubleshooting Image Upload

If you encounter issues with image uploads:

1. Ensure the image is a JPG/JPEG/PNG and under 5MB
2. Check that your OpenAI API key has access to GPT-4o
3. Verify the image is being properly converted to base64 using the `/test-upload` page
4. Check the browser console and server logs for detailed error messages

### Troubleshooting Firebase

If you encounter issues with Firebase:

1. Ensure all environment variables are correctly set in `.env.local`
2. Check that your Firebase project has the required services enabled
3. Verify the service account has the necessary permissions
4. Run the Firebase test script to check connectivity
5. Check Firebase console for any error logs

#### Firebase Diagnostic Tools

We've added several diagnostic tools to help troubleshoot Firebase issues:

1. **Firebase Diagnostic API Endpoint**
   ```
   GET /api/debug/firebase
   ```
   This endpoint checks your Firebase configuration and returns detailed diagnostic information about:
   - Required environment variables
   - Firebase private key validation
   - Firebase Admin SDK initialization status
   - Firestore connectivity test

2. **Firebase Configuration Verification Script**
   ```bash
   node scripts/verify-firebase-config.js
   ```
   This script validates your Firebase environment variables and private key format without attempting to initialize Firebase. Use this to check if your configuration is properly formatted.

3. **Firebase Private Key Generator**
   ```bash
   node scripts/generate-firebase-key.js [path-to-service-account.json]
   ```
   This script extracts the private key from your Firebase service account JSON file and generates the base64-encoded version required for environment variables. It also creates:
   - `firebase-key-base64.txt` - Contains only the base64-encoded key
   - `.env.local.firebase` - Contains all Firebase Admin environment variables

To regenerate your Firebase private key:
1. Download a fresh service account JSON file from Firebase Console
2. Run the key generator script
3. Update your `.env.local` file with the generated variables

## Future Enhancements

- Multiple health goal tracking
- Weekly and monthly health reports
- Social sharing features
- Integration with fitness trackers 

## CORS Configuration for Firebase Storage

The app requires proper CORS configuration for Firebase Storage to work correctly with localhost:3009.

**Important:** After cloning the repository, run this command to apply the CORS configuration:

```bash
gsutil cors set cors.json gs://snaphealth-39b14.appspot.com
```

For detailed instructions on CORS configuration, see the `README-CORS-UPDATE.md` file.

## GPT-4-Vision Configuration

This app uses OpenAI's GPT-4-Vision model to analyze food images. You can control the behavior of the model using the environment variable:

```
USE_GPT4_VISION=true|false
```

### Behavior:

- **`USE_GPT4_VISION=true`** (default): Forces the use of GPT-4-Vision model only. If the model is not available with your API key, the analysis will fail rather than use a fallback model.

- **`USE_GPT4_VISION=false`**: Allows fallback to GPT-3.5-Turbo if GPT-4-Vision is not available. This will show a warning banner in the UI to indicate that the analysis may be less accurate.

### Testing Model Availability:

You can check which models are available with your API key by accessing the test endpoint:

```
/api/test-openai
```

This endpoint returns information about:
- Your OpenAI API key configuration
- Whether GPT-4-Vision is being forced
- Availability of GPT-4-Vision, GPT-4o, and GPT-3.5-Turbo models
- A list of available GPT models for your API key 