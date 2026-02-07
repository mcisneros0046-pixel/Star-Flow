# ✦ Star Flow — Deployment Guide

## What You're About to Do

You're going to take the Star Flow app that runs on your computer and put it on the internet so anyone with your domain name can use it.

**The chain:**

```
Your Code (GitHub) → Vercel (builds + hosts) → Your Domain (people visit)
```

- **GitHub** = where your code lives (like a Google Drive for code)
- **Vercel** = the server that runs your app (free for personal projects)
- **Your Domain** = the address people type (purchased through Squarespace)

---

## STEP 1: Create a GitHub Account

1. Go to **https://github.com** and click **Sign Up**
2. Use any email. Pick a username you like (this will be visible)
3. Verify your email when they send you one

**What is GitHub?** Think of it as iCloud for code. It stores your files online, tracks every change you make, and lets other services (like Vercel) read your code.

---

## STEP 2: Upload Your Project to GitHub

### Option A — Using GitHub's website (easiest, no terminal needed)

1. Log into GitHub
2. Click the green **"New"** button (top left), or go to **https://github.com/new**
3. Fill in:
   - **Repository name:** `star-flow`
   - **Description:** "A quiet cosmic companion for movement and healing"
   - **Visibility:** Choose **Public** (Vercel's free tier needs this) or **Private** (if you upgrade Vercel later)
   - ✅ Check **"Add a README file"**
4. Click **"Create repository"**
5. Now you need to upload your files. On your new repo page:
   - Click **"Add file"** → **"Upload files"**
   - Drag ALL these files/folders from the star-flow-app folder:
     - `package.json`
     - `vite.config.js`
     - `index.html`
     - `.gitignore`
     - `src/` folder (contains `main.jsx` and `App.jsx`)
   - Click **"Commit changes"**

### Option B — Using your terminal (the developer way)

If you have Git installed on your Mac, open Terminal and run:

```bash
# 1. Navigate to your project folder
cd path/to/star-flow-app

# 2. Initialize Git (tells Git "track this folder")
git init

# 3. Add all files
git add .

# 4. Make your first "commit" (a saved snapshot)
git commit -m "✦ Star Flow — first light"

# 5. Connect to GitHub (replace YOUR-USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR-USERNAME/star-flow.git

# 6. Push (upload) to GitHub
git branch -M main
git push -u origin main
```

You'll be asked to log in to GitHub the first time. Follow the prompts.

**Don't have Git?** Install it: https://git-scm.com/download/mac

---

## STEP 3: Connect GitHub to Vercel

1. Go to **https://vercel.com** and click **"Sign Up"**
2. Choose **"Continue with GitHub"** — this links your accounts
3. Authorize Vercel to access your GitHub

Now deploy your app:

4. Click **"Add New..."** → **"Project"**
5. You'll see a list of your GitHub repos. Find **"star-flow"** and click **"Import"**
6. Vercel auto-detects it's a Vite project. The settings should show:
   - **Framework Preset:** Vite
   - **Build Command:** `vite build`
   - **Output Directory:** `dist`
7. Click **"Deploy"**

**Wait about 60 seconds.** Vercel will:
- Download your code from GitHub
- Install React and Vite
- Build your app
- Put it on the internet

When it's done, you'll see a URL like: `star-flow-abc123.vercel.app`

**🎉 Your app is now live on the internet.** Click that URL — you should see Star Flow running in your browser.

---

## STEP 4: Connect Your Squarespace Domain

Right now your app lives at `something.vercel.app`. Let's make it live at YOUR domain instead.

### In Vercel:

1. Go to your Star Flow project in Vercel
2. Click **"Settings"** → **"Domains"**
3. Type your domain name (e.g., `starflow.com` or `app.starflow.com`) and click **"Add"**
4. Vercel will show you DNS records you need to add. It will say something like:

   ```
   Type: A
   Name: @
   Value: 76.76.21.21
   ```

   Or for a subdomain (`app.yourdomain.com`):

   ```
   Type: CNAME
   Name: app
   Value: cname.vercel-dns.com
   ```

   **Write these down or keep this page open.**

### In Squarespace:

1. Log into **Squarespace**
2. Go to **Settings** → **Domains**
3. Click on your domain name
4. Click **"DNS Settings"** or **"Advanced DNS Settings"**

**If pointing the WHOLE domain to your app** (e.g., starflow.com):
5. Find the existing **A Record** and edit it:
   - **Host:** `@`
   - **Value/Data:** `76.76.21.21` (the IP Vercel gave you)
6. Add a second A Record:
   - **Host:** `@`
   - **Value/Data:** `76.76.21.22`
7. Find or add a **CNAME** record:
   - **Host:** `www`
   - **Value/Data:** `cname.vercel-dns.com`

**If using a subdomain** (e.g., app.starflow.com):
5. Add a **CNAME** record:
   - **Host:** `app`
   - **Value/Data:** `cname.vercel-dns.com`

8. Click **Save**

### Wait for it:

DNS changes take **5 minutes to 48 hours** to spread across the internet. Usually it's under 30 minutes. During this time, your domain might not work yet — that's normal.

### Verify in Vercel:

1. Go back to Vercel → Settings → Domains
2. Your domain should eventually show a green checkmark ✅
3. Vercel automatically sets up HTTPS (the lock icon in browsers) for you

---

## STEP 5: The Auto-Update Magic (Step 3 from our plan)

Here's the beautiful part — **this is already set up.**

Because Vercel is connected to your GitHub repository, every time you push new code to GitHub, Vercel automatically rebuilds and redeploys your app. The process:

1. You edit `App.jsx` (add a feature, change colors, fix a bug)
2. You push the change to GitHub
3. Vercel detects the change (within seconds)
4. Vercel rebuilds your app (takes ~60 seconds)
5. Your live site updates automatically

**To push updates from your terminal:**

```bash
# After making changes to your files:
git add .
git commit -m "describe what you changed"
git push
```

**To push updates from GitHub's website:**
1. Go to your repo on GitHub
2. Navigate to the file you changed
3. Click the pencil icon (edit)
4. Make your changes
5. Click "Commit changes"
6. Vercel deploys automatically

---

## Your Project Structure Explained

```
star-flow-app/
├── index.html          ← The single HTML page (browser loads this first)
├── package.json        ← Lists what tools/libraries the project needs
├── vite.config.js      ← Tells the build tool "this is React"
├── .gitignore          ← Tells Git which files to skip uploading
└── src/
    ├── main.jsx        ← React entry point (renders App into the page)
    └── App.jsx         ← ✦ YOUR STAR FLOW APP (all the code lives here)
```

**When you want to change Star Flow, you edit `src/App.jsx`.** That's where all your components, styles, logic, and palette live. Everything else is just scaffolding that rarely changes.

---

## Troubleshooting

**"Build failed" on Vercel:**
- Check the build logs (Vercel shows them). Usually it's a typo in the code.
- Make sure the Framework Preset is set to "Vite"

**Domain not working after 1 hour:**
- Double-check DNS records match exactly what Vercel told you
- Try `https://` not `http://`
- Clear your browser cache or try in incognito mode

**App shows blank white page:**
- Open browser DevTools (Cmd+Option+I on Mac) → Console tab
- Look for red error messages — they'll point to the problem

**Lost your Vercel project:**
- Go to vercel.com, log in with GitHub, your project should still be there

---

## Quick Reference

| What | Where |
|------|-------|
| Edit your app | `src/App.jsx` |
| View your code | github.com/YOUR-USERNAME/star-flow |
| Check deployment status | vercel.com (your dashboard) |
| Manage your domain | squarespace.com → Domains → DNS |
| Your live app | yourdomain.com |

---

*Star Flow — from your computer to the cosmos.* ✦
