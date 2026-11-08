// Demo-mode schedule: shifts generated from the demo line holders, two weeks back and four ahead.
// AM start times are posted through today; tomorrow's are left unset so the 2 pm warning shows.
import { DEMO_ASSIGNMENTS } from './demo-data'
import { SEED_BLOCKS, SEED_LINE_DAYS, SEED_LINES } from './scheduling/seed'
import { addDays, formatDate, formatTime, generateShifts, todayISO } from './scheduling'
import type { AppNotification, Shift, ShiftRequest } from '../types'

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
