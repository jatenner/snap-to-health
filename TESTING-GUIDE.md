# Testing Guide for Snap2Health

This document provides instructions for testing the GPT-4 Vision integration in Snap2Health.

## Overview

Snap2Health uses GPT-4 Vision for image analysis to extract food information from uploaded photos. We have the following testing options available:

1. **Unit Tests** - Test the `analyzeWithGPT4Vision` function in isolation using Jest
2. **API Endpoint Test** - Test the `/api/test-vision` endpoint via browser or API client
3. **Node.js Script Test** - Directly test the GPT-4 Vision API via a Node.js script

## Prerequisites

- Node.js 18+ installed
- Access to OpenAI API with GPT-4 Vision capabilities
- Valid API keys in `.env.local` (see below)

## Environment Setup

Ensure your `.env.local` file contains the necessary API keys:

```
OPENAI_API_KEY=your_openai_api_key
```

## Running the Unit Tests

The unit tests use Jest and mock the OpenAI API to test the function behavior:

```bash
# Run all tests
npm test

# Run just the GPT-4 Vision tests
npm test -- -t "analyzeWithGPT4Vision"
```

## Testing the API Endpoint

We have a dedicated test endpoint at `/api/test-vision` that uses a simple test image to verify the GPT-4 Vision integration:

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Visit or make a GET request to:
   ```
   http://localhost:3000/api/test-vision
   ```

This endpoint returns JSON with the analysis results or error details.

## Testing with Node.js Script

For direct API testing without the Next.js server:

```bash
# Run the script
node scripts/test-gpt4-vision.js
```

This script:
- Uses a simple test image (1x1 orange pixel)
- Makes a direct request to the OpenAI API
- Displays the full response and timing information

## Troubleshooting

Common issues:

1. **API Key Issues**: 
   - Check that your OpenAI API key is valid
   - Ensure you have access to GPT-4o
   
2. **Timeout Errors**:
   - The tests have a 30-second timeout for API calls
   - Increase timeouts if needed (in tests or scripts)

3. **Model Availability**:
   - If GPT-4o is unavailable, the API might fall back to an older model
   - Check response errors for model availability messages

## Continuous Integration

These tests are designed to be run in both development and CI environments. The unit tests with mocks are safe to run in CI without making actual API calls.

For real API testing in CI, ensure environment variables are properly configured in your CI pipeline. 