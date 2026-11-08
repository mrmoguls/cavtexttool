import { describe, expect, it } from 'vitest'
import { mapRole, parseSheet, parseUsDate, planSync } from './sheet-sync'
import { DEMO_SHEET } from './demo-sheet'
import { DEMO_CONTACTS, DEMO_EMPLOYEES } from './demo-data'

describe('sheet parsing', () => {
  it('dates and roles', () => {
    expect(parseUsDate('10/17/2019')).toBe('2019-10-17')
    expect(parseUsDate('')).toBeNull()
    expect(mapRole('FT Driver')).toMatchObject({ role: 'driver', employment_type: 'FT', bids_on_lines: true, can_dispatch: false })
    expect(mapRole('Backup Driver')).toMatchObject({ role: 'driver', employment_type: 'PT', bids_on_lines: false })
    expect(mapRole('FT Driver, Dipatch 1')).toMatchObject({ role: 'driver', can_dispatch: true })
    expect(mapRole('Gurney tech')).toMatchObject({ role: 'attendant', employment_type: 'PT' })
    expect(mapRole('Gurney tech')?.issue).toMatch(/FT or PT/)
    expect(mapRole('FT Gurney tech')).toMatchObject({ role: 'attendant', employment_type: 'FT', issue: undefined })
    expect(mapRole('Dispatch, billing')).toMatchObject({ role: 'dispatcher' })
    expect(mapRole('Operations director')).toMatchObject({ role: 'admin' })
    expect(mapRole('Owner, driver')?.issue).toMatch(/admin/)
    expect(mapRole('Driver')?.issue).toMatch(/FT or PT/)
    expect(mapRole('')).toBeNull()
  })

  it('reads both tabs, joins by name, skips Confirm and Totals', () => {
    const { people, skipped } = parseSheet(DEMO_SHEET)
    const by = Object.fromEntries(people.map(p => [p.name, p]))
    expect(people).toHaveLength(13)
    expect(by['Sarah Chen']).toMatchObject({ role: 'driver', can_dispatch: true, seniority_date: '2017-06-12', phone: '(530) 555-0112' })
    expect(by['Rosa Martinez'].availability).toEqual({ 0: 0, 1: 1, 2: 1, 3: 0.5, 4: 0, 5: 0, 6: 0 })
    expect(by['Rosa Martinez'].availability_notes).toMatch(/20 hours/)
    expect(by['Kevin Wright'].bids_on_lines).toBe(false)
    expect(by['Pat Morgan'].availability).toBeNull() // not on the Schedule tab
    expect(skipped.map(s => s.name)).toEqual(['Sam Ortiz', 'Former Person'])
  })

  it('plans changes against the app', () => {
    const plan = planSync(parseSheet(DEMO_SHEET), DEMO_EMPLOYEES, DEMO_CONTACTS)
    expect(plan.creates.map(p => p.name)).toEqual(['Jordan Park'])
    const kevin = plan.updates.find(u => u.employee.name === 'Kevin Wright')!
    expect(kevin.changes).toContain('Backup: open shifts only, no line bidding')
    const sarah = plan.updates.find(u => u.employee.name === 'Sarah Chen')!
    expect(sarah.changes).toContain('Gets dispatch access')
    expect(plan.notInSheet).toEqual([])
  })
})
