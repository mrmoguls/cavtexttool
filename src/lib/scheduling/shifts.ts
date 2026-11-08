import type {
  Block, CoverageRequirement, CrewRole, Employee, Line, LineAssignment, LineDay, Shift,
} from '../../types'
import { addDays, dowOf, formatDate, formatTime, isActiveOn, TIMEZONE } from './time'

export type ShiftDraft = Omit<Shift, 'id' | 'created_at'>

// ─── Dates ────────────────────────────────────────────────────────────────────

export function datesBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

/** Monday of the week containing `dateISO` (for the Mon–Sun week view). */
export function mondayOf(dateISO: string): string {
  const dow = dowOf(dateISO)
  return addDays(dateISO, dow === 0 ? -6 : 1 - dow)
}

/** Sunday that starts the payroll week (Sun–Sat) containing `dateISO`. */
export function payrollWeekStart(dateISO: string): string {
  return addDays(dateISO, -dowOf(dateISO))
}

/** Current Pacific wall-clock time as 'HH:MM'. */
export function nowHHMM(now: Date = new Date(), tz: string = TIMEZONE): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)
}

// ─── Generation ───────────────────────────────────────────────────────────────

export interface GenerateInput {
  assignments: LineAssignment[]
  lines: Line[]
  lineDays: LineDay[]
  blocks: Block[]
  existing: Pick<Shift, 'assignment_id' | 'date'>[]
  from: string
  to: string
  createdBy?: string | null
  /** Approved time off: no shifts are generated for these people on these days. */
  timeOff?: { employee_id: string; start_date: string; end_date: string }[]
}

/**
 * Concrete shifts for every line assignment active on each day of the range.
 * Skips days already generated for that assignment (so it is safe to run repeatedly),
 * inactive lines/blocks, and flex lines (no fixed blocks).
 */
export function generateShifts(input: GenerateInput): ShiftDraft[] {
  const lines = new Map(input.lines.map(l => [l.id, l]))
  const blocks = new Map(input.blocks.map(b => [b.id, b]))
  const done = new Set(input.existing.filter(s => s.assignment_id).map(s => `${s.assignment_id}|${s.date}`))
  const out: ShiftDraft[] = []

  for (const date of datesBetween(input.from, input.to)) {
    const dow = dowOf(date)
    for (const a of input.assignments) {
      if (!isActiveOn(a.effective_from, a.effective_to, date)) continue
      const line = lines.get(a.line_id)
      if (!line || !line.active || line.is_flex) continue
      const ld = input.lineDays.find(d => d.line_id === line.id && d.dow === dow)
      if (!ld) continue
      const block = blocks.get(ld.block_id)
      if (!block || !block.active) continue
      if (done.has(`${a.id}|${date}`)) continue
      if (input.timeOff?.some(t => t.employee_id === a.employee_id && t.start_date <= date && t.end_date >= date)) continue
      out.push({
        date,
        block_id: block.id,
        role: line.role,
        employee_id: a.employee_id,
        line_id: line.id,
        assignment_id: a.id,
        source: 'line',
        status: 'scheduled',
        start_time: block.start_type === 'fixed' ? block.default_start : null,
        end_time: block.end_type === 'fixed' ? block.default_end : null,
        start_posted_at: null,
        start_posted_by: null,
        target_hours: Number(block.target_paid_hours),
        notes: null,
        created_by: input.createdBy ?? null,
      })
    }
  }
  return out
}

// ─── Display ──────────────────────────────────────────────────────────────────

export function needsPostedStart(shift: Pick<Shift, 'start_time'>, block: Pick<Block, 'start_type'>): boolean {
  return block.start_type === 'variable' && !shift.start_time
}

/** "5:30 am – last drop-off", "Start not posted yet – trips complete", "8:30 am – 5:00 pm". */
export function shiftTimeLabel(shift: Pick<Shift, 'start_time' | 'end_time'>, block: Block): string {
  const start = shift.start_time
    ? formatTime(shift.start_time)
    : block.start_type === 'variable' ? 'Start not posted yet' : formatTime(block.default_start)
  const end = shift.end_time
    ? formatTime(shift.end_time)
    : block.end_type === 'variable'
      ? (block.start_type === 'variable' ? 'trips complete' : 'last drop-off')
      : formatTime(block.default_end)
  return `${start} – ${end}`
}

// ─── AM start-time posting ────────────────────────────────────────────────────

export type AmStartPhase = 'none' | 'pending' | 'warning' | 'overdue'

/**
 * Variable-start shifts for `date` and whether their times still need posting.
 * Phase is relative to the day before `date`: 'warning' after the warning time (2 pm),
 * 'overdue' after the deadline (3 pm); 'none' when everything is posted.
 */
export function amStartStatus(opts: {
  date: string
  shifts: Shift[]
  blocksById: Map<string, Block>
  today: string
  now: string // 'HH:MM' Pacific
  warning?: string
  deadline?: string
}): { variable: Shift[]; unset: Shift[]; phase: AmStartPhase } {
  const variable = opts.shifts.filter(s =>
    s.date === opts.date && s.status === 'scheduled' && s.employee_id &&
    opts.blocksById.get(s.block_id)?.start_type === 'variable')
  const unset = variable.filter(s => !s.start_time)
  if (unset.length === 0) return { variable, unset, phase: 'none' }
  const dayBefore = addDays(opts.date, -1)
  if (opts.today > dayBefore) return { variable, unset, phase: 'overdue' }
  if (opts.today < dayBefore) return { variable, unset, phase: 'pending' }
  const warning = opts.warning ?? '14:00'
  const deadline = opts.deadline ?? '15:00'
  const phase: AmStartPhase = opts.now >= deadline ? 'overdue' : opts.now >= warning ? 'warning' : 'pending'
  return { variable, unset, phase }
}

// ─── Roster ───────────────────────────────────────────────────────────────────

export interface RosterRow {
  role: CrewRole
  shift: Shift | null
  name: string | null
  /** No one is scheduled for this required position. */
  uncovered: boolean
}

export interface RosterGroup {
  block: Block
  rows: RosterRow[]
}

/** Who is working `date`, grouped by block, with uncovered required positions flagged. */
export function buildRoster(opts: {
  date: string
  shifts: Shift[]
  blocks: Block[]
  employees: Pick<Employee, 'id' | 'name'>[]
  requirements: CoverageRequirement[]
}): RosterGroup[] {
  const dow = dowOf(opts.date)
  const names = new Map(opts.employees.map(e => [e.id, e.name]))
  const day = opts.shifts.filter(s => s.date === opts.date && s.status !== 'cancelled')
  const groups: RosterGroup[] = []

  for (const block of [...opts.blocks].sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))) {
    const rows: RosterRow[] = []
    for (const role of ['driver', 'attendant'] as CrewRole[]) {
      const staffed = day
        .filter(s => s.block_id === block.id && s.role === role && s.employee_id && s.status === 'scheduled')
        .map(s => ({ role, shift: s, name: names.get(s.employee_id!) ?? 'Unknown', uncovered: false }))
        .sort((a, b) => a.name.localeCompare(b.name))
      const open = day.filter(s => s.block_id === block.id && s.role === role && (!s.employee_id || s.status === 'open'))
      const required = opts.requirements
        .filter(r => r.dow === dow && r.block_id === block.id && r.role === role)
        .reduce((n, r) => n + r.required_count, 0)
      rows.push(...staffed)
      // Open shifts fill required slots first, then any remaining requirement is a bare gap.
      const gaps = Math.max(required - staffed.length, open.length)
      for (let i = 0; i < gaps; i++) rows.push({ role, shift: open[i] ?? null, name: null, uncovered: true })
    }
    if (rows.length) groups.push({ block, rows })
  }
  return groups
}

/** Plain-text roster for pasting into Bambi or a message. */
export function rosterText(date: string, groups: RosterGroup[]): string {
  const lines = [`Care-A-Van roster — ${formatDate(date)}`]
  for (const g of groups) {
    lines.push('', `${g.block.code} · ${g.block.name}`)
    for (const r of g.rows) {
      const who = r.uncovered ? '** UNCOVERED **' : r.name
      const time = r.shift && !r.uncovered ? ` — ${shiftTimeLabel(r.shift, g.block)}` : ''
      lines.push(`  ${r.role === 'attendant' ? 'Attendant' : 'Driver'}: ${who}${time}`)
    }
  }
  return lines.join('\n')
}

/** Sum of target hours (for weekly totals on the driver's schedule). */
export function totalTargetHours(shifts: Pick<Shift, 'target_hours' | 'status'>[]): number {
  return shifts.filter(s => s.status === 'scheduled').reduce((n, s) => n + Number(s.target_hours), 0)
}

/** Start time from the first pickup (default: 30 minutes before). 'HH:MM' in, 'HH:MM' out. */
export function startFromPickup(pickup: string, minutesBefore = 30): string {
  const [h, m] = pickup.split(':').map(Number)
  const t = (((h * 60 + m - minutesBefore) % 1440) + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

/** "Start 7:30 am for an 8:30 am pickup" — the wording dispatch used to text. */
export function startMessage(start: string, pickup: string | null | undefined): string {
  return pickup ? `start ${formatTime(start)} for an ${formatTime(pickup)} pickup` : `start ${formatTime(start)}`
}
