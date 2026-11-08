# CAV Hub — Setup Guide

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
5. `supabase/migrations/004_shift_board.sql` — shift board: give-ups, trades, sick calls, approvals
6. `supabase/migrations/005_bidding_and_sheet_sync.sql` — line bidding + Google Sheet sync fields
7. `supabase/migrations/006_compliance_and_time_off.sql` — certifications (expiration tracking) + time off
8. `supabase/migrations/007_link_tiles.sql` — linked tiles on the Home screen (starts with empty links)
9. `supabase/migrations/008_start_confirmations_and_bambi.sql` — start-time confirmations + weekly Bambi checklist
10. `supabase/migrations/009_push_notifications.sql` — phone notifications (does nothing until Step 7 is done)

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
3. Leave `VITE_VAPID_PUBLIC_KEY` blank for now — it's filled in at Step 7 (phone notifications)

---

## Step 5: Test locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173` — you should see the team list. Sign in as the admin you created in Step 2c.

> **No Supabase keys yet?** The app runs in **demo mode** with sample people and data. Try Pat Morgan (admin), Dana Reyes (dispatch) or any driver — every demo PIN is 0000. Demo changes reset when you reload.

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

## Step 7: Phone notifications (push)

Phone notifications alert people even when the app is closed: start times to confirm, schedule
changes, swap and time-off answers, certification reminders, messages and announcements. This is
what lets you stop texting start times. It's free (no per-message cost).

**What gets sent:** everything that appears in a person's bell, plus messages (dispatch → driver
goes to the driver; driver → dispatch goes to everyone who dispatches) and new announcements
(everyone). Tapping one opens the matching screen.

1. **Make the keys** (on any computer with Node installed):
   ```bash
   npx web-push generate-vapid-keys
   ```
   It prints a **Public Key** and a **Private Key**. Keep the private key secret.
2. **Make a long random secret** for the database to use when it calls the sender, for example:
   ```bash
   openssl rand -hex 32
   ```
3. **Deploy the sender.** Supabase → Edge Functions → Deploy new function → name it `send-push`,
   paste `supabase/functions/send-push/index.ts`, and turn **off** "Verify JWT".
4. **Add its secrets.** Edge Functions → Secrets:
   - `VAPID_PUBLIC_KEY` = the public key
   - `VAPID_PRIVATE_KEY` = the private key
   - `VAPID_SUBJECT` = `mailto:` plus an email the push services can contact (e.g. `mailto:ryan@yourcompany.com`)
   - `PUSH_WEBHOOK_SECRET` = the random secret from step 2
5. **Tell the database where to send.** Make sure migration 009 has been run, then in the SQL Editor
   (put in your project's address and the same secret):
   ```sql
   insert into push_config (function_url, secret)
   values ('https://YOUR-PROJECT.supabase.co/functions/v1/send-push', 'THE-SECRET-FROM-STEP-2')
   on conflict (id) do update set function_url = excluded.function_url, secret = excluded.secret;
   ```
   (Database → Extensions: check **pg_net** is on. Migration 009 turns it on if it can.)
6. **Give the app the public key.** In Netlify → Environment variables, set
   `VITE_VAPID_PUBLIC_KEY` = the public key, then redeploy.
7. **Turn it on, on each phone.** A "Turn on notifications" card shows on the Home screen
   (and on the Notifications screen). Tap **Turn on** → **Allow**.

**iPhones:** notifications only work once CAV Hub is added to the Home Screen (Safari → Share →
Add to Home Screen) and opened from that icon, on iOS 16.4 or newer. The card explains this on
iPhones that haven't done it. Android (Chrome) works from the browser or the installed app.

**Shared phones:** signing out ("Not you?") stops that person's notifications on that phone; the
next person who signs in and has notifications allowed gets theirs instead.

**Checking it works:** post a start time or send yourself a message from dispatch. Nothing
arriving? Supabase → Edge Functions → send-push → Logs, and confirm `push_config` has the right
address and the secret matches `PUSH_WEBHOOK_SECRET` exactly.

---

## Step 2d: Connect the Google Sheet (seniority and availability)

The **Master Contact and Schedule** sheet is the source of truth for seniority (Roster tab start
dates), role, FT/PT, active status, phone, and day-by-day availability (Schedule tab). The app only
reads it; it never writes to the sheet.

1. In Google Cloud Console, create a project (or use one), enable the **Google Sheets API**, create a
   **service account**, and download a **JSON key** for it.
2. Open the sheet → **Share** → add the service account's email (ends in
   `iam.gserviceaccount.com`) as **Viewer**.
3. Supabase → **Edge Functions → Secrets**: add `GOOGLE_SERVICE_ACCOUNT_JSON` with the whole JSON
   key file as the value.
4. Deploy `supabase/functions/sheet-sync/index.ts` as a function named `sheet-sync`, with
   **Verify JWT ON** (only signed-in admins can use it).
5. In the app: **Admin → Employees → Sync from Google Sheet → Preview changes → Apply**. Sync again
   any time the sheet changes.

How the sheet's wording is read:

| Sheet says | App sets |
|---|---|
| FT Driver / PT Driver | Driver, full-time / part-time |
| Backup Driver | Part-time driver who picks up open shifts (does not bid on lines) |
| FT Driver, dispatch | Driver who also has dispatch access |
| FT Gurney tech / PT Gurney tech | Attendant (plain "Gurney tech" is set as part-time and flagged) |
| Dispatch | Dispatcher |
| Owner / Exec / Director | Admin |
| Status: Active / Former / Confirm | Active / inactive / skipped until confirmed |

Availability: `1` = available, `0.5` = partly, blank = not available. People can't rank a line
that needs them on a day they're not available; partial days show a warning. The Notes column is
shown to admins during bid review.

After a sync, those fields are locked in the app ("Managed in the Google Sheet"). Gurney
qualification isn't in the sheet, so it's still set in the app.

The same sync also reads the **Due Dates** and **Requirements** tabs (certifications and how to
renew them). Update dates in the sheet, then sync.

### Automatic reminders (recommended)

In Supabase → **Database → Extensions**, enable `pg_cron`, then run:

```sql
-- Every morning around 7 am Pacific: certification reminders (60 / 30 / 7 days, weekly once
-- overdue) and a heads-up to dispatch about open shifts starting within 24 hours.
select cron.schedule('daily-alerts', '0 15 * * *', $$select public.run_daily_alerts()$$);

-- Hourly: "bidding closes soon" for people who haven't ranked, once, in the last 24 hours.
select cron.schedule('bid-reminders', '0 * * * *', $$select public.notify_bids_closing_soon()$$);
```

(Times are UTC; 15:00 UTC is 7 am in winter and 8 am in summer.) Admins can also send both kinds of
reminder by hand: **Admin → Certifications → Send reminders now**, and **Send reminder** on a bid.

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

## Working with Bambi

Bambi's API can't receive schedules, so Amber enters teams in Bambi. CAV Hub keeps that to once a
week plus a short list of changes:

1. **Weekly (e.g. Thursday): set up next week.** Dispatch → Roster → **Bambi week**. Each day lists
   the teams (Copy puts a day on the clipboard). Build the week in Bambi (clone a day, adjust), using
   a standard AM start. Then tap **This week is entered in Bambi**.
2. **After that, changes come to you.** Any change to that week — sick call, approved trade or
   pickup, time off, reassignment, posted start time — appears as **"Bambi needs N updates"** at the
   top of dispatch. Make the change in Bambi, tap **Done**.

## Start times and confirmations (replaces texting)

The night before, **Dispatch → AM starts**: enter each driver's **first pickup** from Bambi; the start
fills in 30 minutes earlier (change it if needed) → **Post**. The driver gets
"Tomorrow: start 7:30 am for an 8:00 am pickup" and a big **Confirm** button on their Home screen.
Dispatch sees **Waiting** / **Confirmed (time)** for each driver. Not confirmed by 7 pm
(`start_confirm_by` in settings) → a red banner. **Remind** sends it again; **Text** opens your
phone's messages with the same wording, for anyone who still hasn't answered. Changing a posted time
asks the driver to confirm again.

Drivers who turned on notifications (Step 7) get these on their phone right away; anyone else
sees them the next time they open the app.

## Weekly routine

- **Admin → Schedule → Generate shifts** about once a month to keep four or more weeks scheduled.
  Assigning someone a line fills in their shifts automatically up to that date.
- **Dispatch → AM starts** by 3:00 pm each day for the next day's early shifts (post Monday's on
  Friday if nobody works the weekend). A banner appears at 2:00 pm if any are missing.
- **Dispatch → Roster → Copy** pastes the day's roster into Bambi or a text. Tap any row to
  reassign it, make it an open shift, fill an uncovered slot, or see its history.
- **Dispatch → Requests** is the approval queue: give-ups, trades, open-shift requests and sick
  calls. Overtime (over 8 hrs/day or 40 hrs/week, or a shift over 10 hrs) shows as a warning;
  approving anyway needs a reason, which is saved.

## Line bidding

1. **Admin → Line bidding → New bid**: name, dates the lines run, deadline, and which lines.
2. **Open bidding**: everyone who bids gets a notification and ranks the lines they're eligible for
   (full-time employees rank full-time lines; part-timers can turn on "I want full-time").
3. **Close bidding and assign by seniority**: full-time employees in seniority order, then
   part-time. Each person gets their highest-ranked line that's still open.
4. **Review**: change anyone's result, see lines left open, see everyone's rankings and when they saved.
5. **Publish**: new lines start on the start date (current holders end the day before), shifts are
   created for the whole period, and everyone is told what they got.

To add a growth line mid-period, create it under **Admin → Lines** (category Growth), then use
**Offer by seniority** on it. To make it permanent, **Convert to core**.

## Linked tiles (Home screen)

Drivers open the app to a **Home** tab: today's shift with its buttons (Clock in, Today's rides), anything that needs attention (bidding, certifications, trade offers), and a list of
links to the other systems.

The starter tiles are Bambi, BBSI time clock, Coggno training, handbook, call dispatch, accident
instructions and repair quotes. The **BBSI time clock, Coggno training, handbook and call dispatch
links are set**; Bambi, accident instructions and repair quotes have **no links yet**. Tapping one says "This link isn't set
up yet. Ask the office." To fill them in: **Admin → Linked tiles** → tap a tile → paste the link →
Save. You can also:

- choose who sees each tile (drivers, attendants, dispatch, admins),
- give it a button on today's shift card ("Clock in"),
- add a fallback link (website or app store) for when an app doesn't open,
- add a short sign-in tip, an icon, or a real app-icon image,
- reorder tiles and see how many people tapped each one in the last 30 days.

Links can be web pages (`https://…`), phone numbers (`tel:+15305551234`), texts (`sms:…`),
email (`mailto:…`) or app links. Test app links on both iPhone and Android: an app link from an
installed home-screen app behaves differently on each.

## Certifications and time off

- **Drivers** see a Certifications card on their Schedule tab (red when something is overdue), with
  due dates and how to renew. After renewing, they tap **I renewed it**; admins see it under
  **Admin → Certifications → Renewed, waiting for the sheet**.
- An **expired driver's license or medical card** shows on the roster and as a warning when
  dispatch assigns that person a shift.
- **Time off:** drivers request a date range from their Schedule tab. Requests less than 14 days
  ahead are marked short notice (not blocked). Dispatch approves or denies under **Requests**;
  approving releases that person's shifts on those days as open shifts and notifies eligible
  coworkers. New schedules and bid results skip approved time off.

## Shift board rules

- Drivers can give up or trade a shift only if it starts **more than 48 hours** from now. Inside
  that, the app tells them to contact dispatch.
- Trades need the coworker to accept first, then dispatch approves.
- **Call out sick** skips the board: dispatch is notified, the shift becomes open, and eligible
  coworkers are told. Nobody has to find their own replacement.
- Open shifts (from sick calls, released give-ups, or dispatch) can be requested any time; dispatch
  picks who gets it.
- Optional: set `pt_first_open_shifts` to `true` in the `app_settings` table to give part-time
  employees the first 24 hours on new open shifts (`pt_first_hours` changes the window).

---

## Running the tests

```bash
npm test
```
