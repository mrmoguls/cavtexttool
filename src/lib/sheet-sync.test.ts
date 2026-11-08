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

import { parseDueDates, parseRequirements, planCompliance } from './sheet-sync'
import { dueStatus, drivingBlockers } from './scheduling'
import type { ComplianceItem } from '../types'

describe('certifications from the sheet', () => {
  const rows = parseDueDates(DEMO_SHEET.dueDates)
  it('parses Due Dates and Requirements', () => {
    expect(rows).toHaveLength(17)
    const david = rows.find(r => r.name === 'David Thompson' && r.requirement.startsWith('Medical'))!
    expect(david).toMatchObject({ next_due: '2026-11-01', sheet_status: 'Overdue', notes: 'Booked at Prestige', frequency_months: 24 })
    expect(rows.find(r => r.requirement === 'Alcohol screening')).toMatchObject({ next_due: null, last_completed: '2022-05-30', sheet_status: 'Done' })
    const reqs = parseRequirements(DEMO_SHEET.requirements)
    expect(reqs.find(r => r.name === 'CPR/First Aid')).toMatchObject({ frequency_months: 24, first_due_days: 90 })
  })

  it('status levels', () => {
    const t = '2026-11-07'
    expect(dueStatus({ next_due: '2026-11-01', sheet_status: null, last_completed: null }, t)).toMatchObject({ level: 'overdue', days: -6 })
    expect(dueStatus({ next_due: '2026-11-12', sheet_status: null, last_completed: null }, t)).toMatchObject({ level: 'due7', label: 'Due in 5 days' })
    expect(dueStatus({ next_due: '2026-11-30', sheet_status: null, last_completed: null }, t).level).toBe('due30')
    expect(dueStatus({ next_due: '2026-12-20', sheet_status: null, last_completed: null }, t).level).toBe('due60')
    expect(dueStatus({ next_due: '2027-08-01', sheet_status: null, last_completed: null }, t).level).toBe('ok')
    expect(dueStatus({ next_due: null, sheet_status: 'Done', last_completed: '2022-05-30' }, t).level).toBe('done')
    expect(dueStatus({ next_due: null, sheet_status: null, last_completed: null }, t).level).toBe('nodate')
  })

  it('plans upserts, deletes and unmatched names; flags expired licenses', () => {
    const employees = [{ id: 'd5', name: 'David Thompson' }, { id: 'd2', name: 'Sarah Chen' }]
    const old: ComplianceItem = {
      id: 'x', employee_id: 'd5', requirement: 'Old training', last_completed: null, expiration_date: null, frequency_months: null,
      next_due: '2026-01-01', sheet_status: null, owner: null, notes: null, synced_at: '', last_alert_level: null, last_alerted_at: null,
      renewal_reported_at: null, renewal_note: null,
    }
    const plan = planCompliance(rows, employees, [old])
    expect(plan.upserts.filter(u => u.employeeId === 'd5')).toHaveLength(2)
    expect(plan.deletes.map(d => d.requirement)).toEqual(['Old training'])
    expect(plan.unmatched).toContain('Marcus Johnson')
    const items = plan.upserts.map((u, i) => ({ ...old, id: `i${i}`, employee_id: u.employeeId, requirement: u.row.requirement, next_due: u.row.next_due }))
    expect(drivingBlockers(items, 'd5', '2026-11-07').map(i => i.requirement)).toEqual(['Medical exam card (MCSA)'])
    expect(drivingBlockers(items, 'd2', '2026-11-07')).toEqual([]) // overdue CPR isn't a driving blocker
  })
})
