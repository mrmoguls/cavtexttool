import { useEffect, useState } from 'react'
import { useData } from '../../lib/data-context'
import { useAuth } from '../../lib/auth'
import { blockInstructions, formatDate, REQUEST_STATUS_LABEL, REQUEST_TYPE_LABEL } from '../../lib/scheduling'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { ScrollBody, SubHeader, Warning } from '../../components/ui/Form'
import { ShiftLine, StatusPill } from '../../components/schedule/ShiftBits'
import { AssignPicker } from '../../components/schedule/AssignPicker'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import type { Block, CrewRole, Shift, ShiftRequest } from '../../types'

type History = Awaited<ReturnType<ReturnType<typeof useData>['loadShiftHistory']>>

/** Dispatch view of one shift: who's on it, reassign / open it up, and its full history. */
export function ShiftSheet({ shiftId, onBack }: { shiftId: string; onBack: () => void }) {
  const data = useData()
  const { me } = useAuth()
  const confirm = useConfirm()
  const shift = data.shifts.find(s => s.id === shiftId)
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<History | null>(null)
  const { loadShiftHistory } = data
  const version = `${shift?.employee_id}|${shift?.status}|${data.requests.length}`

  useEffect(() => {
    let live = true
    loadShiftHistory(shiftId).then(h => { if (live) setHistory(h) }).catch(() => {})
    return () => { live = false }
  }, [shiftId, version, loadShiftHistory])

  if (!shift) {
    return (<><SubHeader title="Shift" onBack={onBack} /><ScrollBody><p className="text-sm text-[#6B7A99]">This shift is no longer in the schedule.</p></ScrollBody></>)
  }
  const block = data.blocksById.get(shift.block_id)!
  const name = (id: string | null | undefined) => (id ? data.employeesById.get(id)?.name : null) ?? '—'

  async function makeOpen() {
    const ok = await confirm({ title: 'Make this an open shift?', body: `${name(shift!.employee_id)} comes off it and eligible people are notified.`, confirmLabel: 'Make open', danger: true })
    if (!ok) return
    try { await data.assignShift(shift!.id, null, { by: me?.id ?? null }) } catch (err) { setError(err instanceof Error ? err.message : 'Could not update.') }
  }

  async function sickCall() {
    const ok = await confirm({
      title: `Record a sick call for ${name(shift!.employee_id)}?`,
      body: 'They come off this shift, it becomes an open shift, and eligible people are notified. The sick call is kept in the shift history.',
      confirmLabel: 'Record sick call', danger: true,
    })
    if (!ok) return
    try { await data.recordSickCall(shift!.id, { by: me?.id ?? null }) } catch (err) { setError(err instanceof Error ? err.message : 'Could not update.') }
  }

  return (
    <>
      <SubHeader title={`${formatDate(shift.date)} · ${block.code}`} onBack={onBack} />
      <ScrollBody>
        <Card className="space-y-3">
          <ShiftLine shift={shift} />
          <div className="flex items-center justify-between">
            <p className="text-sm text-[#1B2E6B]">{shift.role === 'attendant' ? 'Attendant' : 'Driver'}: <b>{shift.employee_id ? name(shift.employee_id) : 'Open'}</b></p>
            {shift.status === 'open' && <StatusPill tone="red">Open shift</StatusPill>}
          </div>
          {blockInstructions(block, { startTime: shift.start_time }).slice(0, 1).map(t => <p key={t} className="text-xs text-[#6B7A99]">{t}</p>)}
        </Card>

        <Card className="space-y-3">
          <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide">Change who works it</p>
          {assigning
            ? <AssignPicker shift={shift} saveLabel={shift.employee_id ? 'Reassign' : 'Assign'} onSave={async (emp, opts) => { await data.assignShift(shift.id, emp, opts); setAssigning(false) }} />
            : (
              <div className="flex gap-2">
                <Button className="flex-1" variant="secondary" onClick={() => setAssigning(true)}>{shift.employee_id ? 'Reassign' : 'Assign someone'}</Button>
                {shift.employee_id && <Button variant="secondary" onClick={makeOpen}>Make open</Button>}
              </div>
            )}
          {!assigning && shift.employee_id && shift.status === 'scheduled' && (
            <Button fullWidth variant="ghost" onClick={sickCall}>Record a sick call</Button>
            )}
          {error && <Warning>{error}</Warning>}
        </Card>

        <Card className="space-y-2">
          <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide">History</p>
          {!history && <p className="text-sm text-[#6B7A99]">Loading…</p>}
          {history && history.requests.length === 0 && history.audit.length <= 1 && <p className="text-sm text-[#6B7A99]">No changes since it was scheduled.</p>}
          {history && <HistoryList requests={history.requests} audit={history.audit} name={name} />}
        </Card>
      </ScrollBody>
    </>
  )
}

function HistoryList({ requests, audit, name }: { requests: ShiftRequest[]; audit: History['audit']; name: (id: string | null | undefined) => string }) {
  const fmt = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const items = [
    ...requests.map(r => ({
      at: r.created_at,
      text: (() => {
        switch (r.type) {
          case 'callout': return `${name(r.requester_id)} called out sick`
          case 'giveup': return `${name(r.requester_id)} posted it on the board${r.claimant_id ? ` · ${name(r.claimant_id)} asked to take it` : ''}`
          case 'swap': return `${name(r.requester_id)} offered a trade with ${name(r.target_id)}`
          case 'pickup': return `${name(r.requester_id)} asked for the open shift`
          case 'assign': return `${name(r.decided_by)} changed it: ${name(r.previous_employee_id)} → ${r.claimant_id ? name(r.claimant_id) : 'open'}`
        }
      })(),
      status: r.type === 'callout' || r.type === 'assign' ? null : `${REQUEST_TYPE_LABEL[r.type]} · ${REQUEST_STATUS_LABEL[r.status]}${r.decided_by ? ` by ${name(r.decided_by)}` : ''}`,
      extra: [r.note && `Note: "${r.note}"`, r.decision_note && `Decision: ${r.decision_note}`, r.override_reason && `Overtime override: ${r.override_reason}`].filter(Boolean) as string[],
    })),
    // Raw edits not already explained by a request (e.g. made outside the app).
    ...audit.filter(a => a.action === 'update' && a.before?.employee_id !== a.after?.employee_id)
      .filter(a => !requests.some(r => Math.abs(new Date(r.decided_at ?? r.updated_at).getTime() - new Date(a.at).getTime()) < 15_000))
      .map(a => ({
      at: a.at,
      text: `Changed from ${name(a.before?.employee_id as string | null)} to ${a.after?.employee_id ? name(a.after.employee_id as string) : 'open'}`,
      status: a.actor_employee_id ? `by ${name(a.actor_employee_id)}` : null,
      extra: [] as string[],
    })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  return (
    <div className="space-y-2">
      {items.map((i, k) => (
        <div key={k} className="border-l-2 border-[#D8DFEF] pl-3">
          <p className="text-sm text-[#0B1A5C]">{i.text}</p>
          <p className="text-xs text-[#6B7A99]">{fmt(i.at)}{i.status ? ` · ${i.status}` : ''}</p>
          {i.extra.map(e => <p key={e} className="text-xs text-[#6B7A99]">{e}</p>)}
        </div>
      ))}
    </div>
  )
}

/** Fill an uncovered slot on the roster: add a one-off shift for someone, or post it open. */
export function FillSlot({ date, block, role, onBack }: { date: string; block: Block; role: CrewRole; onBack: () => void }) {
  const data = useData()
  const draft: Shift = {
    id: 'new', date, block_id: block.id, role, employee_id: null, line_id: null, assignment_id: null, source: 'manual',
    status: 'open', start_time: block.start_type === 'fixed' ? block.default_start : null, end_time: block.end_type === 'fixed' ? block.default_end : null,
    start_posted_at: null, start_posted_by: null, target_hours: Number(block.target_paid_hours), notes: null,
  }
  return (
    <>
      <SubHeader title={`Fill ${block.code} · ${formatDate(date)}`} onBack={onBack} />
      <ScrollBody>
        <Card className="space-y-3">
          <ShiftLine shift={draft} />
          <p className="text-sm text-[#6B7A99]">Nobody is scheduled for this {role}. Add a one-off shift for someone, or post it as an open shift.</p>
          <AssignPicker shift={draft} allowOpen saveLabel="Add shift" onSave={async (emp, opts) => {
            await data.createShift({ date, block_id: block.id, role, employee_id: emp }, opts)
            onBack()
          }} />
        </Card>
      </ScrollBody>
    </>
  )
}
