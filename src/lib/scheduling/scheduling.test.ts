import { describe, expect, it } from 'vitest'
import type { Employee, LineAssignment } from '../../types'
import {
  assignmentConflicts, blockInstructions, blockTimeLabel, computeCoverage, compareSeniority,
  formatTime, lineHours, lineIneligibility, lineSummary, lineTargetHours, todayISO, TARGET_DISCLAIMER,
} from '.'
import { SEED_BLOCKS, SEED_COVERAGE, SEED_LINE_DAYS, SEED_LINES } from './seed'

const blocksById = new Map(SEED_BLOCKS.map(b => [b.id, b]))
const block = (code: string) => SEED_BLOCKS.find(b => b.code === code)!
const line = (code: string) => SEED_LINES.find(l => l.code === code)!
const daysOf = (code: string) => SEED_LINE_DAYS.filter(d => d.line_id === line(code).id)

function emp(over: Partial<Employee> = {}): Employee {
  return {
    id: 'e', name: 'E', role: 'driver', employment_type: 'FT', seniority_date: null, hire_seq: null,
    gurney_qualified: false, active: true, created_at: '2025-01-01T00:00:00Z', ...over,
  }
}

describe('time', () => {
  it('formats 24h times', () => {
    expect(formatTime('08:30:00')).toBe('8:30 am')
    expect(formatTime('12:00')).toBe('12:00 pm')
    expect(formatTime('13:00')).toBe('1:00 pm')
    expect(formatTime('00:15')).toBe('12:15 am')
    expect(formatTime(null)).toBe('')
  })
  it('gives today in Pacific time', () => {
    // 2026-11-08 05:00 UTC is still Nov 7 in California
    expect(todayISO(new Date('2026-11-08T05:00:00Z'))).toBe('2026-11-07')
  })
})

describe('line summary + target hours', () => {
  it('matches the seed table', () => {
    expect(lineSummary(line('FT1'), daysOf('FT1'), blocksById)).toBe('Mon–Fri AM')
    expect(lineSummary(line('FT5'), daysOf('FT5'), blocksById)).toBe('Mon–Thu PM')
    expect(lineSummary(line('A1'), daysOf('A1'), blocksById)).toBe('Mon–Fri GATT')
    expect(lineSummary(line('PT4'), daysOf('PT4'), blocksById)).toBe('Sat SATG + Sun SUNG')
    expect(lineSummary(line('FLEX'), daysOf('FLEX'), blocksById)).toMatch(/on-call/)
  })
  it('sums block targets', () => {
    expect(lineTargetHours(daysOf('FT1'), blocksById)).toBe(40)
    expect(lineTargetHours(daysOf('PT4'), blocksById)).toBe(10.5)
    expect(lineTargetHours(daysOf('FT5'), blocksById)).toBe(32)
    expect(lineTargetHours(daysOf('A1'), blocksById)).toBe(30)
    expect(lineTargetHours(daysOf('FLEX'), blocksById)).toBe(0)
  })
})

describe('line hours', () => {
  it('Midday 1 is steady; Sunrise and Star lines vary', () => {
    expect(lineHours(line('FT3'), daysOf('FT3'), blocksById)).toEqual({ label: '40 hrs/week', steady: true })
    expect(lineHours(line('FT1'), daysOf('FT1'), blocksById).steady).toBe(false)
    expect(lineHours(line('FT4'), daysOf('FT4'), blocksById)).toEqual({ label: 'About 30–40 hrs/week', steady: false })
    expect(lineHours({ ...line('FT5'), hours_note: null }, daysOf('FT5'), blocksById).label).toBe('About 32 hrs/week')
    expect(lineHours(line('FLEX'), daysOf('FLEX'), blocksById)).toEqual({ label: 'Sick calls, time off and busy days', steady: false })
  })
})

describe('block language', () => {
  it('AM: report before first pickup, posted by 3 pm', () => {
    const lines = blockInstructions(block('AM'))
    expect(lines[0]).toBe('Report 30 minutes before your first scheduled pickup. Your start time will be posted by 3:00 pm the day before.')
    expect(lines).toContain(TARGET_DISCLAIMER)
  })
  it('AM with posted start', () => {
    expect(blockInstructions(block('AM'), { startTime: '05:30' }))
      .toContain('Report at 5:30 am and work through your last scheduled drop-off.')
  })
  it('variable end', () => {
    const lines = blockInstructions(block('GATT'))
    expect(lines).toEqual(['Report at 1:00 pm and work through your last scheduled drop-off.', TARGET_DISCLAIMER])
    expect(blockTimeLabel(block('GATT'))).toBe('1:00 pm – last drop-off')
  })
  it('fixed block has no disclaimer', () => {
    const lines = blockInstructions(block('MID'))
    expect(lines).toEqual(['Report at 8:30 am. Shift ends at 5:00 pm.'])
  })
})

describe('eligibility', () => {
  it('anyone can bid on any line they are qualified for, full-time or part-time', () => {
    expect(lineIneligibility(emp(), line('FT1'))).toEqual([])
    expect(lineIneligibility(emp(), line('FLEX'))).toEqual([])
    expect(lineIneligibility(emp({ employment_type: 'PT' }), line('FLEX'))).toEqual([])
    expect(lineIneligibility(emp({ employment_type: 'PT' }), line('FT1'))).toEqual([])
  })
  it('gurney + role', () => {
    expect(lineIneligibility(emp(), line('FT4'))).toEqual(['Requires gurney qualification.'])
    expect(lineIneligibility(emp({ gurney_qualified: true }), line('FT4'))).toEqual([])
    expect(lineIneligibility(emp(), line('A1'))).toEqual(['Attendant line — attendants only.'])
    expect(lineIneligibility(emp({ role: 'attendant' }), line('A1'))).toEqual([])
    expect(lineIneligibility(emp({ role: 'attendant' }), line('FT1'))).toEqual(['Driver line — drivers only.'])
  })
  it('seniority order with hire-order tie-break', () => {
    const a = emp({ name: 'A', seniority_date: '2020-01-01', hire_seq: 2 })
    const b = emp({ name: 'B', seniority_date: '2020-01-01', hire_seq: 1 })
    const c = emp({ name: 'C', seniority_date: '2019-05-01' })
    const d = emp({ name: 'D', seniority_date: null })
    expect([a, b, c, d].sort(compareSeniority).map(e => e.name)).toEqual(['C', 'B', 'A', 'D'])
  })
})

describe('assignment conflicts', () => {
  const existing: LineAssignment[] = [
    { id: 'x', line_id: line('FT1').id, employee_id: 'e1', bid_period_id: null, source: 'manual', effective_from: '2026-01-01', effective_to: '2026-03-31' },
  ]
  it('blocks a full line and double-booked person', () => {
    expect(assignmentConflicts({ line_id: line('FT1').id, employee_id: 'e2', effective_from: '2026-02-01', effective_to: null }, line('FT1'), existing))
      .toEqual(['FT1 has no open positions for that date range.'])
    expect(assignmentConflicts({ line_id: line('FT2').id, employee_id: 'e1', effective_from: '2026-03-01', effective_to: null }, line('FT2'), existing))
      .toEqual(['This person already holds a line for part of that date range.'])
    expect(assignmentConflicts({ line_id: line('FT1').id, employee_id: 'e2', effective_from: '2026-04-01', effective_to: null }, line('FT1'), existing))
      .toEqual([])
  })
  it('FLEX holds two', () => {
    const flex = line('FLEX')
    const one: LineAssignment[] = [{ ...existing[0], line_id: flex.id }]
    expect(assignmentConflicts({ line_id: flex.id, employee_id: 'e2', effective_from: '2026-01-01', effective_to: null }, flex, one)).toEqual([])
  })
})

describe('coverage', () => {
  const base = {
    blocks: SEED_BLOCKS, lines: SEED_LINES, lineDays: SEED_LINE_DAYS, requirements: SEED_COVERAGE,
    employees: [{ id: 'e1', name: 'Pat' }], asOf: '2026-02-01',
  }
  it('everything is short with nobody assigned, but lines exist for all of it', () => {
    const days = computeCoverage({ ...base, assignments: [] })
    const mon = days[0]
    expect(mon.dow).toBe(1)
    // Mon: Sunrise 1 + 2, Midday 1, Star 1 (gurney driver), gurney attendant, Star 2
    expect(mon.cells.map(c => `${c.block.code}/${c.role}`)).toEqual(['AM/driver', 'AM2/driver', 'MID/driver', 'PMG/driver', 'GATT/attendant', 'PM/driver'])
    expect(mon.shortCount).toBe(6)
    expect(mon.cells.every(c => !c.noLine)).toBe(true)
    const sun = days[6]
    expect(sun.cells.map(c => `${c.block.code}/${c.role}`)).toEqual(['SUNG/driver', 'SUNG/attendant'])
  })
  it('an assignment covers its line days', () => {
    const days = computeCoverage({ ...base, assignments: [
      { id: 'a', line_id: line('FT1').id, employee_id: 'e1', bid_period_id: null, source: 'manual', effective_from: '2026-01-01', effective_to: null },
    ] })
    const am = days[0].cells.find(c => c.block.code === 'AM')!
    expect(am.status).toBe('ok')
    expect(am.assignedNames).toEqual(['Pat'])
    expect(days[5].cells.find(c => c.block.code === 'AM')).toBeUndefined() // Sat
  })
  it('flags a requirement with no line', () => {
    const days = computeCoverage({ ...base, assignments: [], requirements: [
      ...SEED_COVERAGE, { id: 'r', dow: 6, block_id: block('MID').id, role: 'driver', required_count: 1 },
    ] })
    const satMid = days[5].cells.find(c => c.block.code === 'MID')!
    expect(satMid.noLine).toBe(true)
    expect(satMid.status).toBe('short')
  })
})
