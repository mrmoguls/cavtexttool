import { useEffect, useMemo, useState } from 'react'
import { useData } from '../../lib/data-context'
import { useAuth } from '../../lib/auth'
import { addDays, amStartStatus, formatDate, formatTime, nowHHMM, todayISO, toHHMM } from '../../lib/scheduling'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { ScrollBody, Segmented, TextInput, Warning } from '../../components/ui/Form'
import type { Shift } from '../../types'
import { Check, Clock } from 'lucide-react'

function settingTime(v: unknown, fallback: string) {
  return typeof v === 'string' ? v : fallback
}

/** Re-renders every minute so time-based warnings update on their own. */
export function useMinuteClock() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])
  return { today: todayISO(), now: nowHHMM() }
}

/** Status of tomorrow's variable (AM) start times, for the banner and the Starts tab badge. */
export function useTomorrowStarts() {
  const data = useData()
  const { today, now } = useMinuteClock()
  return amStartStatus({
    date: addDays(today, 1), shifts: data.shifts, blocksById: data.blocksById, today, now,
    warning: settingTime(data.settings.am_start_warning, '14:00'),
    deadline: settingTime(data.settings.am_start_deadline, '15:00'),
  })
}

export function AmStartBanner({ onOpen }: { onOpen: () => void }) {
  const data = useData()
  const status = useTomorrowStarts()
  if (status.phase !== 'warning' && status.phase !== 'overdue') return null
  const n = status.unset.length
  const deadline = formatTime(settingTime(data.settings.am_start_deadline, '15:00'))
  return (
    <button onClick={onOpen} className={`no-print w-full text-left px-4 py-2.5 text-sm font-medium flex items-center gap-2 ${status.phase === 'overdue' ? 'bg-[#CC2A2A] text-white' : 'bg-amber-100 text-amber-900'}`}>
      <Clock size={16} className="flex-shrink-0" />
      <span className="flex-1">
        {n} AM start time{n === 1 ? '' : 's'} for tomorrow {n === 1 ? 'is' : 'are'} not posted
        {status.phase === 'overdue' ? ` — past the ${deadline} deadline` : ` — due by ${deadline}`}
      </span>
      <span className="underline underline-offset-2">Post now</span>
    </button>
  )
}

export function DispatchStarts() {
  const data = useData()
  const { me } = useAuth()
  const { today } = useMinuteClock()
  const [which, setWhich] = useState<'tomorrow' | 'today' | 'pick'>('tomorrow')
  const [picked, setPicked] = useState(() => addDays(today, 2))
  const date = which === 'tomorrow' ? addDays(today, 1) : which === 'today' ? today : picked
  const deadline = formatTime(settingTime(data.settings.am_start_deadline, '15:00'))

  const shifts = useMemo(() => data.shifts
    .filter(s => s.date === date && s.status === 'scheduled' && s.employee_id && data.blocksById.get(s.block_id)?.start_type === 'variable')
    .sort((a, b) => (data.employeesById.get(a.employee_id!)?.name ?? '').localeCompare(data.employeesById.get(b.employee_id!)?.name ?? '')),
  [data.shifts, data.blocksById, data.employeesById, date])

  const posted = shifts.filter(s => s.start_time).length

  return (
    <ScrollBody>
      <Segmented
        value={which}
        options={[{ value: 'tomorrow', label: 'Tomorrow' }, { value: 'today', label: 'Today' }, { value: 'pick', label: 'Pick date' }]}
        onChange={setWhich}
      />
      {which === 'pick' && (
        <TextInput type="date" aria-label="Start times date" value={picked} min={today} onChange={e => setPicked(e.target.value || addDays(today, 2))} />
      )}
      <div>
        <p className="text-lg font-bold text-[#0B1A5C]">{formatDate(date)}</p>
        <p className="text-sm text-[#6B7A99]">
          Start = 30 minutes before the first scheduled pickup in Bambi. Post by {deadline} the day before (post Monday's on Friday if nobody works the weekend). Drivers get a notification.
        </p>
      </div>
      {shifts.length > 0 && (
        posted === shifts.length
          ? <div className="flex items-center gap-2 rounded-xl bg-[#E8F5EE] text-[#2E7D52] px-3 py-2 text-sm font-medium"><Check size={16} /> All {shifts.length} start times posted.</div>
          : <Warning tone={which === 'today' ? 'red' : 'amber'}>{shifts.length - posted} of {shifts.length} still need a start time.</Warning>
      )}
      {shifts.length === 0
        ? <EmptyState icon={<Clock />} title="No AM shifts" body="Nobody is scheduled on a variable-start block this day." />
        : shifts.map(s => <StartRow key={s.id} shift={s} postedBy={me?.id ?? null} />)}
    </ScrollBody>
  )
}

function StartRow({ shift, postedBy }: { shift: Shift; postedBy: string | null }) {
  const data = useData()
  const [value, setValue] = useState(toHHMM(shift.start_time))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const block = data.blocksById.get(shift.block_id)
  const line = shift.line_id ? data.lines.find(l => l.id === shift.line_id) : undefined
  const dirty = value !== toHHMM(shift.start_time)

  useEffect(() => { setValue(toHHMM(shift.start_time)) }, [shift.start_time])

  async function save() {
    if (!/^\d{2}:\d{2}$/.test(value)) { setError('Enter a time.'); return }
    setBusy(true)
    setError(null)
    try { await data.setShiftStart(shift, value, postedBy) }
    catch (err) { setError(err instanceof Error ? err.message : 'Save failed.') }
    finally { setBusy(false) }
  }

  return (
    <Card className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[#0B1A5C]">{data.employeesById.get(shift.employee_id!)?.name ?? 'Unknown'}</p>
          <p className="text-xs text-[#6B7A99]">{block?.code} · {block?.name}{line ? ` · ${line.code}` : ''}</p>
        </div>
        {shift.start_time && !dirty
          ? <span className="text-xs font-semibold text-[#2E7D52] flex items-center gap-1"><Check size={14} /> Posted</span>
          : <span className="text-xs font-semibold text-[#CC2A2A]">Not posted</span>}
      </div>
      <div className="flex gap-2">
        <TextInput type="time" aria-label={`Start time for ${data.employeesById.get(shift.employee_id!)?.name ?? 'driver'}`} value={value} onChange={e => setValue(e.target.value)} className="flex-1" />
        <Button onClick={save} disabled={busy || !value || !dirty}>{shift.start_time ? 'Update' : 'Post'}</Button>
      </div>
      {error && <Warning>{error}</Warning>}
    </Card>
  )
}
