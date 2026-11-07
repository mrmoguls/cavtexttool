import type { Block } from '../../types'
import { formatTime } from './time'

export const TARGET_DISCLAIMER =
  "Hours shown are targets, not guarantees. Actual start and end times depend on the day's trips."

export function isVariable(block: Pick<Block, 'start_type' | 'end_type'>): boolean {
  return block.start_type === 'variable' || block.end_type === 'variable'
}

/** Short label like "8:30 am – 5:00 pm" or "12:00 pm – last drop-off". */
export function blockTimeLabel(block: Block, startTime?: string | null): string {
  const start = block.start_type === 'fixed'
    ? formatTime(block.default_start)
    : startTime ? formatTime(startTime) : 'Start posted day before'
  const end = block.end_type === 'fixed'
    ? formatTime(block.default_end)
    : 'last drop-off'
  return `${start} – ${end}`
}

/**
 * The "what this shift means" language shown on block and shift detail.
 * `startTime` is the posted start for variable-start shifts (AM), if known.
 * `deadline` is when variable start times are posted the day before (default 3:00 pm).
 */
export function blockInstructions(
  block: Block,
  opts: { startTime?: string | null; deadline?: string } = {},
): string[] {
  const out: string[] = []
  const deadline = formatTime(opts.deadline ?? '15:00')

  if (block.start_type === 'variable') {
    const rule = block.start_rule_note || 'before your first scheduled pickup'
    out.push(`Report ${rule}. Your start time will be posted by ${deadline} the day before.`)
  }

  const knownStart = block.start_type === 'fixed' ? block.default_start : opts.startTime ?? null
  if (block.end_type === 'variable') {
    if (knownStart) {
      out.push(`Report at ${formatTime(knownStart)} and work through your last scheduled drop-off.`)
    } else if (block.start_type === 'fixed') {
      out.push('Work through your last scheduled drop-off.')
    }
  } else if (block.start_type === 'fixed') {
    out.push(`Report at ${formatTime(block.default_start)}. Shift ends at ${formatTime(block.default_end)}.`)
  }

  if (isVariable(block)) out.push(TARGET_DISCLAIMER)
  return out
}

export function crewLabel(block: Pick<Block, 'crew_roles'>): string {
  return block.crew_roles.includes('attendant') ? 'Driver + attendant' : 'Driver'
}
