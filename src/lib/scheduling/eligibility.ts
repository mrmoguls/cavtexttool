import type { Availability, Employee, Line, LineDay } from '../../types'
import { DISPLAY_WEEK, DOW_LONG } from './time'

export interface LineEligibilityOptions {
  /** No longer used: anyone can bid on any line they're qualified for. Kept for older callers. */
  wantsFullTime?: boolean
}

/**
 * Why `emp` can't hold `line`. Empty array = eligible.
 * Rules: attendant lines → attendants only; driver lines → drivers only; gurney lines need the
 * qualification. Full-time and part-time employees can bid on any line they're qualified for.
 */
export function lineIneligibility(
  emp: Pick<Employee, 'role' | 'employment_type' | 'gurney_qualified' | 'active' | 'bids_on_lines'>,
  line: Pick<Line, 'role' | 'employment_type' | 'requires_gurney_qual' | 'active'>,
  _opts: LineEligibilityOptions = {},
): string[] {
  const reasons: string[] = []
  if (!emp.active) reasons.push('Employee is inactive.')
  if (!line.active) reasons.push('Line is inactive.')

  if (line.role === 'attendant' && emp.role !== 'attendant') reasons.push('Attendant line — attendants only.')
  if (line.role === 'driver' && emp.role !== 'driver') reasons.push('Driver line — drivers only.')

  if (line.requires_gurney_qual && !emp.gurney_qualified) reasons.push('Requires gurney qualification.')

  if (emp.bids_on_lines === false) reasons.push('Backup drivers pick up open shifts instead of bidding on lines.')
  return reasons
}

/**
 * How a line's days fit someone's availability from the schedule sheet.
 * `blocked`: days the line needs them but they're not available (can't rank it).
 * `partial`: days they're only partly available (allowed, with a warning).
 * No availability on file = no restriction.
 */
export function availabilityFit(availability: Availability | null | undefined, lineDays: Pick<LineDay, 'dow'>[]) {
  const blocked: string[] = []
  const partial: string[] = []
  if (!availability) return { blocked, partial }
  const days = [...lineDays].sort((a, b) => DISPLAY_WEEK.indexOf(a.dow) - DISPLAY_WEEK.indexOf(b.dow))
  for (const d of days) {
    const v = Number(availability[String(d.dow)] ?? 0)
    if (v <= 0) blocked.push(DOW_LONG[d.dow])
    else if (v < 1) partial.push(DOW_LONG[d.dow])
  }
  return { blocked, partial }
}

/** All reasons someone can't rank a line, including availability (mirrors line_problem() in the database). */
export function lineBidProblems(
  emp: Pick<Employee, 'role' | 'employment_type' | 'gurney_qualified' | 'active' | 'bids_on_lines'>,
  line: Pick<Line, 'role' | 'employment_type' | 'requires_gurney_qual' | 'active'>,
  lineDays: Pick<LineDay, 'dow'>[],
  availability: Availability | null | undefined,
  opts: LineEligibilityOptions = {},
): { problems: string[]; warnings: string[] } {
  const problems = lineIneligibility(emp, line, opts)
  const fit = availabilityFit(availability, lineDays)
  if (fit.blocked.length) problems.push(`Not available ${fit.blocked.join(', ')} (schedule sheet).`)
  const warnings = fit.partial.length ? [`Only partly available ${fit.partial.join(', ')}.`] : []
  return { problems, warnings }
}

/**
 * Seniority order: earliest seniority date first; ties broken by hire order (hire_seq),
 * then by when they were added, then name. Missing values sort last.
 */
export function compareSeniority(
  a: Pick<Employee, 'seniority_date' | 'hire_seq' | 'created_at' | 'name'>,
  b: Pick<Employee, 'seniority_date' | 'hire_seq' | 'created_at' | 'name'>,
): number {
  const d = cmpNullable(a.seniority_date, b.seniority_date)
  if (d) return d
  const s = cmpNullable(a.hire_seq, b.hire_seq)
  if (s) return s
  const c = cmpNullable(a.created_at, b.created_at)
  if (c) return c
  return a.name.localeCompare(b.name)
}

function cmpNullable<T extends string | number>(a: T | null | undefined, b: T | null | undefined): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return a < b ? -1 : a > b ? 1 : 0
}

export function bySeniority<T extends Pick<Employee, 'seniority_date' | 'hire_seq' | 'created_at' | 'name'>>(list: T[]): T[] {
  return [...list].sort(compareSeniority)
}
