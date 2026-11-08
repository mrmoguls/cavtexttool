import { describe, expect, it } from 'vitest'
import type { LineAssignment, Shift } from '../../types'
import { amStartStatus, buildRoster, generateShifts, mondayOf, nowHHMM, payrollWeekStart, rosterText, shiftTimeLabel } from '.'
import { SEED_BLOCKS, SEED_COVERAGE, SEED_LINE_DAYS, SEED_LINES } from './seed'

const block = (code: string) => SEED_BLOCKS.find(b => b.code === code)!
const blocksById = new Map(SEED_BLOCKS.map(b => [b.id, b]))
const assign = (code: string, emp: string, from = '2026-11-01', to: string | null = null): LineAssignment => ({
  id: `a-${code}`, line_id: `line-${code}`, employee_id: emp, bid_period_id: null, source: 'manual', effective_from: from, effective_to: to,
})
// 2026-11-09 is a Monday
const base = { lines: SEED_LINES, lineDays: SEED_LINE_DAYS, blocks: SEED_BLOCKS, existing: [] as Pick<Shift, 'assignment_id' | 'date'>[] }

function toShift(d: ReturnType<typeof generateShifts>[number], i: number): Shift {
  return { ...d, id: `s${i}` }
}

describe('dates', () => {
  it('week starts', () => {
    expect(mondayOf('2026-11-15')).toBe('2026-11-09') // Sunday -> previous Monday
    expect(mondayOf('2026-11-09')).toBe('2026-11-09')
    expect(payrollWeekStart('2026-11-14')).toBe('2026-11-08') // Sat -> Sunday
  })
  it('Pacific clock', () => {
    expect(nowHHMM(new Date('2026-11-08T22:05:00Z'))).toBe('14:05')
  })
})

describe('generateShifts', () => {
  it('FT1 makes Mon–Fri AM shifts with no start time', () => {
    const out = generateShifts({ ...base, assignments: [assign('FT1', 'e1')], from: '2026-11-09', to: '2026-11-15' })
    expect(out.map(s => s.date)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'])
    expect(out.every(s => s.block_id === block('AM').id && s.start_time === null && s.target_hours === 8)).toBe(true)
  })
  it('copies fixed times and roles; weekend gurney attendant', () => {
    const out = generateShifts({ ...base, assignments: [assign('FT2', 'e2'), assign('A2', 'e3')], from: '2026-11-09', to: '2026-11-15' })
    const mid = out.find(s => s.employee_id === 'e2')!
    expect([mid.start_time, mid.end_time]).toEqual(['08:00', '17:00'])
    const att = out.filter(s => s.employee_id === 'e3')
    expect(att.map(s => [s.date, s.role, s.target_hours])).toEqual([['2026-11-14', 'attendant', 6], ['2026-11-15', 'attendant', 6]])
  })
  it('respects assignment dates, skips existing and flex', () => {
    const a = assign('PT1', 'e4', '2026-11-10', '2026-11-10')
    expect(generateShifts({ ...base, assignments: [a], from: '2026-11-09', to: '2026-11-15' }).map(s => s.date)).toEqual(['2026-11-10'])
    expect(generateShifts({ ...base, assignments: [a], existing: [{ assignment_id: a.id, date: '2026-11-10' }], from: '2026-11-09', to: '2026-11-15' })).toEqual([])
    expect(generateShifts({ ...base, assignments: [assign('FLEX', 'e5')], from: '2026-11-09', to: '2026-11-15' })).toEqual([])
  })
})

describe('AM start status', () => {
  const shifts = generateShifts({ ...base, assignments: [assign('FT1', 'e1'), assign('FT2', 'e2')], from: '2026-11-10', to: '2026-11-10' }).map(toShift)
  const run = (today: string, now: string, list = shifts) =>
    amStartStatus({ date: '2026-11-10', shifts: list, blocksById, today, now })
  it('pending, warning at 2 pm, overdue at 3 pm', () => {
    expect(run('2026-11-09', '13:59').phase).toBe('pending')
    expect(run('2026-11-09', '14:00').phase).toBe('warning')
    expect(run('2026-11-09', '15:00').phase).toBe('overdue')
    expect(run('2026-11-08', '16:00').phase).toBe('pending')
    expect(run('2026-11-09', '14:00').unset).toHaveLength(1) // only the AM shift
  })
  it('none once posted', () => {
    const posted = shifts.map(s => s.block_id === block('AM').id ? { ...s, start_time: '05:30' } : s)
    expect(run('2026-11-09', '15:30', posted).phase).toBe('none')
  })
})

describe('roster', () => {
  const emps = [{ id: 'e1', name: 'Sarah Chen' }, { id: 'e2', name: 'Marcus Johnson' }, { id: 'e3', name: 'Angela Davis' }]
  const shifts = generateShifts({ ...base, assignments: [assign('FT1', 'e1'), assign('PT5', 'e2'), assign('A1', 'e3')], from: '2026-11-09', to: '2026-11-09' })
    .map(toShift).map(s => s.block_id === block('AM').id ? { ...s, start_time: '05:30' } : s)
  const groups = buildRoster({ date: '2026-11-09', shifts, blocks: SEED_BLOCKS, employees: emps, requirements: SEED_COVERAGE })
  it('groups by block and flags gaps', () => {
    expect(groups.map(g => g.block.code)).toEqual(['AM', 'MID', 'PM', 'PMG'])
    // Two High Noon lines, nobody on either.
    expect(groups[1].rows).toEqual([{ role: 'driver', shift: null, name: null, uncovered: true }, { role: 'driver', shift: null, name: null, uncovered: true }])
    expect(groups[3].rows.map(r => `${r.role}:${r.name}`)).toEqual(['driver:Marcus Johnson', 'attendant:Angela Davis'])
  })
  it('copyable text', () => {
    const text = rosterText('2026-11-09', groups)
    expect(text).toContain('Care-A-Van roster — Mon, Nov 9')
    expect(text).toContain('  Driver: Sarah Chen — 5:30 am – trips complete')
    expect(text).toContain('MID · High Noon\n  Driver: ** UNCOVERED **')
    expect(text).toContain('  Attendant: Angela Davis — 12:00 pm – last drop-off')
  })
  it('time labels', () => {
    expect(shiftTimeLabel({ start_time: null, end_time: null }, block('AM'))).toBe('Start not posted yet – trips complete')
  })
})

describe('time off in generation', () => {
  it('skips approved time-off days', () => {
    const out = generateShifts({ ...base, assignments: [assign('FT1', 'e1')], from: '2026-11-09', to: '2026-11-13',
      timeOff: [{ employee_id: 'e1', start_date: '2026-11-10', end_date: '2026-11-11' }] })
    expect(out.map(s => s.date)).toEqual(['2026-11-09', '2026-11-12', '2026-11-13'])
  })
})

import { startFromPickup, startMessage } from '.'
describe('start from first pickup', () => {
  it('30 minutes before, wording', () => {
    expect(startFromPickup('08:30')).toBe('08:00')
    expect(startFromPickup('08:15')).toBe('07:45')
    expect(startFromPickup('00:10')).toBe('23:40')
    expect(startMessage('07:30', '08:00')).toBe('start 7:30 am for an 8:00 am pickup')
    expect(startMessage('07:30', null)).toBe('start 7:30 am')
  })
})
