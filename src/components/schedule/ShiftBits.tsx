import type { ReactNode } from 'react'
import { useData } from '../../lib/data-context'
import { DOW_SHORT, dowOf, formatDate, shiftTimeLabel } from '../../lib/scheduling'
import type { Shift } from '../../types'

/** Compact "Mon, Nov 9 · AM Early · 5:30 am – trips complete" line used across the board. */
export function ShiftLine({ shift, right, sub }: { shift: Shift; right?: ReactNode; sub?: ReactNode }) {
  const data = useData()
  const block = data.blocksById.get(shift.block_id)
  return (
    <div className="flex items-center gap-3">
      <div className="w-11 text-center flex-shrink-0">
        <p className="text-[10px] font-semibold uppercase text-[#6B7A99]">{DOW_SHORT[dowOf(shift.date)]}</p>
        <p className="text-lg font-bold text-[#0B1A5C] leading-tight">{Number(shift.date.slice(8))}</p>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 rounded-md bg-[#0B1A5C] text-white text-[11px] font-bold">{block?.code}</span>
          <p className="font-medium text-[#0B1A5C] truncate">{formatDate(shift.date)} · {block?.name}{shift.role === 'attendant' ? ' · Attendant' : ''}</p>
        </div>
        {block && <p className="text-xs text-[#6B7A99] mt-0.5">{shiftTimeLabel(shift, block)} · {Number(shift.target_hours)} hrs target</p>}
        {sub}
      </div>
      {right}
    </div>
  )
}

export function StatusPill({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'amber' | 'green' | 'red' }) {
  const cls = {
    muted: 'bg-[#EEF1F8] text-[#6B7A99]',
    amber: 'bg-amber-100 text-amber-900',
    green: 'bg-[#E8F5EE] text-[#2E7D52]',
    red: 'bg-[#FCE9E9] text-[#CC2A2A]',
  }[tone]
  return <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{children}</span>
}
