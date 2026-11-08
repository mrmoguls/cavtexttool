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

Run each file below in **Supabase → SQL Editor → New query → paste → Run**, in this order.
Each one should finish with "Success". They're safe to run again if you're unsure.

1. `supabase/schema.sql` — messages and announcements
2. `supabase/migrations/001_employees_and_auth.sql` — employees, logins, security rules
3. `supabase/migrations/002_scheduling_setup.sql` — blocks, lines, coverage (with starter data)
4. `supabase/migrations/003_shifts_and_notifications.sql` — dated shifts and in-app notifications

> **Already running the app?** Do the same: run 001 then 002. Your existing drivers become
> employees automatically, but **nobody can sign in until they have a phone number on file**
> (see Step 2c). Plan to do Step 2b and 2c right after.

### Step 2a: Turn off public sign-ups

Supabase → **Authentication → Sign In / Providers** → turn **off** "Allow new users to sign up".
The app creates logins itself; this stops strangers from making accounts.

### Step 2b: Deploy the PIN login function

People sign in by tapping their name and entering a **4-digit PIN = the last 4 digits of their
phone number**. A small server function checks it.

1. Supabase → **Edge Functions → Deploy a new function → Via editor**
2. Name it exactly `pin-login`
3. Paste the contents of `supabase/functions/pin-login/index.ts` and **Deploy**
4. Open the function's **Details / Settings** and turn **off "Verify JWT"**
   (people aren't signed in yet when they use it)
5. Optional: under **Edge Functions → Secrets**, add `PIN_LOGIN_SECRET` with any long random text

After 5 wrong PINs in a row, that person is locked out for 15 minutes.

### Step 2c: Make yourself the first admin

In the SQL Editor, change the name and phone below, then run it:

```sql
with me as (
  insert into employees (name, role, employment_type, seniority_date)
  values ('Your Name', 'admin', 'FT', current_date)
  returning id
)
insert into employee_contacts (employee_id, phone)
select id, '530-555-1234' from me;
```

If you're already in the list (from the old app), use this instead:

```sql
update employees set role = 'admin' where name = 'Your Name';
insert into employee_contacts (employee_id, phone)
select id, '530-555-1234' from employees where name = 'Your Name'
on conflict (employee_id) do update set phone = excluded.phone;
```

Now sign in to the app as yourself (PIN = last 4 of that phone number) and go to
**Admin → Employees** to add everyone else's phone number, role, FT/PT, seniority date and
gurney qualification.

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
   ```
3. Leave `VITE_VAPID_PUBLIC_KEY` blank for now — push notifications are a second step

---

## Step 5: Test locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173` — you should see the team list. Sign in as the admin you created in Step 2c.

> **No Supabase keys yet?** The app runs in **demo mode** with sample people and data. Try Pat Morgan (admin, PIN 0100), Dana Reyes (dispatch, PIN 0101), or any driver — the PIN screen shows their demo PIN. Demo changes reset when you reload.

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

## Who sees what

| Role | Sees |
|---|---|
| Driver / Attendant | Announcements, their own messages, their own schedule |
| Dispatcher | Everything above for everyone, plus the daily Roster, AM start times, Posts and Inbox |
| Admin | Everything, plus the **Admin** tab: employees, blocks, lines, coverage, schedule |

This is enforced by the database (Row Level Security), not just hidden in the app.

**About the PIN:** the last 4 of a phone number is easy to remember but also easy for a coworker
to know. The lockout limits guessing. If that ever becomes a problem, ask Claude to add
custom PINs.

---

## Adding people

1. Sign in as an admin
2. **Admin → Employees → Add employee**
3. Enter their name, role, FT/PT, phone number, seniority date, and gurney qualification

They open the app, tap their name, and enter the last 4 digits of their phone number.
To remove someone, turn off **Active** (their history is kept).

---

## Weekly routine

- **Admin → Schedule → Generate shifts** about once a month to keep four or more weeks scheduled.
  Assigning someone a line fills in their shifts automatically up to that date.
- **Dispatch → AM starts** by 3:00 pm each day for the next day's early shifts (post Monday's on
  Friday if nobody works the weekend). A banner appears at 2:00 pm if any are missing.
- **Dispatch → Roster → Copy** pastes the day's roster into Bambi or a text.

---

## Running the tests

```bash
npm test
```
