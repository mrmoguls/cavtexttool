// Mirrors the seed rows in supabase/migrations/002_scheduling_setup.sql.
// Used by demo mode and tests.
import type { Block, CoverageRequirement, Dow, Line, LineDay } from '../../types'

const blockRows: Omit<Block, 'id' | 'active'>[] = [
  { code: 'AM', name: 'Sunrise 1', crew_roles: ['driver'], start_type: 'variable', end_type: 'variable', default_start: null, default_end: null, target_paid_hours: 8, requires_gurney_qual: false, start_rule_note: '30 minutes before your first scheduled pickup', end_rule_note: 'when your assigned trips are complete', sort_order: 10 },
  { code: 'AM2', name: 'Sunrise 2', crew_roles: ['driver'], start_type: 'variable', end_type: 'variable', default_start: null, default_end: null, target_paid_hours: 8, requires_gurney_qual: false, start_rule_note: 'the time dispatch posts (second call, usually about 8 am)', end_rule_note: 'when your assigned trips are complete', sort_order: 15 },
  { code: 'MID', name: 'Midday 1', crew_roles: ['driver'], start_type: 'fixed', end_type: 'fixed', default_start: '08:30', default_end: '17:00', target_paid_hours: 8, requires_gurney_qual: false, start_rule_note: null, end_rule_note: null, sort_order: 20 },
  { code: 'PMG', name: 'Star 1 (gurney)', crew_roles: ['driver'], start_type: 'variable', end_type: 'variable', default_start: null, default_end: null, target_paid_hours: 8, requires_gurney_qual: true, start_rule_note: 'the time dispatch posts (usually about 11 am; wheelchair rides until 1 pm, then the gurney van)', end_rule_note: 'last scheduled drop-off', sort_order: 30 },
  { code: 'GATT', name: 'Gurney attendant', crew_roles: ['attendant'], start_type: 'fixed', end_type: 'variable', default_start: '13:00', default_end: null, target_paid_hours: 6, requires_gurney_qual: false, start_rule_note: null, end_rule_note: 'last scheduled drop-off', sort_order: 35 },
  { code: 'PM', name: 'Star 2', crew_roles: ['driver'], start_type: 'variable', end_type: 'variable', default_start: null, default_end: null, target_paid_hours: 8, requires_gurney_qual: false, start_rule_note: 'the time dispatch posts, worked back from the last drop-off (usually about 11:45 am)', end_rule_note: 'last scheduled drop-off', sort_order: 40 },
  { code: 'SATG', name: 'Saturday Star', crew_roles: ['driver', 'attendant'], start_type: 'fixed', end_type: 'variable', default_start: '12:30', default_end: null, target_paid_hours: 6, requires_gurney_qual: true, start_rule_note: null, end_rule_note: 'last scheduled drop-off', sort_order: 60 },
  { code: 'SUNG', name: 'Sunday Star', crew_roles: ['driver', 'attendant'], start_type: 'fixed', end_type: 'variable', default_start: '13:00', default_end: null, target_paid_hours: 4.5, requires_gurney_qual: true, start_rule_note: null, end_rule_note: 'last scheduled drop-off', sort_order: 70 },
]

export const SEED_BLOCKS: Block[] = blockRows.map(b => ({ ...b, id: `blk-${b.code}`, active: true }))

type LineSeed = Omit<Line, 'id' | 'active' | 'notes' | 'category'> & { days: [Dow, string][] }
const MON_FRI: Dow[] = [1, 2, 3, 4, 5]

const MON_THU: Dow[] = [1, 2, 3, 4]

const lineRows: LineSeed[] = [
  { code: 'FT1', name: 'Sunrise 1', employment_type: 'FT', role: 'driver', requires_gurney_qual: false, is_flex: false, positions: 1, sort_order: 10, hours_note: 'About 30–40 hrs/week', days: MON_FRI.map(d => [d, 'AM']) },
  { code: 'FT2', name: 'Sunrise 2', employment_type: 'FT', role: 'driver', requires_gurney_qual: false, is_flex: false, positions: 1, sort_order: 20, hours_note: 'About 30–40 hrs/week', days: MON_FRI.map(d => [d, 'AM2']) },
  { code: 'FT3', name: 'Midday 1', employment_type: 'FT', role: 'driver', requires_gurney_qual: false, is_flex: false, positions: 1, sort_order: 30, hours_note: '40 hrs/week', days: MON_FRI.map(d => [d, 'MID']) },
  { code: 'FT4', name: 'Star 1 (gurney)', employment_type: 'FT', role: 'driver', requires_gurney_qual: true, is_flex: false, positions: 1, sort_order: 40, hours_note: 'About 30–40 hrs/week', days: MON_FRI.map(d => [d, 'PMG']) },
  { code: 'FT5', name: 'Star 2 (Mon–Thu)', employment_type: 'FT', role: 'driver', requires_gurney_qual: false, is_flex: false, positions: 1, sort_order: 50, hours_note: 'About 32 hrs/week', days: MON_THU.map(d => [d, 'PM']) },
  { code: 'MD2', name: 'Midday 2 (on call, Mon–Thu)', employment_type: 'PT', role: 'driver', requires_gurney_qual: false, is_flex: true, positions: 1, sort_order: 60, hours_note: 'Busy days only, about 9:30 am–3:30 pm', days: [] },
  { code: 'PT4', name: 'Weekend Star (gurney driver)', employment_type: 'PT', role: 'driver', requires_gurney_qual: true, is_flex: false, positions: 1, sort_order: 70, hours_note: 'About 10–11 hrs/week', days: [[6, 'SATG'], [0, 'SUNG']] },
  { code: 'FLEX', name: 'Flex / on-call', employment_type: 'PT', role: 'driver', requires_gurney_qual: false, is_flex: true, positions: 2, sort_order: 80, hours_note: 'Sick calls, time off and busy days', days: [] },
  { code: 'A1', name: 'Gurney attendant (Mon–Fri)', employment_type: 'PT', role: 'attendant', requires_gurney_qual: false, is_flex: false, positions: 1, sort_order: 90, hours_note: 'About 30 hrs/week', days: MON_FRI.map(d => [d, 'GATT']) },
  { code: 'A2', name: 'Weekend Star (attendant)', employment_type: 'PT', role: 'attendant', requires_gurney_qual: false, is_flex: false, positions: 1, sort_order: 100, hours_note: 'About 10–11 hrs/week', days: [[6, 'SATG'], [0, 'SUNG']] },
]

export const SEED_LINES: Line[] = lineRows.map(({ days: _days, ...l }) => ({
  ...l, id: `line-${l.code}`, category: 'core', active: true, notes: null,
}))

export const SEED_LINE_DAYS: LineDay[] = lineRows.flatMap(l =>
  l.days.map(([dow, blockCode]) => ({ id: `ld-${l.code}-${dow}`, line_id: `line-${l.code}`, dow, block_id: `blk-${blockCode}` })),
)

/** Starting coverage = what the core (non-flex) lines provide. */
export const SEED_COVERAGE: CoverageRequirement[] = (() => {
  const map = new Map<string, CoverageRequirement>()
  for (const ld of SEED_LINE_DAYS) {
    const line = SEED_LINES.find(l => l.id === ld.line_id)!
    if (line.is_flex || line.category !== 'core') continue
    const key = `${ld.dow}|${ld.block_id}|${line.role}`
    const existing = map.get(key)
    if (existing) existing.required_count += line.positions
    else map.set(key, { id: `cov-${key}`, dow: ld.dow, block_id: ld.block_id, role: line.role, required_count: line.positions })
  }
  return [...map.values()]
})()

export const SEED_SETTINGS: Record<string, unknown> = {
  timezone: 'America/Los_Angeles',
  workweek_start_dow: 0,
  am_start_deadline: '15:00',
  am_start_warning: '14:00',
  request_cutoff_hours: 48,
  pt_first_open_shifts: false,
  daily_ot_hours: 8,
  weekly_ot_hours: 40,
  second_meal_hours: 10,
}
