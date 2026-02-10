# Ordinance Parser - Deployment Guide for Render

## Overview
This guide covers deploying the Ordinance Parser to Render with:
- Backend (Flask API) as a Web Service
- Frontend (React) as a Static Site

## Prerequisites
- GitHub account
- Render account (free tier works)
- Anthropic API key

## Step 1: Prepare Your Repository

1. Push your code to GitHub with this structure:
```
your-repo/
├── backend/
│   ├── app.py
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   └── OrdinanceParser.jsx
    ├── package.json
    └── public/
```

2. Make sure you have a `.gitignore` that includes:
```
.env
__pycache__/
*.pyc
node_modules/
.DS_Store
```

## Step 2: Deploy Backend to Render

1. **Create a new Web Service:**
   - Go to Render Dashboard → New → Web Service
   - Connect your GitHub repository
   - Configure:
     - **Name:** `ordinance-parser-api` (or your choice)
     - **Region:** Choose closest to your users
     - **Branch:** `main`
     - **Root Directory:** `backend` (if using folder structure)
     - **Runtime:** Python 3
     - **Build Command:** `pip install -r requirements.txt`
     - **Start Command:** `gunicorn app:app`

2. **Add Environment Variables:**
   - Click "Environment" tab
   - Add:
     - `ANTHROPIC_API_KEY`: Your Anthropic API key
     - `FRONTEND_URL`: Will be your frontend URL (add this after frontend deployment)

3. **Deploy:**
   - Click "Create Web Service"
   - Wait for deployment (first deploy takes 2-3 minutes)
   - Note your backend URL: `https://ordinance-parser-api.onrender.com`

## Step 3: Deploy Frontend to Render (or Netlify/Vercel)

### Option A: Render Static Site

1. **Create a new Static Site:**
   - Go to Render Dashboard → New → Static Site
   - Connect same GitHub repository
   - Configure:
     - **Name:** `ordinance-parser`
     - **Root Directory:** `frontend`
     - **Build Command:** `npm install && npm run build`
     - **Publish Directory:** `build`

2. **Add Environment Variable:**
   - `REACT_APP_API_URL`: Your backend URL from Step 2
   - Example: `https://ordinance-parser-api.onrender.com`

### Option B: Netlify (Recommended for React)

1. Connect repo to Netlify
2. Build settings:
   - Base directory: `frontend`
   - Build command: `npm run build`
   - Publish directory: `build`
3. Environment variables:
   - `REACT_APP_API_URL`: Your Render backend URL

## Step 4: Update CORS Settings

Go back to your backend service on Render:
1. Add environment variable:
   - `FRONTEND_URL`: Your frontend URL
   - Example: `https://ordinance-parser.netlify.app`
2. Redeploy the backend

## Step 5: Test

1. Visit your frontend URL
2. Load the sample ordinance
3. Click "Extract Information"
4. Verify results appear

## Troubleshooting

### "No JSON found in response"
- Check Render logs for backend errors
- Verify `ANTHROPIC_API_KEY` is set correctly
- Check CORS settings

### CORS Errors
- Ensure `FRONTEND_URL` environment variable is set on backend
- Check that frontend is using correct `REACT_APP_API_URL`

### Backend won't start
- Check Render logs
- Verify `requirements.txt` is present
- Ensure start command is `gunicorn app:app`

### Free Tier Limitations
- Render free tier spins down after 15 minutes of inactivity
- First request after spin-down takes ~30 seconds
- Upgrade to paid tier for always-on service

## Environment Variables Reference

### Backend (Render Web Service)
```
ANTHROPIC_API_KEY=sk-ant-...
FRONTEND_URL=https://your-frontend-url.com
PORT=10000  # Render sets this automatically
```

### Frontend (Netlify/Render)
```
REACT_APP_API_URL=https://your-backend.onrender.com
```

## Cost
- **Free Tier:** Both backend and frontend free on Render
- **Paid:** $7/month for backend to avoid spin-down, frontend stays free

## Alternative Deployment Options

### Backend Alternatives:
- **Railway:** Similar to Render, $5/month
- **Fly.io:** Free tier available
- **Heroku:** $5/month minimum

### Frontend Alternatives:
- **Vercel:** Free for hobby projects (recommended)
- **Netlify:** Free tier is generous (recommended)
- **GitHub Pages:** Free but requires some config

## Production Checklist

- [ ] Backend deployed and responding at `/health` endpoint
- [ ] `ANTHROPIC_API_KEY` set and working
- [ ] Frontend deployed and loading
- [ ] `REACT_APP_API_URL` points to backend
- [ ] CORS configured with frontend URL
- [ ] Test extraction with sample text
- [ ] Monitor Render logs for errors
- [ ] Set up custom domain (optional)

## Support

If you run into issues:
1. Check Render logs (Dashboard → Service → Logs)
2. Test backend directly: `curl https://your-backend.onrender.com/health`
3. Check browser console for frontend errors
4. Verify environment variables are set correctly
