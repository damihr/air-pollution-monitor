# 🚀 Deploy to Vercel - Air Pollution Monitor

## Quick Deployment Steps:

### 1. Install Vercel CLI (if not already installed)
```bash
npm install -g vercel
```

### 2. Login to Vercel
```bash
vercel login
```

### 3. Deploy the Project
```bash
vercel
```

### 4. Set Environment Variables in Vercel Dashboard
Go to your project dashboard and add these environment variables:

```
WEATHER_API_KEY=5b7f19141c67b6c41f2c3406f29d3954
NASA_API_KEY=sZ0OCDuG6JaPYGo5yzoQS0GXERGSPgv6KN8c81hv
NODE_ENV=production
```

### 5. Redeploy with Environment Variables
```bash
vercel --prod
```

## Alternative: Deploy via GitHub

1. Push your code to GitHub
2. Connect your GitHub repo to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy automatically

## What This Will Give You:

✅ **Real Location Detection** - Works on HTTPS (required for geolocation)
✅ **Global Access** - Access from anywhere in the world
✅ **Real-time Data** - Live air pollution data
✅ **Mobile Friendly** - Works on phones and tablets
✅ **Professional URL** - Share with others

## Expected URL Format:
`https://air-pollution-monitor-xxx.vercel.app`

## Troubleshooting:

- **Geolocation not working?** Make sure you're using HTTPS (Vercel provides this automatically)
- **API errors?** Check that environment variables are set correctly
- **Build errors?** Make sure all dependencies are in package.json

## Features After Deployment:

🌍 **Real Location Detection** - Will work on the live site
📱 **Mobile Responsive** - Perfect on phones
🌐 **Global Access** - Share with anyone
📊 **Real Data** - Live air quality from OpenWeather
🚀 **Fast Loading** - Optimized for production
