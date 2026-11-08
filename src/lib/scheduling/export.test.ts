import { describe, expect, it } from 'vitest'
import type { Employee, LineAssignment, Shift } from '../../types'
import { AVAILABILITY_COLUMNS, datedShifts, exportTimes, splitName, toCsv, weeklyAvailability, weeklyGrid } from '.'
import { SEED_BLOCKS, SEED_LINE_DAYS, SEED_LINES } from './seed'

const block = (c: string) => SEED_BLOCKS.find(b => b.code === c)!
const emp = (id: string, name: string): Employee => ({ id, name, role: 'driver', employment_type: 'FT', seniority_date: null, hire_seq: null, gurney_qualified: true, active: true, created_at: '' })
const assign = (code: string, e: string): LineAssignment => ({ id: `a-${code}`, line_id: `line-${code}`, employee_id: e, bid_period_id: null, source: 'manual', effective_from: '2026-10-01', effective_to: null })
const opts = { variableStart: { [block('AM').id]: '05:30' }, timeFormat: '24h' as const }

describe('export', () => {
  it('names and times', () => {
    expect(splitName('Mary Ann Smith')).toEqual({ first: 'Mary Ann', last: 'Smith' })
    expect(exportTimes(block('MID'), opts)).toEqual({ start: '08:30', end: '17:00', estimated: false })
    // Gurney attendant: 1:00 pm + 6 h + 30 min meal
    expect(exportTimes(block('GATT'), opts)).toEqual({ start: '13:00', end: '19:30', estimated: true })
    expect(exportTimes(block('AM'), opts)).toEqual({ start: '05:30', end: '14:00', estimated: true })
    expect(exportTimes(block('MID'), { ...opts, timeFormat: '12h' })).toEqual({ start: '8:30 AM', end: '5:00 PM', estimated: false })
    // a dated shift's posted start wins
    expect(exportTimes(block('AM'), opts, { start_time: '06:15', end_time: null, target_hours: 8 }).start).toBe('06:15')
  })

  it('weekly availability from lines (Mon first, flex skipped)', () => {
    const rows = weeklyAvailability({
      asOf: '2026-11-09', employees: [emp('e1', 'Joe Hill'), emp('e2', 'Teno Lee'), emp('e3', 'Flex Person')],
      contacts: [{ employee_id: 'e1', phone: '530-555-0001' }], lines: SEED_LINES, lineDays: SEED_LINE_DAYS, blocks: SEED_BLOCKS,
      assignments: [assign('FT3', 'e1'), assign('PT4', 'e2'), assign('FLEX', 'e3')], options: opts,
    })
    expect(rows.filter(r => r.last_name === 'Hill').map(r => r.day_of_week)).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
    expect(rows.find(r => r.last_name === 'Lee' && r.day_of_week === 'Saturday')).toMatchObject({ start: '12:30', end: '19:00', block: 'SATG', day_number: 6, end_estimated: 'yes' })
    expect(rows.some(r => r.last_name === 'Person')).toBe(false)
    expect(weeklyGrid(rows).find(g => g.name === 'Joe Hill')!.days.Monday).toBe('08:30–17:00')
  })

  it('dated shifts and CSV', () => {
    const s: Shift = { id: 's', date: '2026-11-10', block_id: block('AM').id, role: 'driver', employee_id: 'e1', line_id: 'line-FT1', assignment_id: null,
      source: 'line', status: 'scheduled', start_time: '05:45', end_time: null, start_posted_at: null, start_posted_by: null, target_hours: 8, notes: null }
    const rows = datedShifts({ from: '2026-11-09', to: '2026-11-15', shifts: [s, { ...s, id: 'o', status: 'open', employee_id: null }],
      employees: [emp('e1', 'Joe "JJ" Hill')], contacts: [], lines: SEED_LINES, blocks: SEED_BLOCKS, options: opts })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ date: '2026-11-10', start: '05:45', end: '14:15', line: 'FT1' })
    const csv = toCsv(weeklyAvailability({ asOf: '2026-11-09', employees: [emp('e1', 'Joe "JJ" Hill')], contacts: [], lines: SEED_LINES,
      lineDays: SEED_LINE_DAYS, blocks: SEED_BLOCKS, assignments: [assign('FT3', 'e1')], options: opts }), AVAILABILITY_COLUMNS)
    expect(csv.split('\r\n')[0]).toBe('First Name,Last Name,Phone,Role,Day of Week,Day Number (1=Mon),Start Time,End Time,Target Hours,Shift Type,Line,End Time Estimated')
    expect(csv.split('\r\n')[1]).toBe('"Joe ""JJ""",Hill,,Driver,Monday,1,08:30,17:00,8,MID,FT3,no')
  })
})
