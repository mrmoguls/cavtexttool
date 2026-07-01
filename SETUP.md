# Care-A-Van Connect — Setup Guide

This is a step-by-step guide to get the app running. You don't need to know how to code.

---

## Step 1: Create your Supabase account (free)

1. Go to **supabase.com** and sign up (it's free)
2. Click **"New project"**
   - Name: `careavanconnect`
   - Database password: make something secure, save it somewhere
   - Region: **US West (Oregon)** — closest to Redding, CA
3. Wait ~2 minutes for the project to spin up

---

## Step 2: Set up the database

1. In your Supabase project, click **"SQL Editor"** in the left sidebar
2. Click **"New query"**
3. Open the file `supabase/schema.sql` from this project and paste its contents into the editor
4. Click **"Run"** — you should see "Success" with no errors

---

## Step 3: Get your API keys

1. In Supabase, go to **Project Settings → API**
2. Copy:
   - **Project URL** (looks like `https://abcdefg.supabase.co`)
   - **anon public** key (long string under "Project API Keys")

---

## Step 4: Configure environment variables

1. Copy the file `.env.example` and rename it `.env.local`
2. Fill in:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   VITE_DISPATCH_PIN=choose-a-pin-you-like
   ```
3. Leave `VITE_VAPID_PUBLIC_KEY` blank for now — push notifications are a second step

---

## Step 5: Test locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173` — you should see the app. Add your name as a test driver in the Roster tab (dispatch PIN default is `1234` until you set yours).

---

## Step 6: Deploy to Netlify

1. Push this repo to GitHub (or use Netlify's drag-and-drop deploy with the `dist` folder)
2. In Netlify:
   - Connect your GitHub repo
   - Build command: `npm run build`
   - Publish directory: `dist`
3. Go to **Site settings → Environment variables** and add the same variables from your `.env.local`
4. Redeploy

Your app is now live at your Netlify URL. Share it with drivers.

---

## Step 7: Set up push notifications (optional but recommended)

Push notifications let the app alert drivers even when it's closed — this is what makes it actually replace texting.

1. Install the push key generator:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Copy the **Public Key** into `VITE_VAPID_PUBLIC_KEY` in your Netlify env vars
3. Copy the **Private Key** — you'll need it in a Supabase Edge Function (see `supabase/push-function/` folder — coming soon, or ask Claude to help set this up)

> **iPhone note:** Push notifications on iOS require the driver to first add the app to their Home Screen. The app has a built-in walkthrough screen that explains this step-by-step.

---

## Dispatch PIN

The default PIN is `1234`. **Change it** before giving the URL to drivers:
- In your `.env.local` and Netlify env vars, set `VITE_DISPATCH_PIN=yournewpin`
- Redeploy

This PIN is simple — it keeps drivers from accidentally accessing dispatch features, not from a determined attacker. For a 10-person company this is fine.

---

## Adding drivers

1. Open the app
2. Tap "I'm dispatch / admin" → enter PIN
3. Go to the **Roster** tab
4. Add each driver by name

Drivers just open the URL, tap their name, and they're in. No passwords.
