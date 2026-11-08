// Demo-mode schedule: shifts generated from the demo line holders, two weeks back and four ahead.
// AM start times are posted through today; tomorrow's are left unset so the 2 pm warning shows.
import { DEMO_ASSIGNMENTS } from './demo-data'
import { SEED_BLOCKS, SEED_LINE_DAYS, SEED_LINES } from './scheduling/seed'
import { addDays, formatDate, formatTime, generateShifts, todayISO } from './scheduling'
import { DEMO_SHEET } from './demo-sheet'
import { DEMO_EMPLOYEES } from './demo-data'
import { nameKey, parseDueDates, parseRequirements } from './sheet-sync'
import type { ComplianceItem, ComplianceRequirement, TimeOffRequest } from '../types'
import type { AppNotification, Bid, BidOptin, BidPeriod, BidPeriodLine, Shift, ShiftRequest } from '../types'
import { pacificToInstant } from './scheduling/board'

const today = todayISO()
export const DEMO_GENERATED_THROUGH = addDays(today, 27)

const AM_STARTS = ['05:15', '05:30', '05:45', '06:00', '05:30']

let cache: Shift[] | null = null

export function demoShifts(): Shift[] {
  if (cache) return JSON.parse(JSON.stringify(cache))
  const drafts = generateShifts({
    assignments: DEMO_ASSIGNMENTS, lines: SEED_LINES, lineDays: SEED_LINE_DAYS, blocks: SEED_BLOCKS,
    existing: [], from: addDays(today, -14), to: DEMO_GENERATED_THROUGH, createdBy: 'e-admin',
  })
  const shifts: Shift[] = drafts.map((d, i) => {
    const posted = d.start_time === null && d.date <= today
    return {
      ...d,
      id: `sh-${i}`,
      start_time: posted ? AM_STARTS[i % AM_STARTS.length] : d.start_time,
      start_posted_at: posted ? `${addDays(d.date, -1)}T22:30:00Z` : null,
      start_posted_by: posted ? 'e-disp' : null,
      created_at: '2026-10-01T17:00:00Z',
    }
  })
  // Rosa called out sick for a shift a few days out, so it's an open shift.
  const sick = shifts.find(s => s.employee_id === 'd4' && s.date >= addDays(today, 2))
  if (sick) Object.assign(sick, { employee_id: null, status: 'open', opened_at: `${today}T15:00:00Z` })
  cache = shifts
  return JSON.parse(JSON.stringify(cache))
}

function req(r: Partial<ShiftRequest> & Pick<ShiftRequest, 'id' | 'type' | 'status' | 'shift_id' | 'requester_id'>): ShiftRequest {
  return {
    swap_shift_id: null, target_id: null, claimant_id: null, previous_employee_id: null, note: null, decision_note: null,
    override_reason: null, ot_warnings: null, decided_by: null, decided_at: null,
    created_at: `${today}T16:00:00Z`, updated_at: `${today}T16:00:00Z`, ...r,
  }
}

/** A sick call (now an open shift Kevin asked for) and a give-up Linda posted on the board. */
export function demoRequests(): ShiftRequest[] {
  const shifts = demoShifts()
  const out: ShiftRequest[] = []
  const open = shifts.find(s => s.status === 'open')
  if (open) {
    out.push(req({ id: 'rq-sick', type: 'callout', status: 'approved', shift_id: open.id, requester_id: 'd4', previous_employee_id: 'd4', note: 'Fever', decided_at: `${today}T15:00:00Z`, created_at: `${today}T15:00:00Z` }))
    out.push(req({ id: 'rq-pickup', type: 'pickup', status: 'pending', shift_id: open.id, requester_id: 'd7', note: 'Happy to cover' }))
  }
  const giveup = shifts.find(s => s.employee_id === 'd6' && s.date >= addDays(today, 4))
  if (giveup) out.push(req({ id: 'rq-giveup', type: 'giveup', status: 'posted', shift_id: giveup.id, requester_id: 'd6', previous_employee_id: 'd6', note: 'Family wedding' }))
  return out
}

export function demoNotifications(): AppNotification[] {
  // Most recent AM shift with a posted start for Sarah Chen (demo driver on FT1).
  const todaysAm = demoShifts()
    .filter(s => s.date <= today && s.employee_id === 'd2' && s.start_time)
    .sort((a, b) => b.date.localeCompare(a.date))[0]
  if (!todaysAm) return []
  return [{
    id: 'n-demo-1',
    employee_id: 'd2',
    kind: 'am_start_posted',
    title: `Start time for ${formatDate(todaysAm.date)}: ${formatTime(todaysAm.start_time)}`,
    body: 'Posted by dispatch.',
    shift_id: todaysAm.id,
    read_at: null,
    created_at: `${addDays(todaysAm.date, -1)}T22:30:00Z`,
  }]
}

// ─── Bidding: Q1 2027 is open, some people have ranked already ────────────────

export function demoBidding(): { periods: BidPeriod[]; links: BidPeriodLine[]; bids: Bid[]; optins: BidOptin[] } {
  const closes = pacificToInstant(addDays(today, 5), '17:00').toISOString()
  const periods: BidPeriod[] = [{
    id: 'bp-q1', name: 'Q1 2027 lines', kind: 'quarter', start_date: '2027-01-03', end_date: '2027-04-03', status: 'open',
    closes_at: closes, opened_at: `${addDays(today, -2)}T17:00:00Z`, closed_at: null, published_at: null, reminder_sent_at: null,
    notes: 'Core lines for January–March.', created_by: 'e-admin', created_at: `${addDays(today, -3)}T17:00:00Z`,
  }]
  const codes = SEED_LINES.map(l => l.code)
  const links = codes.map(c => ({ id: `bpl-${c}`, bid_period_id: 'bp-q1', line_id: `line-${c}` }))
  const ranked: [string, string[], boolean][] = [
    ['d1', ['FT3', 'FT2'], false],      // Marcus
    ['d2', ['FT1', 'FT2'], false],      // Sarah
    ['d8', ['A1'], false],              // Angela
    ['d4', ['PT1', 'PT3', 'FT2'], true], // Rosa wants full-time if one is left
    ['d5', ['PT4', 'PT2'], false],      // David
  ]
  const bids: Bid[] = ranked.flatMap(([emp, list]) => list.map((c, i) => ({
    id: `bid-${emp}-${c}`, bid_period_id: 'bp-q1', employee_id: emp, line_id: `line-${c}`, rank: i + 1, created_at: `${addDays(today, -1)}T18:00:00Z`,
  })))
  const optins: BidOptin[] = ranked.map(([emp, , ft]) => ({
    id: `opt-${emp}`, bid_period_id: 'bp-q1', employee_id: emp, wants_full_time: ft, submitted_at: `${addDays(today, -1)}T18:00:00Z`,
  }))
  return { periods, links, bids, optins }
}

// ─── Certifications (from the made-up sheet) and a pending time-off request ──

export function demoCompliance(): { items: ComplianceItem[]; requirements: ComplianceRequirement[] } {
  const ids = new Map(DEMO_EMPLOYEES.map(e => [nameKey(e.name), e.id]))
  const items = parseDueDates(DEMO_SHEET.dueDates).flatMap((r, i) => {
    const id = ids.get(r.key)
    if (!id) return []
    return [{
      id: `ci-${i}`, employee_id: id, requirement: r.requirement, last_completed: r.last_completed, expiration_date: r.expiration_date,
      frequency_months: r.frequency_months, next_due: r.next_due, sheet_status: r.sheet_status, owner: r.owner, notes: r.notes,
      synced_at: `${today}T08:00:00Z`, last_alert_level: null, last_alerted_at: null, renewal_reported_at: null, renewal_note: null,
    } satisfies ComplianceItem]
  })
  return { items, requirements: parseRequirements(DEMO_SHEET.requirements) }
}

/** Linda asked for a few days off next week (short notice), waiting for dispatch. */
export function demoTimeOff(): TimeOffRequest[] {
  const lindaShift = demoShifts().find(s => s.employee_id === 'd6' && s.date >= addDays(today, 5) && s.status === 'scheduled')
  const start = lindaShift?.date ?? addDays(today, 6)
  return [{
    id: 'to-linda', employee_id: 'd6', start_date: start, end_date: addDays(start, 1), kind: 'personal', note: 'Moving apartments',
    status: 'pending', short_notice: true, shifts_released: null, decided_by: null, decided_at: null, decision_note: null,
    created_at: `${today}T15:30:00Z`, updated_at: `${today}T15:30:00Z`,
  }]
}

// ─── Linked tiles (same starters as migration 007; links left empty on purpose) ──

export function demoTiles(): import('../types').LinkTile[] {
  const all = ['driver', 'attendant', 'dispatcher', 'admin'] as const
  const t = (i: number, name: string, icon: string, roles: readonly string[], help: string | null, shift: string | null) => ({
    id: `tile-${i}`, name, icon, icon_url: null, url: null, fallback_url: null,
    roles_visible: [...roles] as import('../types').EmployeeRole[], sort_order: i * 10, help_text: help, shift_label: shift, active: true,
  })
  return [
    t(1, 'Bambi – Your Rides', 'car', all, 'Sign in with your Bambi driver login. Stay signed in on this phone.', "Today's rides"),
    t(2, 'Pre-trip inspection (Bambi)', 'clipboard-check', ['driver'], 'Do your pre-trip in Bambi before your first pickup.', 'Pre-trip'),
    t(3, 'Time Clock (BBSI)', 'clock', all, 'Clock in and out for payroll.', 'Clock in'),
    t(4, 'Pathway Training', 'graduation-cap', all, 'Required trainings (HIPAA, FWA, bloodborne pathogens …).', null),
    t(5, 'Employee Handbook (2027)', 'book-open', all, null, null),
    t(6, 'Call Dispatch', 'phone', ['driver', 'attendant'], null, null),
    t(7, 'Accident / Emergency Instructions', 'triangle-alert', ['driver', 'attendant'], 'What to do at the scene.', null),
    t(8, 'Repair Quote Review ("Ask Ryan")', 'wrench', ['dispatcher', 'admin'], 'For staff who handle shop quotes.', null),
  ]
}
