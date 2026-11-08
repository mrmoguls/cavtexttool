// Seniority line assignment for a bid period.
import type { Availability, Bid, BidOptin, Employee, Line, LineDay } from '../../types'
import { compareSeniority, lineBidProblems } from './eligibility'

export interface AssignmentResult {
  employee_id: string
  line_id: string | null
  rank_got: number | null
  /** 1 = most senior bidder; FT employees come before PT. */
  seniority_order: number
  note: string
}

/** Who bids on lines: active drivers and attendants, except backup drivers. */
export function isBidder(e: Pick<Employee, 'active' | 'role' | 'bids_on_lines'>): boolean {
  return e.active && (e.role === 'driver' || e.role === 'attendant') && e.bids_on_lines !== false
}

/** Bidding order: full-time by seniority, then part-time by seniority. */
export function biddingOrder<T extends Employee>(employees: T[]): T[] {
  const bidders = employees.filter(isBidder)
  const ft = bidders.filter(e => e.employment_type === 'FT').sort(compareSeniority)
  const pt = bidders.filter(e => e.employment_type === 'PT').sort(compareSeniority)
  return [...ft, ...pt]
}

/**
 * Each bidder, in order, gets their highest-ranked line that still has an open position and
 * that they're eligible for. Full-time employees go first, so full-time lines only reach
 * part-time employees (who opted in to full-time) once every full-time bidder has a line.
 */
export function autoAssign(input: {
  employees: Employee[]
  lines: Line[]          // lines in the period
  lineDays: LineDay[]
  bids: Bid[]
  optins: BidOptin[]
  availability: Map<string, Availability | null | undefined>
}): AssignmentResult[] {
  const remaining = new Map(input.lines.map(l => [l.id, l.positions]))
  const linesById = new Map(input.lines.map(l => [l.id, l]))
  const out: AssignmentResult[] = []

  biddingOrder(input.employees).forEach((e, i) => {
    const ranked = input.bids.filter(b => b.employee_id === e.id).sort((a, b) => a.rank - b.rank)
    const wantsFullTime = input.optins.find(o => o.employee_id === e.id)?.wants_full_time ?? false
    const base = { employee_id: e.id, seniority_order: i + 1 }
    if (ranked.length === 0) {
      out.push({ ...base, line_id: null, rank_got: null, note: 'Did not rank any lines.' })
      return
    }
    for (const b of ranked) {
      const line = linesById.get(b.line_id)
      if (!line || (remaining.get(line.id) ?? 0) <= 0) continue
      const days = input.lineDays.filter(d => d.line_id === line.id)
      const { problems } = lineBidProblems(e, line, days, input.availability.get(e.id), { wantsFullTime })
      if (problems.length) continue
      remaining.set(line.id, (remaining.get(line.id) ?? 0) - 1)
      out.push({ ...base, line_id: line.id, rank_got: b.rank, note: b.rank === 1 ? 'Got first choice.' : `Got choice #${b.rank}.` })
      return
    }
    out.push({ ...base, line_id: null, rank_got: null, note: 'Every line they ranked was taken by someone more senior.' })
  })
  return out
}

/** Positions left on each line after a set of results (for the admin review screen). */
export function openPositions(lines: Line[], results: Pick<AssignmentResult, 'line_id'>[]): Map<string, number> {
  const left = new Map(lines.map(l => [l.id, l.positions]))
  for (const r of results) if (r.line_id) left.set(r.line_id, (left.get(r.line_id) ?? 0) - 1)
  return left
}
