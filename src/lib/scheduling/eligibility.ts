import type { Employee, Line } from '../../types'

export interface LineEligibilityOptions {
  /** PT employee opted in to "want full-time" for this bid period. */
  wantsFullTime?: boolean
}

/**
 * Why `emp` can't hold `line`. Empty array = eligible.
 * Rules: attendant lines → attendants only; driver lines → drivers only; gurney lines need the
 * qualification; FT lines → FT employees (or PT who opted in to full-time); PT lines → PT employees.
 */
export function lineIneligibility(
  emp: Pick<Employee, 'role' | 'employment_type' | 'gurney_qualified' | 'active'>,
  line: Pick<Line, 'role' | 'employment_type' | 'requires_gurney_qual' | 'active'>,
  opts: LineEligibilityOptions = {},
): string[] {
  const reasons: string[] = []
  if (!emp.active) reasons.push('Employee is inactive.')
  if (!line.active) reasons.push('Line is inactive.')

  if (line.role === 'attendant' && emp.role !== 'attendant') reasons.push('Attendant line — attendants only.')
  if (line.role === 'driver' && emp.role !== 'driver') reasons.push('Driver line — drivers only.')

  if (line.requires_gurney_qual && !emp.gurney_qualified) reasons.push('Requires gurney qualification.')

  if (line.employment_type === 'FT' && emp.employment_type === 'PT' && !opts.wantsFullTime) {
    reasons.push('Full-time line — part-time employees only if they opt in to full-time.')
  }
  if (line.employment_type === 'PT' && emp.employment_type === 'FT') {
    reasons.push('Part-time line — full-time employees bid on full-time lines.')
  }
  return reasons
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
