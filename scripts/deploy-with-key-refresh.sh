#!/bin/bash

# Deployment script for Vercel with API key refresh
set -e

echo "🧹 Cleaning build artifacts..."
rm -rf .next
rm -rf node_modules/.cache

echo "📦 Installing dependencies..."
npm install

echo "🧪 Testing OpenAI API key locally..."
curl -s "http://localhost:3000/api/test-openai-key" | python3 -m json.tool

echo "🔄 Setting OpenAI API key in Vercel..."
echo "Running command: vercel env add OPENAI_API_KEY production"
vercel env add OPENAI_API_KEY production

echo "🚀 Triggering production deployment..."
vercel --prod

echo "📋 Post-deployment verification instructions:"
echo "1. Check Vercel logs for OpenAI key messages: vercel logs --tail"
echo "2. Verify key is working: curl https://YOUR-VERCEL-URL/api/test-openai-key"
echo "3. Test image analysis with: curl -X POST -H \"Content-Type: application/json\" -d '{\"image\":\"BASE64_IMAGE\",\"healthGoal\":\"general health\"}' https://YOUR-VERCEL-URL/api/analyzeImage"

echo "✅ Deployment complete!" 