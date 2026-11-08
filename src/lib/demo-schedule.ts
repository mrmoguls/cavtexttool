// Demo-mode schedule: shifts generated from the demo line holders, two weeks back and four ahead.
// AM start times are posted through today; tomorrow's are left unset so the 2 pm warning shows.
import { DEMO_ASSIGNMENTS } from './demo-data'
import { SEED_BLOCKS, SEED_LINE_DAYS, SEED_LINES } from './scheduling/seed'
import { addDays, formatDate, formatTime, generateShifts, todayISO } from './scheduling'
import type { AppNotification, Shift } from '../types'

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
  cache = drafts.map((d, i) => {
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
  return JSON.parse(JSON.stringify(cache))
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
