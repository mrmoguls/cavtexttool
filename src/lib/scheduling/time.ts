import type { Dow } from '../../types'

export const TIMEZONE = 'America/Los_Angeles'

export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

/** Order days are shown in on screen (Mon first). The payroll week is still Sun–Sat. */
export const DISPLAY_WEEK: Dow[] = [1, 2, 3, 4, 5, 6, 0]

/** '13:00' or '13:00:00' → '1:00 pm'. Empty for null. */
export function formatTime(t: string | null | undefined): string {
  if (!t) return ''
  const [hStr, mStr = '00'] = t.split(':')
  const h = Number(hStr)
  if (Number.isNaN(h)) return t
  const suffix = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${mStr.padStart(2, '0')} ${suffix}`
}

/** '08:30:00' → '08:30' (for <input type="time">). */
export function toHHMM(t: string | null | undefined): string {
  if (!t) return ''
  return t.slice(0, 5)
}

/** Today's date (YYYY-MM-DD) in Pacific time. */
export function todayISO(now: Date = new Date(), tz: string = TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function dowOf(dateISO: string): Dow {
  return new Date(`${dateISO}T12:00:00Z`).getUTCDay() as Dow
}

export function addDays(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Inclusive date range check; null `to` means open-ended. */
export function isActiveOn(from: string, to: string | null, dateISO: string): boolean {
  return from <= dateISO && (to === null || to >= dateISO)
}

export function rangesOverlap(aFrom: string, aTo: string | null, bFrom: string, bTo: string | null): boolean {
  const aEnd = aTo ?? '9999-12-31'
  const bEnd = bTo ?? '9999-12-31'
  return aFrom <= bEnd && bFrom <= aEnd
}

export function formatDate(dateISO: string): string {
  const d = new Date(`${dateISO}T12:00:00Z`)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}
