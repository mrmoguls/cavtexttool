import { useMemo, useState } from 'react'
import { useData } from '../../lib/data-context'
import {
  addDays, blockInstructions, DISPLAY_WEEK, DOW_SHORT, dowOf, formatDate, formatTime, isActiveOn,
  lineSummary, lineTargetHours, mondayOf, needsPostedStart, shiftTimeLabel, todayISO, totalTargetHours,
} from '../../lib/scheduling'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { ScrollBody, Segmented, SectionLabel, SubHeader } from '../../components/ui/Form'
import type { Employee, Shift } from '../../types'
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { ShiftActions } from './ShiftActions'
import { BidBanner, DriverBid } from './DriverBid'
import type { BidPeriod } from '../../types'
import { StatusPill } from '../../components/schedule/ShiftBits'
import { isActive, REQUEST_STATUS_LABEL } from '../../lib/scheduling'

const LOOKAHEAD_DAYS = 28

function dayLabel(date: string, today: string) {
  if (date === today) return 'Today'
  if (date === addDays(today, 1)) return 'Tomorrow'
  return formatDate(date)
}

export function DriverSchedule({ driver, onMessageDispatch }: { driver: Employee; onMessageDispatch?: () => void }) {
  const data = useData()
  const today = todayISO()
  const [view, setView] = useState<'list' | 'week'>('list')
  const [weekStart, setWeekStart] = useState(() => mondayOf(today))
  const [open, setOpen] = useState<Shift | null>(null)
  const [bidding, setBidding] = useState<BidPeriod | null>(null)

  const mine = useMemo(
    () => data.shifts
      .filter(s => s.employee_id === driver.id && s.status === 'scheduled')
      .sort((a, b) => a.date.localeCompare(b.date) || (a.start_time ?? '').localeCompare(b.start_time ?? '')),
    [data.shifts, driver.id],
  )

  if (bidding) {
    const fresh = data.bidPeriods.find(p => p.id === bidding.id) ?? bidding
    return <DriverBid driver={driver} period={fresh} onBack={() => setBidding(null)} />
  }

  if (open) {
    const fresh = data.shifts.find(s => s.id === open.id) ?? open
    return <ShiftDetail shift={fresh} onBack={() => setOpen(null)} onMessageDispatch={onMessageDispatch} />
  }

  const assignment = data.assignments.find(a => a.employee_id === driver.id && isActiveOn(a.effective_from, a.effective_to, today))
  const nextAssignment = data.assignments
    .filter(a => a.employee_id === driver.id && a.effective_from > today)
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from))[0]
  const nextLine = nextAssignment ? data.lines.find(l => l.id === nextAssignment.line_id) : undefined
  const line = assignment ? data.lines.find(l => l.id === assignment.line_id) : undefined
  const lineDays = line ? data.lineDays.filter(d => d.line_id === line.id) : []

  const upcoming = mine.filter(s => s.date >= today && s.date <= addDays(today, LOOKAHEAD_DAYS - 1))
  const weeks = new Map<string, Shift[]>()
  for (const s of upcoming) {
    const k = mondayOf(s.date)
    weeks.set(k, [...(weeks.get(k) ?? []), s])
  }

  return (
    <ScrollBody>
      <BidBanner driver={driver} onOpen={setBidding} />
      <Card>
        <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide">Your line</p>
        {line ? (
          <div className="flex items-center gap-3 mt-2">
            <span className="min-w-12 text-center px-2 py-1 rounded-lg bg-[#0B1A5C] text-white text-xs font-bold">{line.code}</span>
            <div>
              <p className="font-medium text-[#0B1A5C]">{lineSummary(line, lineDays, data.blocksById)}</p>
              <p className="text-xs text-[#6B7A99]">
                {line.is_flex ? 'On-call and fill-ins' : `${lineTargetHours(lineDays, data.blocksById)} hrs/week target`} · {line.employment_type === 'FT' ? 'Full-time' : 'Part-time'}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[#6B7A99] mt-1">You don't hold a line right now. Dispatch will add any shifts you pick up.</p>
        )}
        {nextLine && nextAssignment && (
          <p className="text-sm text-[#1B2E6B] mt-2">From {formatDate(nextAssignment.effective_from)}: <b>{nextLine.code}</b> · {lineSummary(nextLine, data.lineDays.filter(d => d.line_id === nextLine.id), data.blocksById)}</p>
        )}
      </Card>

      <Segmented value={view} options={[{ value: 'list', label: 'List' }, { value: 'week', label: 'Week' }]} onChange={setView} />

      {view === 'list' ? (
        upcoming.length === 0
          ? <EmptyState icon={<CalendarDays />} title="No shifts scheduled" body="Your next four weeks are clear. New shifts show up here as soon as they're scheduled." />
          : [...weeks.entries()].map(([monday, list]) => (
            <div key={monday} className="space-y-2">
              <SectionLabel>
                Week of {formatDate(monday)} · {totalTargetHours(list)} hrs target
              </SectionLabel>
              {list.map(s => <ShiftCard key={s.id} shift={s} today={today} onOpen={() => setOpen(s)} />)}
            </div>
          ))
      ) : (
        <WeekView shifts={mine} weekStart={weekStart} today={today} onWeek={setWeekStart} onOpen={setOpen} />
      )}
    </ScrollBody>
  )
}

function ShiftCard({ shift, today, onOpen }: { shift: Shift; today: string; onOpen: () => void }) {
  const data = useData()
  const block = data.blocksById.get(shift.block_id)
  if (!block) return null
  const unposted = needsPostedStart(shift, block)
  const pending = data.requests.find(r => isActive(r) && (r.shift_id === shift.id || r.swap_shift_id === shift.id))
  // Only flag a missing start once it's due (the day before); further out it's normal.
  const waiting = unposted && shift.date <= addDays(today, 1)
  const deadline = typeof data.settings.am_start_deadline === 'string' ? data.settings.am_start_deadline : '15:00'
  const timeText = unposted && !waiting
    ? `Start time posted by ${formatTime(deadline)} the day before`
    : shiftTimeLabel(shift, block)
  return (
    <Card onClick={onOpen} className={shift.date === today ? 'border-2 border-[#0B1A5C]/30' : ''}>
      <div className="flex items-start gap-3">
        <div className="w-12 text-center flex-shrink-0">
          <p className="text-[10px] font-semibold uppercase text-[#6B7A99]">{DOW_SHORT[dowOf(shift.date)]}</p>
          <p className="text-xl font-bold text-[#0B1A5C] leading-tight">{Number(shift.date.slice(8))}</p>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 rounded-md bg-[#0B1A5C] text-white text-[11px] font-bold">{block.code}</span>
            <p className="font-medium text-[#0B1A5C] truncate">{dayLabel(shift.date, today)} · {block.name}</p>
          </div>
          <p className={`text-sm mt-1 ${waiting ? 'text-[#CC2A2A]' : unposted ? 'text-[#6B7A99]' : 'text-[#1B2E6B]'}`}>{timeText}</p>
          <div className="flex flex-wrap gap-1 mt-1.5">
            <Badge variant="muted">{Number(shift.target_hours)} hrs target</Badge>
            {shift.role === 'attendant' && <Badge variant="muted">Attendant</Badge>}
            {block.start_type === 'variable' && !unposted && <Badge variant="sage">Start posted</Badge>}
            {pending && <StatusPill tone="amber">{REQUEST_STATUS_LABEL[pending.status]}</StatusPill>}
          </div>
        </div>
      </div>
    </Card>
  )
}

function WeekView({ shifts, weekStart, today, onWeek, onOpen }: {
  shifts: Shift[]; weekStart: string; today: string; onWeek: (d: string) => void; onOpen: (s: Shift) => void
}) {
  const data = useData()
  const days = DISPLAY_WEEK.map((_, i) => addDays(weekStart, i))
  const inWeek = shifts.filter(s => s.date >= days[0] && s.date <= days[6])
  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between">
        <button onClick={() => onWeek(addDays(weekStart, -7))} className="p-1.5 rounded-lg hover:bg-[#EEF1F8]" aria-label="Previous week"><ChevronLeft size={18} /></button>
        <div className="text-center">
          <p className="font-semibold text-[#0B1A5C]">{formatDate(days[0])} – {formatDate(days[6])}</p>
          <p className="text-xs text-[#6B7A99]">{totalTargetHours(inWeek)} hrs target</p>
        </div>
        <button onClick={() => onWeek(addDays(weekStart, 7))} className="p-1.5 rounded-lg hover:bg-[#EEF1F8]" aria-label="Next week"><ChevronRight size={18} /></button>
      </div>
      {days.map(date => {
        const list = inWeek.filter(s => s.date === date)
        return (
          <div key={date} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${date === today ? 'bg-[#EEF1F8]' : ''}`}>
            <span className={`w-14 text-sm ${date === today ? 'font-bold text-[#0B1A5C]' : 'text-[#1B2E6B]'}`}>
              {DOW_SHORT[dowOf(date)]} {Number(date.slice(8))}
            </span>
            <div className="flex-1 flex flex-wrap gap-1.5">
              {list.length === 0 && <span className="text-sm text-[#6B7A99]">Off</span>}
              {list.map(s => {
                const b = data.blocksById.get(s.block_id)
                return (
                  <button key={s.id} onClick={() => onOpen(s)} className="flex items-center gap-1.5 bg-[#0B1A5C] text-white rounded-lg px-2 py-1 text-xs font-semibold">
                    {b?.code}
                    <span className="font-normal text-white/80">{s.start_time ? formatTime(s.start_time) : b?.start_type === 'variable' ? 'start TBD' : ''}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
      {data.generatedThrough && days[0] > data.generatedThrough && (
        <p className="text-xs text-[#6B7A99] text-center">This week hasn't been scheduled yet.</p>
      )}
    </Card>
  )
}

export function ShiftDetail({ shift, onBack, onMessageDispatch }: { shift: Shift; onBack: () => void; onMessageDispatch?: () => void }) {
  const data = useData()
  const block = data.blocksById.get(shift.block_id)
  const line = shift.line_id ? data.lines.find(l => l.id === shift.line_id) : undefined
  const deadline = typeof data.settings.am_start_deadline === 'string' ? data.settings.am_start_deadline : '15:00'
  if (!block) return null
  return (
    <>
      <SubHeader title={`${formatDate(shift.date)} · ${block.name}`} onBack={onBack} />
      <ScrollBody>
        {shift.status === 'open' && (
          <div className="rounded-xl bg-[#FCE9E9] text-[#A82020] px-3 py-2 text-sm font-medium">You're no longer on this shift. It's an open shift now.</div>
        )}
        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 rounded-lg bg-[#0B1A5C] text-white text-xs font-bold">{block.code}</span>
            <p className="font-semibold text-[#0B1A5C]">{block.name}{shift.role === 'attendant' ? ' · Attendant' : ''}</p>
          </div>
          <div className="flex items-center gap-2 text-[#0B1A5C]">
            <Clock size={18} />
            <p className="text-lg font-semibold">{shiftTimeLabel(shift, block)}</p>
          </div>
          <p className="text-sm text-[#6B7A99]">{Number(shift.target_hours)} paid hours target{line ? ` · Line ${line.code}` : ''}</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide">What to expect</p>
          {blockInstructions(block, { startTime: shift.start_time, deadline }).map(t => (
            <p key={t} className="text-sm text-[#1B2E6B] leading-relaxed">{t}</p>
          ))}
          {shift.start_posted_at && (
            <p className="text-xs text-[#6B7A99]">Start time posted {new Date(shift.start_posted_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', hour: 'numeric', minute: '2-digit' })}.</p>
          )}
        </Card>
        <ShiftActions shift={shift} onMessageDispatch={onMessageDispatch} />
      </ScrollBody>
    </>
  )
}
