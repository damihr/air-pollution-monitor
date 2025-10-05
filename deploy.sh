#!/bin/bash

echo "🚀 Deploying Air Pollution Monitor to Vercel..."

# Check if vercel is installed
if ! command -v vercel &> /dev/null; then
    echo "📦 Installing Vercel CLI..."
    npm install -g vercel
fi

# Login to Vercel (if not already logged in)
echo "🔐 Checking Vercel login status..."
vercel whoami || vercel login

# Deploy to Vercel
echo "🌍 Deploying to Vercel..."
vercel --prod

echo "✅ Deployment complete!"
echo "📝 Don't forget to set environment variables in Vercel dashboard:"
echo "   - WEATHER_API_KEY=5b7f19141c67b6c41f2c3406f29d3954"
echo "   - NASA_API_KEY=sZ0OCDuG6JaPYGo5yzoQS0GXERGSPgv6KN8c81hv"
echo "   - NODE_ENV=production"
