#!/bin/bash

# Deployment script for Vercel with clean build
set -e

echo "🧹 Cleaning build artifacts..."
rm -rf .next
rm -rf node_modules/.cache

echo "📦 Installing dependencies..."
npm install

echo "🧪 Testing OpenAI API key setup..."
curl -s "http://localhost:3000/api/debug-api-key" | python3 -m json.tool

echo "🔄 Deploying to Vercel production environment..."
vercel --prod

echo "🔍 After deployment, run these verification commands:"
echo "vercel logs --tail"
echo "curl https://YOUR-VERCEL-URL/api/debug-api-key"
echo "curl https://YOUR-VERCEL-URL/api/test-vision"

echo "✅ Deployment complete!" 