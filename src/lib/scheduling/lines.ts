import type { Block, Dow, Line, LineAssignment, LineDay } from '../../types'
import { DISPLAY_WEEK, DOW_SHORT, isActiveOn, rangesOverlap } from './time'

/** Days of a line in display order (Mon … Sun). */
export function sortedLineDays(days: LineDay[]): LineDay[] {
  return [...days].sort((a, b) => DISPLAY_WEEK.indexOf(a.dow) - DISPLAY_WEEK.indexOf(b.dow))
}

function compressDays(dows: Dow[]): string {
  // dows are already in display order; collapse runs of 3+ consecutive days into ranges.
  const idx = dows.map(d => DISPLAY_WEEK.indexOf(d))
  const parts: string[] = []
  let i = 0
  while (i < idx.length) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++
    if (j - i >= 2) {
      parts.push(`${DOW_SHORT[dows[i]]}–${DOW_SHORT[dows[j]]}`)
    } else {
      for (let k = i; k <= j; k++) parts.push(DOW_SHORT[dows[k]])
    }
    i = j + 1
  }
  return parts.join(', ')
}

/** "Mon–Fri AM", "Thu, Fri PM + Sat SAT", "Sat SATG + Sun SUNG". */
export function lineSummary(line: Pick<Line, 'is_flex'>, days: LineDay[], blocksById: Map<string, Block>): string {
  if (line.is_flex || days.length === 0) return 'No fixed blocks · on-call + fill-ins'
  const ordered = sortedLineDays(days)
  const groups: { blockId: string; dows: Dow[] }[] = []
  for (const d of ordered) {
    const g = groups.find(x => x.blockId === d.block_id)
    if (g) g.dows.push(d.dow)
    else groups.push({ blockId: d.block_id, dows: [d.dow] })
  }
  return groups
    .map(g => `${compressDays(g.dows)} ${blocksById.get(g.blockId)?.code ?? '?'}`)
    .join(' + ')
}

/** Sum of target paid hours of a line's blocks (computed, never stored). */
export function lineTargetHours(days: LineDay[], blocksById: Map<string, Block>): number {
  return days.reduce((sum, d) => sum + Number(blocksById.get(d.block_id)?.target_paid_hours ?? 0), 0)
}

export function activeAssignments(assignments: LineAssignment[], asOf: string): LineAssignment[] {
  return assignments.filter(a => isActiveOn(a.effective_from, a.effective_to, asOf))
}

/**
 * Problems that would stop a new assignment (mirrors the database trigger so people get a
 * friendly message before saving). Empty array = OK.
 */
export function assignmentConflicts(
  draft: Pick<LineAssignment, 'line_id' | 'employee_id' | 'effective_from' | 'effective_to'> & { id?: string },
  line: Pick<Line, 'positions' | 'code'>,
  existing: LineAssignment[],
): string[] {
  const problems: string[] = []
  if (draft.effective_to && draft.effective_to < draft.effective_from) {
    problems.push('End date is before start date.')
  }
  const others = existing.filter(a => a.id !== draft.id)
  if (others.some(a => a.employee_id === draft.employee_id &&
      rangesOverlap(a.effective_from, a.effective_to, draft.effective_from, draft.effective_to))) {
    problems.push('This person already holds a line for part of that date range.')
  }
  const taken = others.filter(a => a.line_id === draft.line_id &&
    rangesOverlap(a.effective_from, a.effective_to, draft.effective_from, draft.effective_to)).length
  if (taken >= line.positions) {
    problems.push(`${line.code} has no open positions for that date range.`)
  }
  return problems
}
