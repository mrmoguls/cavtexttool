# Care-A-Van Driver App — Roadmap

_Last updated: 2026-11-07_

## Vision
One mobile-first app (PWA) that is the driver's **single starting point for work**. Drivers open one app with one login and find everything they need there, either built in or one tap away.

**Users:** mostly part-time drivers on phones, some with limited computer skills. Admins: Ryan, Julianne, Amber (dispatch), Doug (ops).

## Core principles (decided)
1. **One front door, separate systems behind it.** Build features natively when we own the data. **Link out** to specialized or regulated systems (Bambi, payroll time clock, Pathway) instead of rebuilding them.
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
| Shift swaps, give-ups, open-shift pickup, sick call-outs, dispatch approvals, overtime warnings | 1 | ✅ Built |
| Availability | 1 | ✅ Read from the Google Sheet (Schedule tab); drivers can't edit it in the app yet |
| Line bidding by seniority; seniority from the Google Sheet (Roster tab) | 1 | ✅ Built |
| Daily roster for Bambi, AM start-time posting | 1 | ✅ Built |
| Open shifts to current staff wanting more hours **before new hires** | 1 | 🟡 Partly: a "part-time first" window exists; no "wants more hours" flag yet |
| Assignment considers **hours available** | 1 | 🟡 Partly: availability days and seniority are used; weekly hour caps (e.g. "no more than 20 hrs") are only in free-text notes |
| **Time-off requests** | 1 | ⬜ Not started |
| **Linked-tile home screen** (admin-editable) + links on the shift card | 1 | ⬜ Not started |
| **Pre-trip vehicle inspection** with photos | 1 | ⬜ Not started (needs a vans list and photo storage) |
| Incident / accident reports with photos | 2 | ⬜ Not started |
| Expiration tracking and alerts | 2 | ⬜ Not started — the sheet's **Requirements** and **Compliance Checklist** tabs already hold this data |
| Pathway integration ("X trainings due") | 2 | ⬜ Not started |
| Fuel receipt photos tagged to van | 2 | ⬜ Not started |
| Tile tap tracking | 2 | ⬜ Not started |
| Native ride view | 3 | Parked |
| Native time clock | Last / maybe never | Parked |

## Native features (built in the app)
- **Scheduling:** view shifts, availability, time-off requests, shift swaps, open-shift pickup
  - Open shifts are offered to **current staff wanting more hours before new hires**
  - Future assignment logic should consider hours available, availability, and seniority
- **Announcements** with required **"I've read this"** acknowledgment (proof of receipt for policy changes and handbook sign-off)
- **Pre-trip vehicle inspection** checklist with photos, dated and tied to van and driver (Title 22 / VSSI audit evidence)
- **Incident / accident reporting** from the phone, with photos
- **Expiration tracking & alerts:** driver's license, CPR/first aid, background check, required trainings. Notify the driver and admins before anything lapses
- **Fuel receipt photo upload** tagged to van (supports cost-per-van tracking)

## Linked tiles (link out, don't rebuild)
| Tile | Purpose | Notes |
|---|---|---|
| Bambi – Your Rides | Daily ride list | Open the installed app if possible; fall back to the app store or website |
| Time Clock (BBSI) | Clock in/out for payroll | Payroll provider may change within 12 months, so keep the link swappable |
| Pathway Training | Compliance training LMS | Ideally shares the Supabase login; show a "X trainings due" card on the home screen |
| Repair Quote Review ("Ask Ryan") | Van repair decisions | For drivers/staff who handle shop quotes |
| Employee Handbook (2027) | Reference | |
| Call Dispatch | Tap-to-call | |
| Accident / Emergency Instructions | What to do at a scene | |

**Tile data model (suggested):** `name`, `icon`, `url`, `fallback_url`, `roles_visible`, `sort_order`, `help_text` (short login help shown under the tile), `active`.

**Track tile taps** to learn what's used and what might be worth building natively later.

**Logins:** links don't sign drivers in to other apps. During onboarding, make sure each linked app stays signed in on the driver's phone.

## Build phases
- **Phase 1 – MVP:** login/roles, schedule + time-off + availability, announcements with acknowledgment, pre-trip inspection, linked-tile home screen (admin-editable)
- **Phase 2:** incident reports, expiration tracking/alerts, Pathway integration (shared auth + "trainings due" card), fuel receipts, tile usage tracking
- **Phase 3 (only after billing question is resolved):** consider native ride view to replace the Bambi link
- **Last / maybe never:** native time clock. If ever built, it must meet California meal/rest break and record-keeping rules and export cleanly to whichever payroll provider is in use

_Note: the scheduling work (shift scheduling, shift board, line bidding) was built in its own four steps; together they cover the scheduling part of Phase 1._

## Open questions
- **Does Bambi handle billing and trip logs, or only the driver view?** This decides whether replacing it is small or a major project (dispatch and billing would have to move too).
- **HIPAA:** if ride/patient data ever enters this app, confirm a BAA with Supabase (check plan requirements) and HIPAA-level controls first.
  - The in-app **messages** and shift-board **notes** are free text. Drivers could type patient details there by habit. Consider a short "no patient names or details" reminder on those boxes.
- Payroll provider after BBSI (time clock tile target may change).
- Exact deep-link behavior for Bambi / BBSI apps on iPhone vs Android (test both; iPhone PWA is the strictest case).
- **Vans:** pre-trip inspections and fuel receipts are tied to a van, so the app will need a vans list (earlier, the roster deliberately left vans out).

## Parked ideas
- Native ride view (replacing Bambi), see Phase 3
- Native time clock, see "Last / maybe never"

## Decision log
- **2026-11-07:** Chose "one front door" hub model: native features for what we own, linked tiles for Bambi, payroll time clock, Pathway, and other tools. Decided not to rebuild ride management or payroll timekeeping for now.
- **2026-11-07:** Scheduling built: line bidding by seniority, shift board with dispatch approval and overtime warnings, daily roster for Bambi. The "Master Contact and Schedule" Google Sheet is the source of truth for seniority, role, FT/PT, phone and availability (synced into the app, read-only there).
