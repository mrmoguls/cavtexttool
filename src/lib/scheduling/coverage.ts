import type { Block, CoverageRequirement, CrewRole, Dow, Employee, Line, LineAssignment, LineDay } from '../../types'
import { DISPLAY_WEEK } from './time'
import { activeAssignments } from './lines'

export type CoverageStatus = 'ok' | 'short' | 'over'

export interface CoverageCell {
  dow: Dow
  block: Block
  role: CrewRole
  required: number
  /** Positions on active lines that work this block on this day. */
  planned: number
  /** People currently holding those lines. */
  assigned: number
  assignedNames: string[]
  lineCodes: string[]
  status: CoverageStatus
  /** Required more than the lines even provide — needs a new line, not just a person. */
  noLine: boolean
}

export interface CoverageDay {
  dow: Dow
  cells: CoverageCell[]
  shortCount: number
}

export interface CoverageInput {
  blocks: Block[]
  lines: Line[]
  lineDays: LineDay[]
  requirements: CoverageRequirement[]
  assignments: LineAssignment[]
  employees: Pick<Employee, 'id' | 'name'>[]
  asOf: string
}

/** Typical-week coverage: required vs. planned (lines) vs. assigned (people), per day / block / role. */
export function computeCoverage(input: CoverageInput): CoverageDay[] {
  const blocksById = new Map(input.blocks.map(b => [b.id, b]))
  const linesById = new Map(input.lines.filter(l => l.active && !l.is_flex).map(l => [l.id, l]))
  const empName = new Map(input.employees.map(e => [e.id, e.name]))
  const current = activeAssignments(input.assignments, input.asOf)

  return DISPLAY_WEEK.map(dow => {
    const cells = new Map<string, CoverageCell>()
    const cellFor = (blockId: string, role: CrewRole): CoverageCell | null => {
      const block = blocksById.get(blockId)
      if (!block) return null
      const key = `${blockId}|${role}`
      let c = cells.get(key)
      if (!c) {
        c = { dow, block, role, required: 0, planned: 0, assigned: 0, assignedNames: [], lineCodes: [], status: 'ok', noLine: false }
        cells.set(key, c)
      }
      return c
    }

    for (const r of input.requirements) {
      if (r.dow !== dow) continue
      const c = cellFor(r.block_id, r.role)
      if (c) c.required += r.required_count
    }

    for (const ld of input.lineDays) {
      if (ld.dow !== dow) continue
      const line = linesById.get(ld.line_id)
      if (!line) continue
      const c = cellFor(ld.block_id, line.role)
      if (!c) continue
      c.planned += line.positions
      c.lineCodes.push(line.code)
      for (const a of current) {
        if (a.line_id !== line.id) continue
        c.assigned += 1
        c.assignedNames.push(empName.get(a.employee_id) ?? 'Unknown')
      }
    }

    const list = [...cells.values()]
    for (const c of list) {
      c.noLine = c.planned < c.required
      c.status = c.assigned < c.required ? 'short' : c.assigned > c.required ? 'over' : 'ok'
    }
    list.sort((a, b) =>
      a.block.sort_order - b.block.sort_order ||
      a.block.code.localeCompare(b.block.code) ||
      (a.role === 'driver' ? -1 : 1))

    return { dow, cells: list, shortCount: list.filter(c => c.status === 'short').length }
  })
}
