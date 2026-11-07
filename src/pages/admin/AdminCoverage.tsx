import { useMemo, useState } from 'react'
import { useData } from '../../lib/data-context'
import { computeCoverage, DOW_LONG, todayISO, type CoverageCell } from '../../lib/scheduling'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Field, ScrollBody, Select, SubHeader, TextInput, Warning } from '../../components/ui/Form'
import type { CrewRole, Dow } from '../../types'
import { CheckCircle, Minus, Plus, Pencil } from 'lucide-react'

export function AdminCoverage({ onBack }: { onBack: () => void }) {
  const data = useData()
  const [asOf, setAsOf] = useState(todayISO())
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const days = useMemo(() => computeCoverage({
    blocks: data.blocks, lines: data.lines, lineDays: data.lineDays, requirements: data.coverage,
    assignments: data.assignments, employees: data.employees, asOf,
  }), [data.blocks, data.lines, data.lineDays, data.coverage, data.assignments, data.employees, asOf])

  const totalShort = days.reduce((n, d) => n + d.shortCount, 0)
  const noLine = days.flatMap(d => d.cells.filter(c => c.noLine))

  async function change(dow: Dow, blockId: string, role: CrewRole, count: number) {
    setError(null)
    try { await data.setCoverage(dow, blockId, role, Math.max(0, count)) }
    catch (err) { setError(err instanceof Error ? err.message : 'Update failed.') }
  }

  return (
    <>
      <SubHeader
        title="Coverage"
        onBack={onBack}
        right={
          <Button size="sm" variant={editing ? 'primary' : 'secondary'} onClick={() => setEditing(e => !e)}>
            {editing ? 'Done' : <><Pencil size={14} /> Edit needs</>}
          </Button>
        }
      />
      <ScrollBody>
        <Field label="Typical week as of">
          <TextInput type="date" value={asOf} onChange={e => setAsOf(e.target.value || todayISO())} />
        </Field>

        {totalShort === 0
          ? (
            <div className="flex items-center gap-2 rounded-xl bg-[#E8F5EE] text-[#2E7D52] px-3 py-2 text-sm font-medium">
              <CheckCircle size={16} /> Every required block has someone assigned.
            </div>
          )
          : <Warning>{totalShort} required block{totalShort === 1 ? ' is' : 's are'} uncovered in a typical week.</Warning>}
        {noLine.length > 0 && (
          <Warning tone="amber">
            {noLine.length} need{noLine.length === 1 ? 's' : ''} more than the lines provide — add a line (or a growth line) to cover {noLine.length === 1 ? 'it' : 'them'}.
          </Warning>
        )}
        {error && <Warning>{error}</Warning>}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#6B7A99] px-1">
          <span><b className="text-[#0B1A5C]">assigned / needed</b></span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#CC2A2A]" /> uncovered</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#2E7D52]" /> covered</span>
        </div>

        {days.map(day => (
          <Card key={day.dow} className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-[#0B1A5C]">{DOW_LONG[day.dow]}</p>
              {day.shortCount > 0
                ? <span className="text-xs font-semibold text-[#CC2A2A]">{day.shortCount} uncovered</span>
                : day.cells.length > 0 && <span className="text-xs font-semibold text-[#2E7D52]">Covered</span>}
            </div>
            {day.cells.length === 0 && <p className="text-sm text-[#6B7A99]">Nothing scheduled.</p>}
            {day.cells.map(cell => (
              <CoverageRow key={`${cell.block.id}|${cell.role}`} cell={cell} editing={editing} onChange={n => change(day.dow, cell.block.id, cell.role, n)} />
            ))}
            {editing && <AddRequirement dow={day.dow} existing={day.cells} onAdd={(b, r) => change(day.dow, b, r, 1)} />}
          </Card>
        ))}
      </ScrollBody>
    </>
  )
}

function CoverageRow({ cell, editing, onChange }: { cell: CoverageCell; editing: boolean; onChange: (n: number) => void }) {
  const short = cell.status === 'short'
  return (
    <div className={`rounded-xl px-3 py-2 border ${short ? 'bg-[#FCE9E9] border-[#E03A3A]/40' : 'bg-[#EEF1F8] border-transparent'}`}>
      <div className="flex items-center gap-2">
        <span className="min-w-11 text-center px-1.5 py-0.5 rounded-md bg-[#0B1A5C] text-white text-[11px] font-bold">{cell.block.code}</span>
        <span className="flex-1 text-sm text-[#0B1A5C]">{cell.role === 'attendant' ? 'Attendant' : 'Driver'}</span>
        {editing ? (
          <div className="flex items-center gap-1">
            <button onClick={() => onChange(cell.required - 1)} className="p-1 rounded-lg bg-white text-[#0B1A5C]" aria-label="Fewer needed"><Minus size={14} /></button>
            <span className="w-14 text-center text-sm font-semibold text-[#0B1A5C]">need {cell.required}</span>
            <button onClick={() => onChange(cell.required + 1)} className="p-1 rounded-lg bg-white text-[#0B1A5C]" aria-label="More needed"><Plus size={14} /></button>
          </div>
        ) : (
          <span className={`text-sm font-bold ${short ? 'text-[#CC2A2A]' : cell.status === 'over' ? 'text-[#1B2E6B]' : 'text-[#2E7D52]'}`}>
            {cell.assigned} / {cell.required}
          </span>
        )}
      </div>
      <p className={`text-xs mt-1 ${short ? 'text-[#A82020]' : 'text-[#6B7A99]'}`}>
        {cell.assignedNames.length ? cell.assignedNames.join(', ') : 'Nobody assigned'}
        {cell.lineCodes.length > 0 && ` · ${cell.lineCodes.join(', ')}`}
        {cell.noLine && ' · no line covers this'}
        {cell.status === 'over' && ' · more than needed'}
      </p>
    </div>
  )
}

function AddRequirement({ dow, existing, onAdd }: { dow: Dow; existing: CoverageCell[]; onAdd: (blockId: string, role: CrewRole) => void }) {
  const data = useData()
  const options = data.blocks.filter(b => b.active).flatMap(b =>
    b.crew_roles.map(role => ({ key: `${b.id}|${role}`, label: `${b.code} · ${role === 'attendant' ? 'Attendant' : 'Driver'}`, blockId: b.id, role })))
    .filter(o => !existing.some(c => c.block.id === o.blockId && c.role === o.role && c.required > 0))
  if (options.length === 0) return null
  return (
    <Select
      value=""
      onChange={e => {
        const o = options.find(x => x.key === e.target.value)
        if (o) onAdd(o.blockId, o.role)
      }}
      aria-label={`Add a need on ${DOW_LONG[dow]}`}
    >
      <option value="">+ Add a need…</option>
      {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
    </Select>
  )
}
