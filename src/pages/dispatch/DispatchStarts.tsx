import { useEffect, useMemo, useState } from 'react'
import { useData } from '../../lib/data-context'
import { useAuth } from '../../lib/auth'
import { addDays, amStartStatus, formatDate, formatTime, nowHHMM, startFromPickup, startMessage, todayISO, toHHMM } from '../../lib/scheduling'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field, ScrollBody, Segmented, TextInput, Warning } from '../../components/ui/Form'
import { StatusPill } from '../../components/schedule/ShiftBits'
import type { Shift } from '../../types'
import { BellRing, Check, Clock, MessageSquareText } from 'lucide-react'

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

/** Tomorrow's posted start times the driver hasn't confirmed yet, and whether it's past the cutoff. */
export function useUnconfirmedStarts() {
  const data = useData()
  const { today, now } = useMinuteClock()
  const cutoff = settingTime(data.settings.start_confirm_by, '19:00')
  const waiting = data.shifts.filter(s => s.date === addDays(today, 1) && s.status === 'scheduled' && s.employee_id && s.start_time && s.start_posted_at && !s.start_confirmed_at)
  return { waiting, late: now >= cutoff, cutoff }
}

export function AmStartBanner({ onOpen }: { onOpen: () => void }) {
  const data = useData()
  const status = useTomorrowStarts()
  const unconfirmed = useUnconfirmedStarts()
  if (status.phase !== 'warning' && status.phase !== 'overdue') {
    if (!unconfirmed.late || unconfirmed.waiting.length === 0) return null
    const n = unconfirmed.waiting.length
    return (
      <button onClick={onOpen} className="no-print w-full text-left px-4 py-2.5 text-sm font-medium flex items-center gap-2 bg-[#CC2A2A] text-white">
        <Clock size={16} className="flex-shrink-0" />
        <span className="flex-1">{n} driver{n === 1 ? " hasn't" : "s haven't"} confirmed tomorrow's start time</span>
        <span className="underline underline-offset-2">Follow up</span>
      </button>
    )
  }
  const n = status.unset.length
  const deadline = formatTime(settingTime(data.settings.am_start_deadline, '15:00'))
  return (
    <button onClick={onOpen} className={`no-print w-full text-left px-4 py-2.5 text-sm font-medium flex items-center gap-2 ${status.phase === 'overdue' ? 'bg-[#CC2A2A] text-white' : 'bg-amber-100 text-amber-900'}`}>
      <Clock size={16} className="flex-shrink-0" />
      <span className="flex-1">
        {n} start time{n === 1 ? '' : 's'} for tomorrow {n === 1 ? 'is' : 'are'} not posted
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
  const confirmed = shifts.filter(s => s.start_time && s.start_confirmed_at).length
  const cutoff = formatTime(settingTime(data.settings.start_confirm_by, '19:00'))

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
          Enter each driver's first pickup from Bambi; the start fills in 30 minutes earlier. Post by {deadline} the day before
          (post Monday's on Friday if nobody works the weekend). Drivers get "start 7:30 am for an 8:00 am pickup" and tap Confirm.
          Anyone not confirmed by {cutoff} is flagged.
        </p>
      </div>
      {shifts.length > 0 && (
        posted === shifts.length
          ? <div className="flex items-center gap-2 rounded-xl bg-[#E8F5EE] text-[#2E7D52] px-3 py-2 text-sm font-medium"><Check size={16} /> All {shifts.length} start times posted.</div>
          : <Warning tone={which === 'today' ? 'red' : 'amber'}>{shifts.length - posted} of {shifts.length} still need a start time.</Warning>
      )}
      {posted > 0 && (
        confirmed === posted
          ? <div className="flex items-center gap-2 rounded-xl bg-[#E8F5EE] text-[#2E7D52] px-3 py-2 text-sm font-medium"><Check size={16} /> All {posted} posted start{posted === 1 ? '' : 's'} confirmed by the driver.</div>
          : <p className="text-sm text-[#1B2E6B] px-1"><b>{confirmed} of {posted}</b> drivers have confirmed.</p>
      )}
      {shifts.length === 0
        ? <EmptyState icon={<Clock />} title="No AM shifts" body="Nobody is scheduled on a variable-start block this day." />
        : shifts.map(s => <StartRow key={s.id} shift={s} postedBy={me?.id ?? null} />)}
    </ScrollBody>
  )
}

function StartRow({ shift, postedBy }: { shift: Shift; postedBy: string | null }) {
  const data = useData()
  const [pickup, setPickup] = useState(toHHMM(shift.first_pickup_time))
  const [value, setValue] = useState(toHHMM(shift.start_time))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reminded, setReminded] = useState(false)
  const block = data.blocksById.get(shift.block_id)
  const line = shift.line_id ? data.lines.find(l => l.id === shift.line_id) : undefined
  const emp = data.employeesById.get(shift.employee_id!)
  const phone = data.contacts.find(c => c.employee_id === shift.employee_id)?.phone ?? ''
  const dirty = value !== toHHMM(shift.start_time) || pickup !== toHHMM(shift.first_pickup_time)

  useEffect(() => { setValue(toHHMM(shift.start_time)); setPickup(toHHMM(shift.first_pickup_time)) }, [shift.start_time, shift.first_pickup_time])

  function onPickup(v: string) {
    setPickup(v)
    if (/^\d{2}:\d{2}$/.test(v)) setValue(startFromPickup(v))
  }

  async function save() {
    if (!/^\d{2}:\d{2}$/.test(value)) { setError('Enter a start time (or the first pickup).'); return }
    setBusy(true)
    setError(null)
    try { await data.setShiftStart(shift, value, postedBy, pickup || null) }
    catch (err) { setError(err instanceof Error ? err.message : 'Save failed.') }
    finally { setBusy(false) }
  }

  const day = shift.date === addDays(todayISO(), 1) ? 'tomorrow' : formatDate(shift.date)
  const textBody = shift.start_time
    ? `Hi ${emp?.name.split(' ')[0] ?? ''}, your start time ${day} is ${formatTime(shift.start_time)}${shift.first_pickup_time ? ` for a ${formatTime(shift.first_pickup_time)} pickup` : ''}. Please tap Confirm in CAV Hub.`
    : ''
  const digits = phone.replace(/[^\d+]/g, '')

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[#0B1A5C]">{emp?.name ?? 'Unknown'}</p>
          <p className="text-xs text-[#6B7A99]">{block?.code} · {block?.name}{line ? ` · ${line.code}` : ''}</p>
        </div>
        {!shift.start_time || dirty
          ? <StatusPill tone="red">{shift.start_time ? 'Not saved' : 'Not posted'}</StatusPill>
          : shift.start_confirmed_at
            ? <StatusPill tone="green">Confirmed {new Date(shift.start_confirmed_at).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' })}</StatusPill>
            : <StatusPill tone="amber">Waiting for driver</StatusPill>}
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
        <Field label="First pickup">
          <TextInput type="time" aria-label={`First pickup for ${emp?.name ?? 'driver'}`} value={pickup} onChange={e => onPickup(e.target.value)} />
        </Field>
        <Field label="Start">
          <TextInput type="time" aria-label={`Start time for ${emp?.name ?? 'driver'}`} value={value} onChange={e => setValue(e.target.value)} />
        </Field>
        <Button onClick={save} disabled={busy || !value || !dirty}>{shift.start_time ? 'Update' : 'Post'}</Button>
      </div>
      {shift.start_time && !dirty && (
        <p className="text-xs text-[#6B7A99]">Sent: "{startMessage(shift.start_time, shift.first_pickup_time)}"</p>
      )}
      {shift.start_time && !dirty && !shift.start_confirmed_at && (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" disabled={reminded} onClick={async () => { await data.remindStart(shift); setReminded(true) }}>
            <BellRing size={14} /> {reminded ? 'Reminder sent' : 'Remind'}
          </Button>
          {digits && (
            <a href={`sms:${digits}?&body=${encodeURIComponent(textBody)}`}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg font-medium bg-white text-[#0B1A5C] border border-[#D8DFEF]">
              <MessageSquareText size={14} /> Text {phone}
            </a>
          )}
        </div>
      )}
      {error && <Warning>{error}</Warning>}
    </Card>
  )
}
