# Unicorn Factory Deployment Guide

## Current Issue
Your frontend is deployed on Cloudflare Pages but trying to connect to `localhost:4000`, which causes the "TypeError: Failed to fetch" error.

## Solution Steps

### 1. Deploy Backend Server

Choose one of these platforms to deploy your backend:

#### Option A: Render.com (Recommended - Free tier available)
1. Go to [render.com](https://render.com) and sign up
2. Connect your GitHub repository
3. Create a new "Web Service"
4. Configure:
   - **Build Command**: `cd server && npm install && npm run build`
   - **Start Command**: `cd server && npm start`
   - **Environment**: Node
   - **Root Directory**: `Unicorn_Factory`
5. Deploy and note the URL (e.g., `https://unicorn-factory-api.onrender.com`)

#### Option B: Railway.app
1. Go to [railway.app](https://railway.app) and sign up
2. Connect your GitHub repository
3. Create a new project from your repo
4. Configure the service to use the `server` directory
5. Deploy and note the URL

#### Option C: Vercel (Serverless)
1. Go to [vercel.com](https://vercel.com) and sign up
2. Import your GitHub repository
3. Configure:
   - **Root Directory**: `Unicorn_Factory/server`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Deploy and note the URL

### 2. Update Configuration

Once you have your backend URL, update the following:

#### Update netlify.toml
Replace `https://unicorn-factory-api.onrender.com` with your actual backend URL:

```toml
[[redirects]]
  from = "/api/*"
  to = "https://YOUR_ACTUAL_BACKEND_URL/:splat"
  status = 200
```

#### Alternative: Set Environment Variable
In your Cloudflare Pages deployment settings, add:
- **Variable Name**: `VITE_API_URL`
- **Value**: `https://YOUR_ACTUAL_BACKEND_URL`

### 3. Redeploy Frontend

After updating the configuration:
1. Commit and push your changes
2. Cloudflare Pages will automatically redeploy
3. Test the form submission

## Quick Fix for Testing

If you want to test locally first:
1. Start your backend server: `cd server && npm run dev`
2. Start your frontend: `cd client && npm run dev`
3. The frontend will connect to `http://localhost:4000`

## Current Configuration

- **Frontend**: Deployed on Cloudflare Pages at `https://unicorn-factory10.pages.dev`
- **Backend**: Needs to be deployed (currently only runs locally)
- **API URL**: Configured to use `/api` redirect in production

## Next Steps

1. Deploy your backend to one of the platforms above
2. Update the netlify.toml with the correct backend URL
3. Redeploy your frontend
4. Test the form submission

The "TypeError: Failed to fetch" error will be resolved once the backend is properly deployed and accessible.
