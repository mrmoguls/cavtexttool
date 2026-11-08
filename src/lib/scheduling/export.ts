// Schedule export (for loading driver availability into Bambi or another system).
// Bambi's Partner API has no availability endpoint, so this produces files for an import screen.
import type { Block, Employee, EmployeeContact, Line, LineAssignment, LineDay, Shift } from '../../types'
import { DISPLAY_WEEK, DOW_LONG, dowOf, isActiveOn } from './time'

export interface ExportOptions {
  /** Start time to use for blocks whose start varies (e.g. AM), by block id. 'HH:MM'. */
  variableStart: Record<string, string>
  /** '24h' → 13:00, '12h' → 1:00 PM */
  timeFormat: '24h' | '12h'
}

export interface AvailabilityRow {
  first_name: string
  last_name: string
  phone: string
  role: string
  day_of_week: string
  /** ISO day number: 1 = Monday … 7 = Sunday */
  day_number: number
  start: string
  end: string
  hours: number
  block: string
  line: string
  end_estimated: 'yes' | 'no'
}

export interface ShiftRow extends Omit<AvailabilityRow, 'line'> {
  date: string
  line: string
}

export function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return { first: parts[0], last: '' }
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] }
}

function toMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

function fmt(mins: number, format: ExportOptions['timeFormat']): string {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  const mm = String(m % 60).padStart(2, '0')
  if (format === '24h') return `${String(h).padStart(2, '0')}:${mm}`
  return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h >= 12 ? 'PM' : 'AM'}`
}

/**
 * Start and end for a block (or a dated shift's own posted times). Variable ends are estimated as
 * start + target hours + a 30-minute meal break (for shifts over 5 hours).
 */
export function exportTimes(
  block: Block, opts: ExportOptions, shift?: Pick<Shift, 'start_time' | 'end_time' | 'target_hours'>,
): { start: string; end: string; estimated: boolean } {
  const startRaw = shift?.start_time ?? block.default_start ?? opts.variableStart[block.id] ?? '06:00'
  const start = toMinutes(startRaw.slice(0, 5))
  const fixedEnd = shift?.end_time ?? (block.end_type === 'fixed' ? block.default_end : null)
  if (fixedEnd) return { start: fmt(start, opts.timeFormat), end: fmt(toMinutes(fixedEnd.slice(0, 5)), opts.timeFormat), estimated: false }
  const hours = Number(shift?.target_hours ?? block.target_paid_hours)
  const meal = hours > 5 ? 30 : 0
  return { start: fmt(start, opts.timeFormat), end: fmt(start + hours * 60 + meal, opts.timeFormat), estimated: true }
}

const ROLE: Record<string, string> = { driver: 'Driver', attendant: 'Attendant' }
const isoDay = (dow: number) => (dow === 0 ? 7 : dow)

/** Recurring weekly availability from who holds which line on `asOf` (flex lines have no fixed days). */
export function weeklyAvailability(input: {
  asOf: string
  employees: Employee[]
  contacts: EmployeeContact[]
  lines: Line[]
  lineDays: LineDay[]
  blocks: Block[]
  assignments: LineAssignment[]
  options: ExportOptions
}): AvailabilityRow[] {
  const blocks = new Map(input.blocks.map(b => [b.id, b]))
  const lines = new Map(input.lines.map(l => [l.id, l]))
  const emps = new Map(input.employees.map(e => [e.id, e]))
  const phone = new Map(input.contacts.map(c => [c.employee_id, c.phone]))
  const rows: AvailabilityRow[] = []
  for (const a of input.assignments) {
    if (!isActiveOn(a.effective_from, a.effective_to, input.asOf)) continue
    const e = emps.get(a.employee_id)
    const line = lines.get(a.line_id)
    if (!e || !e.active || !line || line.is_flex) continue
    const { first, last } = splitName(e.name)
    for (const dow of DISPLAY_WEEK) {
      const ld = input.lineDays.find(d => d.line_id === line.id && d.dow === dow)
      const block = ld && blocks.get(ld.block_id)
      if (!block) continue
      const t = exportTimes(block, input.options)
      rows.push({
        first_name: first, last_name: last, phone: phone.get(e.id) ?? '', role: ROLE[line.role] ?? line.role,
        day_of_week: DOW_LONG[dow], day_number: isoDay(dow), start: t.start, end: t.end,
        hours: Number(block.target_paid_hours), block: block.code, line: line.code, end_estimated: t.estimated ? 'yes' : 'no',
      })
    }
  }
  return rows.sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name) || a.day_number - b.day_number)
}

/** Every scheduled shift in a date range (includes shift-board changes and one-off shifts). */
export function datedShifts(input: {
  from: string
  to: string
  shifts: Shift[]
  employees: Employee[]
  contacts: EmployeeContact[]
  lines: Line[]
  blocks: Block[]
  options: ExportOptions
}): ShiftRow[] {
  const blocks = new Map(input.blocks.map(b => [b.id, b]))
  const lines = new Map(input.lines.map(l => [l.id, l]))
  const emps = new Map(input.employees.map(e => [e.id, e]))
  const phone = new Map(input.contacts.map(c => [c.employee_id, c.phone]))
  return input.shifts
    .filter(s => s.status === 'scheduled' && s.employee_id && s.date >= input.from && s.date <= input.to)
    .flatMap(s => {
      const e = emps.get(s.employee_id!)
      const block = blocks.get(s.block_id)
      if (!e || !block) return []
      const { first, last } = splitName(e.name)
      const t = exportTimes(block, input.options, s)
      const dow = dowOf(s.date)
      return [{
        first_name: first, last_name: last, phone: phone.get(e.id) ?? '', role: ROLE[s.role] ?? s.role,
        date: s.date, day_of_week: DOW_LONG[dow], day_number: isoDay(dow), start: t.start, end: t.end,
        hours: Number(s.target_hours), block: block.code, line: s.line_id ? lines.get(s.line_id)?.code ?? '' : '',
        end_estimated: t.estimated ? 'yes' as const : 'no' as const,
      }]
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.last_name.localeCompare(b.last_name))
}

/** One row per driver, Monday–Sunday columns ("08:30–17:00"), for reading at a glance. */
export function weeklyGrid(rows: AvailabilityRow[]): { name: string; phone: string; line: string; days: Record<string, string> }[] {
  const by = new Map<string, { name: string; phone: string; line: string; days: Record<string, string> }>()
  for (const r of rows) {
    const key = `${r.first_name} ${r.last_name}`.trim()
    const entry = by.get(key) ?? { name: key, phone: r.phone, line: r.line, days: {} }
    entry.days[r.day_of_week] = `${r.start}–${r.end}${r.end_estimated === 'yes' ? '*' : ''}`
    by.set(key, entry)
  }
  return [...by.values()]
}

export const AVAILABILITY_COLUMNS: { key: keyof AvailabilityRow; header: string }[] = [
  { key: 'first_name', header: 'First Name' }, { key: 'last_name', header: 'Last Name' }, { key: 'phone', header: 'Phone' },
  { key: 'role', header: 'Role' }, { key: 'day_of_week', header: 'Day of Week' }, { key: 'day_number', header: 'Day Number (1=Mon)' },
  { key: 'start', header: 'Start Time' }, { key: 'end', header: 'End Time' }, { key: 'hours', header: 'Target Hours' },
  { key: 'block', header: 'Shift Type' }, { key: 'line', header: 'Line' }, { key: 'end_estimated', header: 'End Time Estimated' },
]

export const SHIFT_COLUMNS: { key: keyof ShiftRow; header: string }[] = [
  { key: 'date', header: 'Date' }, { key: 'day_of_week', header: 'Day of Week' },
  ...AVAILABILITY_COLUMNS.filter(c => c.key !== 'day_of_week' && c.key !== 'day_number') as { key: keyof ShiftRow; header: string }[],
]

/** RFC 4180 CSV with a header row. Opens in Excel and most import screens. */
export function toCsv<T>(rows: T[], columns: { key: keyof T; header: string }[]): string {
  const cell = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [columns.map(c => cell(c.header)).join(','), ...rows.map(r => columns.map(c => cell(r[c.key])).join(','))].join('\r\n') + '\r\n'
}
