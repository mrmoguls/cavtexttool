// Shift board rules shared by the app and demo mode. The database functions in
// supabase/migrations/004_shift_board.sql enforce the same rules for drivers.
import type { Block, Employee, RequestStatus, Shift, ShiftRequest } from '../../types'
import { formatDate, TIMEZONE } from './time'
import { payrollWeekStart } from './shifts'

/** Unposted variable starts (AM) are treated as 5:00 am for the cutoff. */
export const ASSUMED_VARIABLE_START = '05:00'

export const ACTIVE_STATUSES: RequestStatus[] = ['posted', 'pending_partner', 'pending']

export function isActive(r: Pick<ShiftRequest, 'status'>): boolean {
  return ACTIVE_STATUSES.includes(r.status)
}

// ─── Time ─────────────────────────────────────────────────────────────────────

function tzOffsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(at)
  const get = (t: string) => Number(parts.find(p => p.type === t)!.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return Math.round((asUtc - at.getTime()) / 60000)
}

/** A Pacific wall-clock date + time as an instant. Handles daylight saving. */
export function pacificToInstant(dateISO: string, time: string, tz: string = TIMEZONE): Date {
  const [y, m, d] = dateISO.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  const first = tzOffsetMinutes(new Date(guess), tz)
  let t = guess - first * 60000
  const second = tzOffsetMinutes(new Date(t), tz)
  if (second !== first) t = guess - second * 60000
  return new Date(t)
}

export function shiftStartsAt(shift: Pick<Shift, 'date' | 'start_time'>, block: Pick<Block, 'default_start'>): Date {
  const time = (shift.start_time ?? block.default_start ?? ASSUMED_VARIABLE_START).slice(0, 5)
  return pacificToInstant(shift.date, time)
}

export function hoursUntilStart(shift: Pick<Shift, 'date' | 'start_time'>, block: Pick<Block, 'default_start'>, now: Date = new Date()): number {
  return (shiftStartsAt(shift, block).getTime() - now.getTime()) / 3_600_000
}

/** True when the shift starts sooner than the cutoff (default 48 hours): drivers must call dispatch. */
export function insideCutoff(
  shift: Pick<Shift, 'date' | 'start_time'>, block: Pick<Block, 'default_start'>, cutoffHours = 48, now: Date = new Date(),
): boolean {
  return hoursUntilStart(shift, block, now) < cutoffHours
}

// ─── Eligibility ──────────────────────────────────────────────────────────────

/**
 * Why `emp` can't work `shift` (null = they can). Mirrors work_problem() in the database:
 * right role, gurney qualification for gurney driver shifts, not already working that day.
 * `ignoreShiftId` is a shift of theirs that's being traded away.
 */
export function workProblem(
  emp: Pick<Employee, 'id' | 'role' | 'active' | 'gurney_qualified'> | undefined,
  shift: Pick<Shift, 'id' | 'date' | 'role'>,
  block: Pick<Block, 'requires_gurney_qual'> | undefined,
  allShifts: Pick<Shift, 'id' | 'date' | 'employee_id' | 'status'>[],
  ignoreShiftId?: string | null,
): string | null {
  if (!emp || !emp.active) return 'Not an active employee.'
  if (emp.role !== shift.role) return `This is a ${shift.role} shift.`
  if (shift.role === 'driver' && block?.requires_gurney_qual && !emp.gurney_qualified) return 'Requires gurney qualification.'
  const busy = allShifts.some(o =>
    o.employee_id === emp.id && o.date === shift.date && o.status === 'scheduled' &&
    o.id !== shift.id && o.id !== ignoreShiftId)
  if (busy) return 'Already working that day.'
  return null
}

// ─── Overtime ─────────────────────────────────────────────────────────────────

export interface OvertimeLimits {
  dailyHours: number
  weeklyHours: number
  secondMealHours: number
}

export function overtimeLimits(settings: Record<string, unknown>): OvertimeLimits {
  const n = (k: string, d: number) => (typeof settings[k] === 'number' ? (settings[k] as number) : d)
  return { dailyHours: n('daily_ot_hours', 8), weeklyHours: n('weekly_ot_hours', 40), secondMealHours: n('second_meal_hours', 10) }
}

/**
 * California overtime warnings for `employeeId` if they pick up `add` and drop `remove`
 * (by target paid hours). Payroll week is Sunday–Saturday. Warnings, not blocks.
 */
export function overtimeWarnings(opts: {
  employeeId: string
  add: Pick<Shift, 'id' | 'date' | 'target_hours' | 'block_id'>[]
  remove?: Pick<Shift, 'id'>[]
  shifts: Pick<Shift, 'id' | 'date' | 'target_hours' | 'employee_id' | 'status'>[]
  blocksById?: Map<string, Pick<Block, 'code'>>
  limits: OvertimeLimits
}): string[] {
  const removed = new Set((opts.remove ?? []).map(s => s.id))
  const addedIds = new Set(opts.add.map(s => s.id))
  const mine = opts.shifts
    .filter(s => s.employee_id === opts.employeeId && s.status === 'scheduled' && !removed.has(s.id) && !addedIds.has(s.id))
    .map(s => ({ date: s.date, hours: Number(s.target_hours) }))
  const after = [...mine, ...opts.add.map(s => ({ date: s.date, hours: Number(s.target_hours) }))]
  const out: string[] = []
  const seen = new Set<string>()
  const push = (k: string, msg: string) => { if (!seen.has(k)) { seen.add(k); out.push(msg) } }

  for (const s of opts.add) {
    const hours = Number(s.target_hours)
    const code = opts.blocksById?.get(s.block_id)?.code ?? 'This shift'
    if (hours > opts.limits.secondMealHours) {
      push(`meal|${s.id}`, `${code} on ${formatDate(s.date)} is ${hours} hrs — a second meal break is required.`)
    }
    const day = after.filter(x => x.date === s.date).reduce((n, x) => n + x.hours, 0)
    if (day > opts.limits.dailyHours) {
      push(`day|${s.date}`, `${formatDate(s.date)}: ${day} hrs that day — over ${opts.limits.dailyHours} (daily overtime).`)
    }
    const wk = payrollWeekStart(s.date)
    const week = after.filter(x => payrollWeekStart(x.date) === wk).reduce((n, x) => n + x.hours, 0)
    if (week > opts.limits.weeklyHours) {
      push(`week|${wk}`, `Week of ${formatDate(wk)}: ${week} hrs — over ${opts.limits.weeklyHours} (weekly overtime).`)
    }
  }
  return out
}

// ─── Labels ───────────────────────────────────────────────────────────────────

export const REQUEST_TYPE_LABEL: Record<ShiftRequest['type'], string> = {
  giveup: 'Give-up', swap: 'Trade', pickup: 'Open shift request', callout: 'Sick call', assign: 'Dispatch change',
}

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  posted: 'On the board', pending_partner: 'Waiting for coworker', pending: 'Waiting for dispatch',
  approved: 'Approved', denied: 'Denied', declined: 'Declined', cancelled: 'Cancelled',
}
