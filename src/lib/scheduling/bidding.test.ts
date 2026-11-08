import { describe, expect, it } from 'vitest'
import type { Availability, Bid, BidOptin, Employee } from '../../types'
import { autoAssign, availabilityFit, biddingOrder, lineBidProblems, openPositions } from '.'
import { SEED_LINE_DAYS, SEED_LINES } from './seed'

const line = (code: string) => SEED_LINES.find(l => l.code === code)!
const days = (code: string) => SEED_LINE_DAYS.filter(d => d.line_id === line(code).id)
let n = 0
const emp = (name: string, o: Partial<Employee> = {}): Employee => ({
  id: name, name, role: 'driver', employment_type: 'FT', seniority_date: '2020-01-01', hire_seq: ++n,
  gurney_qualified: false, active: true, created_at: '', ...o,
})
const bids = (empId: string, ...codes: string[]): Bid[] =>
  codes.map((c, i) => ({ id: `${empId}-${c}`, bid_period_id: 'p', employee_id: empId, line_id: line(c).id, rank: i + 1, created_at: '' }))
const optin = (empId: string): BidOptin => ({ id: `o-${empId}`, bid_period_id: 'p', employee_id: empId, wants_full_time: true, submitted_at: '' })

describe('availability', () => {
  const monWed: Availability = { 0: 0, 1: 1, 2: 1, 3: 0.5, 4: 0, 5: 0, 6: 0 }
  it('blocks unavailable days, warns on partial', () => {
    expect(availabilityFit(monWed, days('PT1'))).toEqual({ blocked: [], partial: ['Wednesday'] })
    expect(availabilityFit(monWed, days('FT1'))).toEqual({ blocked: ['Thursday', 'Friday'], partial: ['Wednesday'] })
    expect(availabilityFit(null, days('FT1'))).toEqual({ blocked: [], partial: [] })
  })
  it('combined problems', () => {
    const rosa = emp('Rosa', { employment_type: 'PT' })
    expect(lineBidProblems(rosa, line('PT1'), days('PT1'), monWed)).toEqual({ problems: [], warnings: ['Only partly available Wednesday.'] })
    expect(lineBidProblems(rosa, line('PT2'), days('PT2'), monWed).problems).toEqual(['Not available Thursday, Friday, Saturday (schedule sheet).'])
    expect(lineBidProblems(emp('Kev', { employment_type: 'PT', bids_on_lines: false }), line('PT1'), days('PT1'), null).problems)
      .toEqual(['Backup drivers pick up open shifts instead of bidding on lines.'])
  })
})

describe('autoAssign', () => {
  const senior = emp('Senior FT', { seniority_date: '2010-01-01' })
  const junior = emp('Junior FT', { seniority_date: '2020-01-01' })
  const ptSenior = emp('Senior PT', { employment_type: 'PT', seniority_date: '2005-01-01' })
  const ptJunior = emp('Junior PT', { employment_type: 'PT', seniority_date: '2015-01-01' })
  const backup = emp('Backup', { employment_type: 'PT', bids_on_lines: false })
  const dispatcher = emp('Disp', { role: 'dispatcher' })
  const base = { lines: SEED_LINES, lineDays: SEED_LINE_DAYS, availability: new Map() }

  it('orders FT by seniority, then PT; skips backups and non-crew', () => {
    expect(biddingOrder([ptJunior, junior, backup, ptSenior, senior, dispatcher]).map(e => e.name))
      .toEqual(['Senior FT', 'Junior FT', 'Senior PT', 'Junior PT'])
  })

  it('senior gets first choice; junior falls to next choice', () => {
    const r = autoAssign({ ...base, employees: [junior, senior], bids: [...bids(senior.id, 'FT2', 'FT1'), ...bids(junior.id, 'FT2', 'FT1')], optins: [] })
    expect(r.map(x => [x.employee_id, x.line_id && SEED_LINES.find(l => l.id === x.line_id)!.code, x.rank_got])).toEqual([
      ['Senior FT', 'FT2', 1], ['Junior FT', 'FT1', 2],
    ])
  })

  it('PT can take a leftover FT line only with the opt-in, and only after FT bidders', () => {
    // Senior PT is more senior than everyone but bids after all FT employees.
    const b = [...bids(senior.id, 'FT1'), ...bids(ptSenior.id, 'FT1', 'FT2', 'PT1'), ...bids(ptJunior.id, 'FT2', 'PT1')]
    const r = autoAssign({ ...base, employees: [senior, ptSenior, ptJunior], bids: b, optins: [optin(ptSenior.id)] })
    const got = Object.fromEntries(r.map(x => [x.employee_id, x.line_id ? SEED_LINES.find(l => l.id === x.line_id)!.code : null]))
    expect(got).toEqual({ 'Senior FT': 'FT1', 'Senior PT': 'FT2', 'Junior PT': 'PT1' }) // junior PT had no opt-in for FT2
  })

  it('respects positions (FLEX holds two) and availability', () => {
    const a = emp('A', { employment_type: 'PT', seniority_date: '2001-01-01' })
    const bb = emp('B', { employment_type: 'PT', seniority_date: '2002-01-01' })
    const c = emp('C', { employment_type: 'PT', seniority_date: '2003-01-01' })
    const b = [...bids('A', 'FLEX'), ...bids('B', 'FLEX'), ...bids('C', 'FLEX', 'PT2')]
    const avail = new Map<string, Availability>([['C', { 1: 1, 2: 1, 3: 1, 4: 0, 5: 0, 6: 0, 0: 0 }]])
    const r = autoAssign({ ...base, availability: avail, employees: [a, bb, c], bids: b, optins: [] })
    expect(r.map(x => x.line_id ? SEED_LINES.find(l => l.id === x.line_id)!.code : null)).toEqual(['FLEX', 'FLEX', null])
    expect(r[2].note).toMatch(/taken/)
    expect(openPositions(SEED_LINES, r).get(line('FLEX').id)).toBe(0)
  })

  it('no ranking = no line', () => {
    expect(autoAssign({ ...base, employees: [senior], bids: [], optins: [] })[0]).toMatchObject({ line_id: null, note: 'Did not rank any lines.' })
  })
})
