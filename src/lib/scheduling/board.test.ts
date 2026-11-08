import { describe, expect, it } from 'vitest'
import type { Employee, Shift } from '../../types'
import { insideCutoff, overtimeLimits, overtimeWarnings, pacificToInstant, workProblem } from '.'
import { SEED_BLOCKS } from './seed'

const block = (code: string) => SEED_BLOCKS.find(b => b.code === code)!
const blocksById = new Map(SEED_BLOCKS.map(b => [b.id, b]))
const emp = (o: Partial<Employee> = {}): Employee => ({
  id: 'e1', name: 'E', role: 'driver', employment_type: 'FT', seniority_date: null, hire_seq: null,
  gurney_qualified: false, active: true, created_at: '', ...o,
})
const shift = (o: Partial<Shift>): Shift => ({
  id: 's', date: '2026-11-10', block_id: block('MID').id, role: 'driver', employee_id: 'e1', line_id: null,
  assignment_id: null, source: 'line', status: 'scheduled', start_time: '08:30', end_time: '17:00',
  start_posted_at: null, start_posted_by: null, target_hours: 8, notes: null, ...o,
})

describe('Pacific time', () => {
  it('converts across daylight saving', () => {
    expect(pacificToInstant('2026-11-10', '08:30').toISOString()).toBe('2026-11-10T16:30:00.000Z') // PST
    expect(pacificToInstant('2026-07-10', '08:30').toISOString()).toBe('2026-07-10T15:30:00.000Z') // PDT
  })
  it('48-hour cutoff', () => {
    const s = shift({ date: '2026-11-10', start_time: '08:30' }) // 16:30Z
    expect(insideCutoff(s, block('MID'), 48, new Date('2026-11-08T16:31:00Z'))).toBe(true)
    expect(insideCutoff(s, block('MID'), 48, new Date('2026-11-08T16:30:00Z'))).toBe(false)
    // AM with no posted start counts from 5:00 am
    const am = shift({ block_id: block('AM').id, start_time: null })
    expect(insideCutoff(am, block('AM'), 48, new Date('2026-11-08T12:59:00Z'))).toBe(false)
    expect(insideCutoff(am, block('AM'), 48, new Date('2026-11-08T13:01:00Z'))).toBe(true)
  })
})

describe('workProblem', () => {
  const all = [shift({ id: 'mine', employee_id: 'e2', date: '2026-11-10' })]
  it('role, gurney, double-booking', () => {
    expect(workProblem(emp({ role: 'attendant' }), shift({ id: 'x' }), block('MID'), [])).toBe('This is a driver shift.')
    expect(workProblem(emp(), shift({ id: 'x', block_id: block('PMG').id }), block('PMG'), [])).toBe('Requires gurney qualification.')
    expect(workProblem(emp({ role: 'attendant' }), shift({ id: 'x', role: 'attendant', block_id: block('PMG').id }), block('PMG'), [])).toBeNull()
    expect(workProblem(emp({ id: 'e2' }), shift({ id: 'x' }), block('MID'), all)).toBe('Already working that day.')
    expect(workProblem(emp({ id: 'e2' }), shift({ id: 'x' }), block('MID'), all, 'mine')).toBeNull()
    expect(workProblem(emp({ active: false }), shift({ id: 'x' }), block('MID'), [])).toBe('Not an active employee.')
  })
})

describe('overtime warnings', () => {
  const limits = overtimeLimits({})
  // Sun Nov 8 – Sat Nov 14 payroll week; e1 works Mon–Fri 8 hrs = 40
  const week = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'].map((d, i) => shift({ id: `w${i}`, date: d }))
  it('extra Saturday pushes the week over 40', () => {
    const sat = shift({ id: 'sat', date: '2026-11-14', employee_id: null, block_id: block('SAT').id })
    expect(overtimeWarnings({ employeeId: 'e1', add: [sat], shifts: week, limits, blocksById }))
      .toEqual(['Week of Sun, Nov 8: 48 hrs — over 40 (weekly overtime).'])
  })
  it('second shift the same day is daily overtime', () => {
    const extra = shift({ id: 'x', date: '2026-11-10', employee_id: null })
    const w = overtimeWarnings({ employeeId: 'e1', add: [extra], shifts: week, limits })
    expect(w[0]).toBe('Tue, Nov 10: 16 hrs that day — over 8 (daily overtime).')
  })
  it('a swap that keeps hours equal raises nothing; next week is separate', () => {
    const other = shift({ id: 'o', date: '2026-11-15', employee_id: 'e2' })
    expect(overtimeWarnings({ employeeId: 'e1', add: [other], remove: [week[0]], shifts: week, limits })).toEqual([])
  })
  it('long shift needs a second meal', () => {
    const long = shift({ id: 'l', date: '2026-11-20', target_hours: 10.5 })
    expect(overtimeWarnings({ employeeId: 'e9', add: [long], shifts: [], limits, blocksById })[0]).toMatch(/second meal/)
  })
})
