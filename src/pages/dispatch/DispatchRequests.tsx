import { useMemo, useState } from 'react'
import { useData } from '../../lib/data-context'
import { useAuth } from '../../lib/auth'
import { addDays, formatDate, hoursUntilStart, overtimeLimits, overtimeWarnings, todayISO, workProblem } from '../../lib/scheduling'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { ScrollBody, SectionLabel, TextArea, Field, Warning } from '../../components/ui/Form'
import { ShiftLine, StatusPill } from '../../components/schedule/ShiftBits'
import { AssignPicker } from '../../components/schedule/AssignPicker'
import type { Shift, ShiftRequest } from '../../types'
import { Inbox, Thermometer, ArrowRight } from 'lucide-react'

/** Requests waiting on dispatch (for the tab badge). */
export function usePendingCount() {
  const data = useData()
  return data.requests.filter(r => r.status === 'pending' || (r.type === 'giveup' && r.status === 'posted')).length
}

function cutoffHours(settings: Record<string, unknown>) {
  return typeof settings.request_cutoff_hours === 'number' ? settings.request_cutoff_hours : 48
}

export function DispatchRequests() {
  const data = useData()
  const today = todayISO()
  const shiftById = useMemo(() => new Map(data.shifts.map(s => [s.id, s])), [data.shifts])
  const byShiftDate = (a: ShiftRequest, b: ShiftRequest) =>
    (shiftById.get(a.shift_id)?.date ?? '').localeCompare(shiftById.get(b.shift_id)?.date ?? '')

  const ptFirst = data.settings.pt_first_open_shifts === true
  const pending = data.requests.filter(r => r.status === 'pending').sort((a, b) => {
    const d = byShiftDate(a, b)
    if (d || !ptFirst) return d
    // Part-time first on the same open shift, when that setting is on.
    const pa = data.employeesById.get(a.requester_id)?.employment_type === 'PT' ? 0 : 1
    const pb = data.employeesById.get(b.requester_id)?.employment_type === 'PT' ? 0 : 1
    return pa - pb
  })
  const posted = data.requests.filter(r => r.type === 'giveup' && r.status === 'posted').sort(byShiftDate)
  const waitingPartner = data.requests.filter(r => r.status === 'pending_partner').sort(byShiftDate)
  const open = data.shifts.filter(s => s.status === 'open' && !s.employee_id && s.date >= today).sort((a, b) => a.date.localeCompare(b.date))
  const sick = data.requests
    .filter(r => r.type === 'callout' && r.created_at >= `${addDays(today, -2)}`)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))

  const nothing = !pending.length && !posted.length && !waitingPartner.length && !open.length && !sick.length

  return (
    <ScrollBody>
      {nothing && <EmptyState icon={<Inbox />} title="All caught up" body="Give-ups, trades, open-shift requests and sick calls show up here." />}

      {sick.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>Sick calls (last 3 days)</SectionLabel>
          {sick.map(r => {
            const s = shiftById.get(r.shift_id)
            return (
              <Card key={r.id} className="space-y-1">
                <div className="flex items-center gap-2 text-[#CC2A2A]">
                  <Thermometer size={16} />
                  <p className="text-sm font-semibold">{data.employeesById.get(r.requester_id)?.name} called out sick</p>
                </div>
                {s && <ShiftLine shift={s} right={s.employee_id
                  ? <StatusPill tone="green">Covered by {data.employeesById.get(s.employee_id)?.name.split(' ')[0]}</StatusPill>
                  : <StatusPill tone="red">Open</StatusPill>} />}
                {r.note && <p className="text-xs text-[#6B7A99]">"{r.note}"</p>}
              </Card>
            )
          })}
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>Needs your decision</SectionLabel>
          {pending.map(r => <DecisionCard key={r.id} request={r} />)}
        </div>
      )}

      {open.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>Open shifts</SectionLabel>
          {open.map(s => <OpenShift key={s.id} shift={s} requests={data.requests.filter(r => r.shift_id === s.id && r.type === 'pickup' && r.status === 'pending').length} />)}
        </div>
      )}

      {posted.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>On the board, no taker yet</SectionLabel>
          {posted.map(r => <DecisionCard key={r.id} request={r} />)}
        </div>
      )}

      {waitingPartner.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>Trades waiting on the coworker</SectionLabel>
          {waitingPartner.map(r => <DecisionCard key={r.id} request={r} />)}
        </div>
      )}
    </ScrollBody>
  )
}

interface Change { employeeId: string; add: Shift; remove?: Shift }

function DecisionCard({ request: r }: { request: ShiftRequest }) {
  const data = useData()
  const { me } = useAuth()
  const [mode, setMode] = useState<'idle' | 'approve' | 'deny'>('idle')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = (id: string | null | undefined) => (id ? data.employeesById.get(id)?.name : null) ?? 'Unknown'
  const s = data.shifts.find(x => x.id === r.shift_id)
  const o = r.swap_shift_id ? data.shifts.find(x => x.id === r.swap_shift_id) : undefined
  const limits = overtimeLimits(data.settings)
  const cutoff = cutoffHours(data.settings)

  // Who gains which shift if this is approved.
  const changes: Change[] = []
  if (s && r.type === 'giveup' && r.claimant_id) changes.push({ employeeId: r.claimant_id, add: s })
  if (s && r.type === 'pickup') changes.push({ employeeId: r.requester_id, add: s })
  if (s && o && r.type === 'swap') {
    changes.push({ employeeId: r.requester_id, add: o, remove: s })
    if (r.target_id) changes.push({ employeeId: r.target_id, add: s, remove: o })
  }
  const warnings = changes.flatMap(c =>
    overtimeWarnings({ employeeId: c.employeeId, add: [c.add], remove: c.remove ? [c.remove] : [], shifts: data.shifts, blocksById: data.blocksById, limits })
      .map(w => `${name(c.employeeId)}: ${w}`))
  const problems = changes.flatMap(c => {
    const p = workProblem(data.employeesById.get(c.employeeId), c.add, data.blocksById.get(c.add.block_id), data.shifts, c.remove?.id)
    return p ? [`${name(c.employeeId)}: ${p}`] : []
  })
  const soonest = [s, o].filter(Boolean).map(x => hoursUntilStart(x!, data.blocksById.get(x!.block_id)!))
  // The cutoff applies to give-ups and trades; open-shift pickups are fill-ins and exempt.
  const late = r.type !== 'pickup' && soonest.some(h => h < cutoff)
  const release = r.type === 'giveup' && r.status === 'posted'
  const canApprove = r.status === 'pending' || release

  const title = {
    giveup: release ? `${name(r.requester_id)} is giving up a shift` : `${name(r.requester_id)} → ${name(r.claimant_id)}`,
    swap: `Trade: ${name(r.requester_id)} ↔ ${name(r.target_id)}`,
    pickup: `${name(r.requester_id)} wants an open shift`,
    callout: 'Sick call', assign: 'Dispatch change',
  }[r.type]

  async function decide(approve: boolean) {
    if (approve && warnings.length && !reason.trim()) { setError('Enter a reason to approve despite the overtime warnings.'); return }
    setBusy(true)
    setError(null)
    try {
      await data.decideRequest(r.id, approve, { by: me?.id ?? null, note: note.trim() || null, overrideReason: reason.trim() || null, warnings: approve ? warnings : [] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-[#0B1A5C]">{title}</p>
        <div className="flex flex-wrap gap-1 justify-end">
          {r.type === 'pickup' && <StatusPill>{data.employeesById.get(r.requester_id)?.employment_type}</StatusPill>}
          {late && <StatusPill tone="red">Inside {cutoff} hrs</StatusPill>}
        </div>
      </div>
      {s && <ShiftLine shift={s} />}
      {o && (
        <>
          <div className="flex items-center gap-2 text-xs text-[#6B7A99]"><ArrowRight size={14} /> for</div>
          <ShiftLine shift={o} />
        </>
      )}
      {r.note && <p className="text-sm text-[#1B2E6B] italic">"{r.note}"</p>}
      {release && <p className="text-xs text-[#6B7A99]">Nobody has claimed it. Releasing takes {name(r.requester_id).split(' ')[0]} off and posts it as an open shift.</p>}
      {r.status === 'pending_partner' && <p className="text-xs text-[#6B7A99]">Waiting for {name(r.target_id)} to accept.</p>}
      {late && canApprove && <p className="text-xs text-[#A82020]">Requests should be approved at least {cutoff} hours before the shift. Approve only if you've confirmed it directly.</p>}
      {problems.length > 0 && <Warning>{problems.map(p => <p key={p}>{p}</p>)}</Warning>}
      {warnings.length > 0 && <Warning tone="amber">{warnings.map(w => <p key={w}>{w}</p>)}</Warning>}

      {mode === 'approve' && warnings.length > 0 && (
        <Field label="Reason to approve anyway (saved)">
          <TextArea value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. No one else available" />
        </Field>
      )}
      {mode !== 'idle' && (
        <Field label={mode === 'deny' ? 'Reason (sent to the driver)' : 'Note to the driver (optional)'}>
          <TextArea value={note} onChange={e => setNote(e.target.value)} />
        </Field>
      )}
      {error && <Warning>{error}</Warning>}

      {mode === 'idle' ? (
        <div className="flex gap-2">
          {canApprove && <Button className="flex-1" disabled={problems.length > 0} onClick={() => setMode('approve')}>{release ? 'Release as open shift' : 'Approve'}</Button>}
          <Button className={canApprove ? '' : 'flex-1'} variant="secondary" onClick={() => setMode('deny')}>Deny</Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button className="flex-1" variant={mode === 'deny' ? 'danger' : 'primary'} disabled={busy} onClick={() => decide(mode === 'approve')}>
            {busy ? 'Saving…' : mode === 'deny' ? 'Deny request' : release ? 'Release it' : 'Approve'}
          </Button>
          <Button variant="secondary" onClick={() => { setMode('idle'); setError(null) }}>Back</Button>
        </div>
      )}
    </Card>
  )
}

function OpenShift({ shift, requests }: { shift: Shift; requests: number }) {
  const data = useData()
  const [assigning, setAssigning] = useState(false)
  return (
    <Card className="space-y-2">
      <ShiftLine shift={shift} right={requests ? <StatusPill tone="amber">{requests} asked</StatusPill> : <StatusPill tone="red">Open</StatusPill>} />
      {shift.opened_at && <p className="text-xs text-[#6B7A99]">Open since {formatDate(shift.opened_at.slice(0, 10))}</p>}
      {assigning
        ? <AssignPicker shift={shift} onSave={async (emp, opts) => { await data.assignShift(shift.id, emp, opts); setAssigning(false) }} />
        : <Button size="sm" fullWidth variant="secondary" onClick={() => setAssigning(true)}>Assign someone directly</Button>}
    </Card>
  )
}

