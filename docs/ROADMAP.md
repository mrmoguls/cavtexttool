# CAV Hub (Care-A-Van driver app) — Roadmap

_Last updated: 2026-11-08_

## Vision
One mobile-first app (PWA) that is the driver's **single starting point for work**. Drivers open one app with one login and find everything they need there, either built in or one tap away.

**Users:** mostly part-time drivers on phones, some with limited computer skills. Admins: Ryan, Julianne, Amber (dispatch), Doug (ops).

## Core principles (decided)
1. **One front door, separate systems behind it.** Build features natively when we own the data. **Link out** to specialized or regulated systems (Bambi, payroll time clock, Coggno training) instead of rebuilding them.
2. **Put links where they're needed.** Show the right link at the moment it's needed (e.g., "Clock in" and "Today's rides" on the shift card), not only in a links page.
3. **Simple for low-tech users.** Big tap targets, plain labels, real app icons on linked tiles.
4. **Admin-editable, not hard-coded.** Linked tiles, announcements, and settings are managed in Supabase so admins can change them without code changes.
5. **No patient information (PHI) in this app** unless/until we deliberately take on HIPAA requirements (see Open Questions).

## Status at a glance

| Item | Roadmap phase | Status |
|---|---|---|
| Login and roles (name + PIN, driver / attendant / dispatch / admin, drivers who also dispatch) | 1 | ✅ Built |
| Announcements with "I've read this" acknowledgment | 1 | ✅ Built (existed before scheduling work) |
| Schedule view (list + week), shift detail with start/end wording | 1 | ✅ Built |
| Shift swaps, give-ups, open-shift pickup, dispatch approvals, overtime warnings; sick calls by phone/text to dispatch, recorded by dispatch | 1 | ✅ Built |
| Availability | 1 | ✅ Read from the Google Sheet (Schedule tab); drivers can't edit it in the app yet |
| Line bidding by seniority; seniority from the Google Sheet (Roster tab) | 1 | ✅ Built |
| Daily roster for Bambi, AM start-time posting | 1 | ✅ Built |
| Weekly Bambi checklist (Bambi week view + list of changes since the week was entered) | 1 | ✅ Built |
| Start-time confirmation by drivers (replaces texting and thumbs-up replies) | 1 | ✅ Built |
| Phone push notifications (bell items, messages, announcements; tap opens the right screen; app-icon badge) | 1 | ✅ Built — needs the keys from SETUP.md Step 7 |
| Schedule export for Bambi (Excel with 3 sheets + CSV: weekly availability, dated shifts, week at a glance) | 1 | ✅ Built — match Bambi's import template once we have it |
| Open shifts to current staff wanting more hours **before new hires** | 1 | 🟡 Partly: a "part-time first" window exists; no "wants more hours" flag yet |
| Dispatch alert when an open shift has no taker within 24 hours | 1 | ✅ Built (banner + daily notification) |
| Assignment considers **hours available** | 1 | 🟡 Partly: availability days and seniority are used; weekly hour caps (e.g. "no more than 20 hrs") are only in free-text notes |
| Time-off requests (short notice flagged; approved days become open shifts) | 1 | ✅ Built |
| Linked-tile home screen (admin-editable) + links on today's shift card | 1 | ✅ Built — time clock, Coggno, handbook and Call Dispatch set; Bambi, accident instructions and repair quote links still to add |
| Always-visible bottom tabs; bell counts everything waiting ("Needs your attention") | 1 | ✅ Built |
| Pre-trip vehicle inspection | 1 | Done in **Bambi**; not in CAV Hub (no tile) |
| Incident / accident reports with photos | 2 | ⬜ Not started |
| Expiration tracking and alerts (synced from the sheet's Due Dates + Requirements tabs) | 2 | ✅ Built |
| Coggno integration ("X trainings due") | 2 | ⬜ Not started |
| "Ask a question" helper: AI answers from the Driver FAQ Google Doc; unanswered questions go to Ryan, his answer goes back to the driver and into the FAQ | 2 | ⬜ Not started — FAQ doc and tile are in place; doc being written from interviews |
| Fuel receipt photos tagged to van | 2 | ⬜ Not started |
| Tile tap tracking | 2 | ✅ Built (taps and people per tile, last 30 days) |
| Native ride view | 3 | Parked |
| Native time clock | Last / maybe never | Parked |

## Next steps
1. **Try it out (now, demo):** Amber walks through AM starts, the Bambi week and requests; one or two drivers try schedule, confirm, give-up and time off.
2. **Go live (setup, no new building):** Supabase project + migrations 001–009, PIN login and sheet sync functions, Google Sheet connection, scheduled alerts, hosting on Netlify, phone notification keys. Steps in SETUP.md.
3. **Trial (1–2 weeks):** Amber + 3–4 drivers on the live app alongside today's texting and Bambi routine.
4. **Roll out:** sign-up session so everyone installs the app, turns on notifications and stays signed in to Bambi, BBSI and Coggno on their phone. Then stop texting start times.
5. **Then Phase 2:** incident/accident reports with photos, "Ask a question" helper, Coggno "trainings due", fuel receipts.

## Native features (built in the app)
- **Scheduling:** view shifts, availability, time-off requests, shift swaps, open-shift pickup
  - Open shifts are offered to **current staff wanting more hours before new hires**
  - Future assignment logic should consider hours available, availability, and seniority
- **Announcements** with required **"I've read this"** acknowledgment (proof of receipt for policy changes and handbook sign-off)
- ~~**Pre-trip vehicle inspection**~~ — done in Bambi; not part of CAV Hub
- **Incident / accident reporting** from the phone, with photos
- **"Ask a question" helper:** a driver types a question; AI answers only from the Driver FAQ doc and shows which section it used. If the doc doesn't cover it, the question goes to Ryan (phone notification); his answer goes back to the driver and he can add it to the FAQ with one tap. Includes a list of questions asked. Question box carries a "no patient names or details" reminder. Cost: pennies per question
- **Expiration tracking & alerts:** driver's license, CPR/first aid, background check, required trainings. Notify the driver and admins before anything lapses
- **Fuel receipt photo upload** tagged to van (supports cost-per-van tracking)

## Linked tiles (link out, don't rebuild)
| Tile | Purpose | Notes |
|---|---|---|
| Bambi – Your Rides | Daily ride list | Open the installed app if possible; fall back to the app store or website |
| Time Clock (BBSI) | Clock in/out for payroll | Payroll provider may change within 12 months, so keep the link swappable |
| Coggno Training | Compliance training (login.coggno.com) | Ideally shares the Supabase login; show a "X trainings due" card on the home screen |
| Repair Quote Review ("Ask Ryan") | Van repair decisions | For drivers/staff who handle shop quotes |
| Employee Handbook (2027) | Reference | |
| Driver FAQ | Common questions (Google Doc) | Becomes the source for the "Ask a question" helper |
| Call Dispatch | Tap-to-call | 530-221-4826 |
| Accident / Emergency Instructions | What to do at a scene | |

**Tile data model (suggested):** `name`, `icon`, `url`, `fallback_url`, `roles_visible`, `sort_order`, `help_text` (short login help shown under the tile), `active`.

**Track tile taps** to learn what's used and what might be worth building natively later.

**Logins:** links don't sign drivers in to other apps. During onboarding, make sure each linked app stays signed in on the driver's phone.

## Build phases
- **Phase 1 – MVP:** login/roles, schedule + time-off + availability, announcements with acknowledgment, linked-tile home screen (admin-editable). Pre-trip inspection stays in Bambi.
- **Phase 2:** incident reports, expiration tracking/alerts, Coggno integration (shared auth + "trainings due" card), fuel receipts, tile usage tracking
- **Phase 3 (only after billing question is resolved):** consider native ride view to replace the Bambi link
- **Last / maybe never:** native time clock. If ever built, it must meet California meal/rest break and record-keeping rules and export cleanly to whichever payroll provider is in use

_Note: the scheduling work (shift scheduling, shift board, line bidding) was built in its own four steps; together they cover the scheduling part of Phase 1._

## Open questions
- **Bambi availability import:** Bambi's Partner API (v0.1) has trips, drivers and vehicles (read-only for drivers/vehicles) and webhooks, but **no availability or shift endpoints**. Availability has to go in through Bambi's own import screen or their support team. Get Bambi's import template so the export matches it exactly.
- **Bambi API, later:** with partner credentials, the app could read each driver's trips server-side to (a) suggest tomorrow's AM start times (30 min before the first pickup) and (b) show today's ride count on the shift card. Trips contain patient details, so only times/counts would be kept (see HIPAA below).
- **Does Bambi handle billing and trip logs, or only the driver view?** This decides whether replacing it is small or a major project (dispatch and billing would have to move too).
- **HIPAA:** if ride/patient data ever enters this app, confirm a BAA with Supabase (check plan requirements) and HIPAA-level controls first.
  - The in-app **messages** and shift-board **notes** are free text. Drivers could type patient details there by habit. Consider a short "no patient names or details" reminder on those boxes.
- **Automatic texts for people without notifications** (e.g. Twilio, a few cents per text plus carrier registration), if some drivers can't or won't turn on phone notifications.
- Payroll provider after BBSI (time clock tile target may change).
- Exact deep-link behavior for Bambi / BBSI apps on iPhone vs Android (test both; iPhone PWA is the strictest case).
- **Vans:** fuel receipts are tied to a van, so that feature will need a vans list (the roster deliberately leaves vans out).

## Parked ideas
- Native ride view (replacing Bambi), see Phase 3
- Native time clock, see "Last / maybe never"

## Decision log
- **2026-11-07:** Chose "one front door" hub model: native features for what we own, linked tiles for Bambi, payroll time clock, training (Coggno), and other tools. Decided not to rebuild ride management or payroll timekeeping for now.
- **2026-11-07:** Amber keeps entering teams in Bambi, weekly (clone a day). CAV Hub lists every change to an entered week as a Bambi update. Start times are posted the night before from the first pickup (−30 min) and drivers confirm in the app instead of by text.
- **2026-11-08:** No sick-call button for drivers. Sick calls must be a call or text to the dispatch phone, so they talk to a person; dispatch records it in the app.
- **2026-11-08:** Knowledge base = one Google Doc (Driver FAQ), linked as a tile now. The AI "Ask a question" helper will be built into CAV Hub in Phase 2 (drivers are already signed in, so questions can be routed to Ryan and answers sent back) rather than as a separate public bot.
- **2026-11-08:** Phone notifications use free web push (no texting service). Everything in the bell, messages and announcements go to the phone; signing out stops them on that phone.
- **2026-11-07:** The app is named **CAV Hub**.
- **2026-11-07:** Linked tiles built with empty placeholder links; admins add the real Bambi, accident-instructions and repair-quote links (BBSI time clock, Coggno training, handbook and call dispatch are set) in the app.
- **2026-11-07:** Pre-trip inspections stay in Bambi (already in use there); CAV Hub has no pre-trip feature or tile.
- **2026-11-07:** Expiration tracking uses the sheet's Due Dates tab as the source of truth (synced, read-only in the app). Reminders at 60 / 30 / 7 days and weekly once overdue; drivers report renewals in the app, admins update the sheet.
- **2026-11-07:** Time off: requested in the app, approved by dispatch; under 14 days' notice is flagged, not blocked; approved days' shifts become open shifts automatically.
- **2026-11-07:** Scheduling built: line bidding by seniority, shift board with dispatch approval and overtime warnings, daily roster for Bambi. The "Master Contact and Schedule" Google Sheet is the source of truth for seniority, role, FT/PT, phone and availability (synced into the app, read-only there).
