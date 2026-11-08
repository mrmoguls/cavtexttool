import { useMemo, useRef, useState } from 'react'
import { useData } from '../../lib/data-context'
import { addDays, buildRoster, drivingBlockers, formatDate, needsPostedStart, rosterText, shiftTimeLabel, todayISO } from '../../lib/scheduling'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { ScrollBody, Segmented, TextInput, Warning } from '../../components/ui/Form'
import { CalendarDays, Copy, Printer, Check, ChevronRight } from 'lucide-react'
import { ShiftSheet, FillSlot } from './ShiftSheet'
import { TileIcon, isSetUp, useMyTiles } from '../../components/tiles/Tiles'
import type { Block, CrewRole } from '../../types'

type Day = 'today' | 'tomorrow' | 'pick'

export function DispatchRoster() {
  const data = useData()
  const today = todayISO()
  const [day, setDay] = useState<Day>('today')
  const [picked, setPicked] = useState(addDays(today, 2))
  const [copied, setCopied] = useState(false)
  const [showText, setShowText] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const [openShift, setOpenShift] = useState<string | null>(null)
  const [fill, setFill] = useState<{ block: Block; role: CrewRole } | null>(null)
  const quickLinks = useMyTiles().filter(isSetUp)

  const date = day === 'today' ? today : day === 'tomorrow' ? addDays(today, 1) : picked
  const groups = useMemo(() => buildRoster({
    date, shifts: data.shifts, blocks: data.blocks, employees: data.employees, requirements: data.coverage,
  }), [date, data.shifts, data.blocks, data.employees, data.coverage])

  const working = groups.reduce((n, g) => n + g.rows.filter(r => !r.uncovered).length, 0)
  const uncovered = groups.reduce((n, g) => n + g.rows.filter(r => r.uncovered).length, 0)
  const text = rosterText(date, groups)
  const notGenerated = !data.generatedThrough || date > data.generatedThrough
  const offToday = data.timeOff.filter(t => t.status === 'approved' && t.start_date <= date && t.end_date >= date)

  if (openShift) return <ShiftSheet shiftId={openShift} onBack={() => setOpenShift(null)} />
  if (fill) return <FillSlot date={date} block={fill.block} role={fill.role} onBack={() => setFill(null)} />

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked: show the text so it can be selected by hand.
      setShowText(true)
      setTimeout(() => textRef.current?.select(), 50)
    }
  }

  return (
    <ScrollBody>
      {quickLinks.length > 0 && (
        <div className="no-print flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {quickLinks.map(t => (
            <a key={t.id} href={t.url!} target={/^https?:/i.test(t.url!) ? '_blank' : undefined} rel="noreferrer"
              onClick={() => data.recordTap(t.id, 'home')}
              className="flex items-center gap-1.5 bg-white rounded-full px-3 py-1.5 text-xs font-semibold text-[#0B1A5C] whitespace-nowrap border border-[#D8DFEF]">
              <TileIcon tile={t} size={14} /> {t.name}
            </a>
          ))}
        </div>
      )}
      <div className="no-print space-y-3">
        <Segmented
          value={day}
          options={[{ value: 'today', label: 'Today' }, { value: 'tomorrow', label: 'Tomorrow' }, { value: 'pick', label: 'Pick date' }]}
          onChange={setDay}
        />
        {day === 'pick' && <TextInput type="date" aria-label="Roster date" value={picked} onChange={e => setPicked(e.target.value || today)} />}
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-lg font-bold text-[#0B1A5C]">{formatDate(date)}</p>
          <p className="text-sm text-[#6B7A99]">
            {working} working{uncovered > 0 && <span className="text-[#CC2A2A] font-semibold"> · {uncovered} uncovered</span>}
          </p>
        </div>
        <div className="flex gap-2 no-print">
          <Button size="sm" variant="secondary" onClick={copy}>
            {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => window.print()} aria-label="Print roster"><Printer size={14} /></Button>
        </div>
      </div>

      {showText && (
        <div className="no-print space-y-1">
          <p className="text-xs text-[#6B7A99]">Copying isn't allowed here. Select the text below and copy it.</p>
          <textarea ref={textRef} readOnly value={text} rows={10} className="w-full text-xs font-mono bg-white rounded-xl p-3 border border-[#D8DFEF]" />
        </div>
      )}

      {notGenerated && (
        <Warning tone="amber">Shifts haven't been generated for this date yet. Admin → Schedule → Generate shifts.</Warning>
      )}

      {offToday.length > 0 && (
        <p className="text-sm text-[#6B7A99] px-1">Off (approved time off): {offToday.map(t => data.employeesById.get(t.employee_id)?.name ?? 'Unknown').join(', ')}</p>
      )}

      {groups.length === 0
        ? <EmptyState icon={<CalendarDays />} title="Nobody scheduled" body="No shifts or coverage needs for this day." />
        : groups.map(g => (
          <Card key={g.block.id} className="space-y-2 break-inside-avoid">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-[#0B1A5C] text-white text-xs font-bold">{g.block.code}</span>
              <p className="font-semibold text-[#0B1A5C]">{g.block.name}</p>
            </div>
            {g.rows.map((r, i) => {
              const waiting = r.shift && !r.uncovered && needsPostedStart(r.shift, g.block)
              return (
                <button
                  key={r.shift?.id ?? `gap-${r.role}-${i}`}
                  onClick={() => r.shift ? setOpenShift(r.shift.id) : setFill({ block: g.block, role: r.role })}
                  className={`w-full text-left flex items-center gap-3 rounded-xl px-3 py-2 ${r.uncovered ? 'bg-[#FCE9E9] border border-[#E03A3A]/40' : 'bg-[#EEF1F8]'}`}
                >
                  <span className="w-20 text-xs font-semibold uppercase tracking-wide text-[#6B7A99]">{r.role === 'attendant' ? 'Attendant' : 'Driver'}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${r.uncovered ? 'text-[#CC2A2A]' : 'text-[#0B1A5C]'}`}>{r.uncovered ? 'Uncovered' : r.name}</p>
                    {r.shift && !r.uncovered && (
                      <p className={`text-xs ${waiting ? 'text-[#CC2A2A] font-semibold' : 'text-[#6B7A99]'}`}>{shiftTimeLabel(r.shift, g.block)}</p>
                    )}
                    {r.uncovered && <p className="text-xs text-[#A82020]">{r.shift ? 'Open shift — tap to assign' : 'Tap to fill'}</p>}
                    {r.shift?.employee_id && r.role === 'driver' && drivingBlockers(data.complianceItems, r.shift.employee_id, today).map(i => (
                      <p key={i.id} className="text-xs font-semibold text-[#CC2A2A]">{i.requirement} expired</p>
                    ))}
                  </div>
                  <ChevronRight size={16} className="text-[#6B7A99] no-print" />
                </button>
              )
            })}
          </Card>
        ))}
    </ScrollBody>
  )
}
