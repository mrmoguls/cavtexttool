import { useState } from 'react'
import { useData } from '../../lib/data-context'
import { addDays, formatDate, todayISO } from '../../lib/scheduling'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Field, ScrollBody, SectionLabel, Segmented, SubHeader, TextArea, TextInput, Warning } from '../../components/ui/Form'
import { StatusPill } from '../../components/schedule/ShiftBits'
import type { Employee, TimeOffKind, TimeOffRequest } from '../../types'

export const KIND_LABEL: Record<TimeOffKind, string> = { vacation: 'Vacation', personal: 'Personal', medical: 'Medical', other: 'Other' }
const STATUS_TONE: Record<TimeOffRequest['status'], 'amber' | 'green' | 'red' | 'muted'> = { pending: 'amber', approved: 'green', denied: 'red', cancelled: 'muted' }
const STATUS_LABEL: Record<TimeOffRequest['status'], string> = { pending: 'Waiting for dispatch', approved: 'Approved', denied: 'Not approved', cancelled: 'Cancelled' }

export const rangeText = (r: Pick<TimeOffRequest, 'start_date' | 'end_date'>) =>
  r.start_date === r.end_date ? formatDate(r.start_date) : `${formatDate(r.start_date)} – ${formatDate(r.end_date)}`

export function TimeOff({ driver, onBack }: { driver: Employee; onBack: () => void }) {
  const data = useData()
  const today = todayISO()
  const notice = typeof data.settings.time_off_notice_days === 'number' ? data.settings.time_off_notice_days : 14
  const [start, setStart] = useState(addDays(today, notice))
  const [end, setEnd] = useState(addDays(today, notice))
  const [kind, setKind] = useState<TimeOffKind>('personal')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const shiftsInRange = data.shifts.filter(s => s.employee_id === driver.id && s.status === 'scheduled' && s.date >= start && s.date <= end)
  const lead = Math.round((new Date(`${start}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86_400_000)
  const short = lead < notice
  const mine = data.timeOff.filter(r => r.employee_id === driver.id).sort((a, b) => b.start_date.localeCompare(a.start_date))

  async function submit() {
    setBusy(true); setError(null); setSent(false)
    try { await data.requestTimeOff(start, end, kind, note.trim() || null); setSent(true); setNote('') }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not send the request.') }
    finally { setBusy(false) }
  }

  return (
    <>
      <SubHeader title="Time off" onBack={onBack} />
      <ScrollBody>
        <Card className="space-y-4">
          <p className="font-semibold text-[#0B1A5C]">Request time off</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First day off"><TextInput type="date" min={today} value={start} onChange={e => { setStart(e.target.value); if (e.target.value > end) setEnd(e.target.value) }} /></Field>
            <Field label="Last day off"><TextInput type="date" min={start} value={end} onChange={e => setEnd(e.target.value)} /></Field>
          </div>
          <Field label="Type" group>
            <Segmented value={kind} options={(Object.keys(KIND_LABEL) as TimeOffKind[]).map(k => ({ value: k, label: KIND_LABEL[k] }))} onChange={setKind} />
          </Field>
          <Field label="Note to dispatch (optional)">
            <TextArea value={note} onChange={e => setNote(e.target.value)} placeholder="No patient names or details, please." />
          </Field>
          <p className="text-sm text-[#1B2E6B]">
            {shiftsInRange.length === 0 ? "You're not scheduled on those days." : `You're scheduled for ${shiftsInRange.length} shift${shiftsInRange.length === 1 ? '' : 's'} on those days. If approved, ${shiftsInRange.length === 1 ? 'it becomes an open shift' : 'they become open shifts'} for coworkers to pick up.`}
          </p>
          {short && <Warning tone="amber">That's less than {notice} days away, so it will be marked short notice. Dispatch can still approve it.</Warning>}
          {error && <Warning>{error}</Warning>}
          {sent && <div className="rounded-xl bg-[#E8F5EE] text-[#2E7D52] px-3 py-2 text-sm font-medium">Request sent. You'll get a notification when dispatch decides.</div>}
          <Button fullWidth onClick={submit} disabled={busy || !start || !end}>{busy ? 'Sending…' : 'Send request'}</Button>
        </Card>

        {mine.length > 0 && (
          <>
            <SectionLabel>Your requests</SectionLabel>
            {mine.map(r => <MyRequest key={r.id} r={r} />)}
          </>
        )}
      </ScrollBody>
    </>
  )
}

function MyRequest({ r }: { r: TimeOffRequest }) {
  const data = useData()
  const [error, setError] = useState<string | null>(null)
  return (
    <Card className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-[#0B1A5C]">{rangeText(r)}</p>
        <StatusPill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusPill>
      </div>
      <p className="text-xs text-[#6B7A99]">{KIND_LABEL[r.kind]}{r.short_notice ? ' · short notice' : ''}{r.note ? ` · "${r.note}"` : ''}</p>
      {r.status === 'approved' && r.shifts_released ? <p className="text-xs text-[#6B7A99]">{r.shifts_released} shift{r.shifts_released === 1 ? ' was' : 's were'} released as open shifts.</p> : null}
      {r.decision_note && <p className="text-xs text-[#6B7A99]">Dispatch: {r.decision_note}</p>}
      {r.status === 'pending' && (
        <Button size="sm" variant="secondary" onClick={async () => { try { await data.cancelTimeOff(r.id) } catch (err) { setError(err instanceof Error ? err.message : 'Could not cancel.') } }}>Cancel request</Button>
      )}
      {r.status === 'approved' && <p className="text-xs text-[#6B7A99]">To change approved time off, message dispatch.</p>}
      {error && <Warning>{error}</Warning>}
    </Card>
  )
}
