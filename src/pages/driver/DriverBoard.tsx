import { useState } from 'react'
import { useData } from '../../lib/data-context'
import { insideCutoff, isActive, REQUEST_STATUS_LABEL, REQUEST_TYPE_LABEL, todayISO, workProblem } from '../../lib/scheduling'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { ScrollBody, SectionLabel, TextArea, Warning } from '../../components/ui/Form'
import { ShiftLine, StatusPill } from '../../components/schedule/ShiftBits'
import type { Employee, Shift, ShiftRequest } from '../../types'
import { Repeat } from 'lucide-react'

function num(v: unknown, d: number) { return typeof v === 'number' ? v : d }

/** Trade offers waiting on this person (used for the tab badge). */
export function useTradeOffers(meId: string) {
  const data = useData()
  return data.requests.filter(r => r.type === 'swap' && r.status === 'pending_partner' && r.target_id === meId)
}

export function DriverBoard({ driver }: { driver: Employee }) {
  const data = useData()
  const today = todayISO()
  const cutoff = num(data.settings.request_cutoff_hours, 48)
  const shiftById = new Map(data.shifts.map(s => [s.id, s]))

  const offers = useTradeOffers(driver.id)
  const open = data.shifts
    .filter(s => s.status === 'open' && !s.employee_id && s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
  const posted = data.requests
    .filter(r => r.type === 'giveup' && (r.status === 'posted' || (r.status === 'pending' && r.claimant_id === driver.id)) && r.requester_id !== driver.id)
    .filter(r => shiftById.has(r.shift_id))
  const mine = data.requests
    .filter(r => r.requester_id === driver.id || r.claimant_id === driver.id || (r.target_id === driver.id && r.status !== 'pending_partner'))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 20)

  return (
    <ScrollBody>
      {offers.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>Trade offers for you</SectionLabel>
          {offers.map(r => <TradeOffer key={r.id} request={r} />)}
        </div>
      )}

      <SectionLabel>Open shifts</SectionLabel>
      {open.length === 0
        ? <p className="text-sm text-[#6B7A99] px-1">No open shifts right now. You'll get a notification when one opens up that you can work.</p>
        : open.map(s => <OpenShiftCard key={s.id} shift={s} driver={driver} />)}

      <SectionLabel>Given up by coworkers</SectionLabel>
      {posted.length === 0
        ? <p className="text-sm text-[#6B7A99] px-1">Nothing posted right now.</p>
        : posted.map(r => <PostedCard key={r.id} request={r} shift={shiftById.get(r.shift_id)!} driver={driver} cutoff={cutoff} />)}

      <SectionLabel>Your requests</SectionLabel>
      {mine.length === 0
        ? <EmptyState icon={<Repeat />} title="No requests yet" body="To give up or trade a shift, open it from your Schedule." />
        : mine.map(r => <MyRequest key={r.id} request={r} meId={driver.id} />)}
    </ScrollBody>
  )
}

function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try { await fn() } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.') } finally { setBusy(false) }
  }
  return { busy, error, run }
}

function TradeOffer({ request }: { request: ShiftRequest }) {
  const data = useData()
  const { busy, error, run } = useAction()
  const theirs = data.shifts.find(s => s.id === request.shift_id)
  const yours = data.shifts.find(s => s.id === request.swap_shift_id)
  const who = data.employeesById.get(request.requester_id)?.name ?? 'A coworker'
  return (
    <Card className="space-y-3 border-2 border-[#0B1A5C]/20">
      <p className="font-semibold text-[#0B1A5C]">{who} wants to trade</p>
      {theirs && <div><p className="text-xs font-semibold text-[#6B7A99] uppercase mb-1">You'd work</p><ShiftLine shift={theirs} /></div>}
      {yours && <div><p className="text-xs font-semibold text-[#6B7A99] uppercase mb-1">Instead of your</p><ShiftLine shift={yours} /></div>}
      {request.note && <p className="text-sm text-[#1B2E6B] italic">"{request.note}"</p>}
      <p className="text-xs text-[#6B7A99]">If you accept, dispatch still has to approve it.</p>
      {error && <Warning>{error}</Warning>}
      <div className="flex gap-2">
        <Button className="flex-1" disabled={busy} onClick={() => run(() => data.respondSwap(request.id, true))}>Accept</Button>
        <Button className="flex-1" variant="secondary" disabled={busy} onClick={() => run(() => data.respondSwap(request.id, false))}>Decline</Button>
      </div>
    </Card>
  )
}

function OpenShiftCard({ shift, driver }: { shift: Shift; driver: Employee }) {
  const data = useData()
  const { busy, error, run } = useAction()
  const [note, setNote] = useState('')
  const [asking, setAsking] = useState(false)
  const block = data.blocksById.get(shift.block_id)
  const problem = workProblem(driver, shift, block, data.shifts)
  const myReq = data.requests.find(r => r.type === 'pickup' && r.shift_id === shift.id && r.requester_id === driver.id && r.status === 'pending')
  const ptFirst = data.settings.pt_first_open_shifts === true && driver.employment_type === 'FT'
  const opensAt = new Date(new Date(shift.opened_at ?? shift.created_at ?? 0).getTime() + num(data.settings.pt_first_hours, 24) * 3_600_000)
  const waitingForPt = ptFirst && opensAt > new Date()

  return (
    <Card className="space-y-2">
      <ShiftLine shift={shift} right={myReq ? <StatusPill tone="amber">Requested</StatusPill> : undefined} />
      {myReq ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-[#6B7A99]">Waiting for dispatch to approve.</p>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => data.cancelRequest(myReq.id))}>Withdraw</Button>
        </div>
      ) : problem ? (
        <p className="text-xs text-[#6B7A99]">You can't take this one: {problem.replace(/\.$/, '').toLowerCase()}.</p>
      ) : waitingForPt ? (
        <p className="text-xs text-[#6B7A99]">Part-time employees get first pick until {opensAt.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', hour: 'numeric', minute: '2-digit' })}.</p>
      ) : asking ? (
        <div className="space-y-2">
          <TextArea value={note} onChange={e => setNote(e.target.value)} placeholder="Note to dispatch (optional)" />
          <div className="flex gap-2">
            <Button className="flex-1" size="sm" disabled={busy} onClick={() => run(() => data.requestOpenShift(shift.id, note.trim() || null))}>Send request</Button>
            <Button size="sm" variant="secondary" onClick={() => setAsking(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" fullWidth variant="secondary" onClick={() => setAsking(true)}>Request this shift</Button>
      )}
      {error && <Warning>{error}</Warning>}
    </Card>
  )
}

function PostedCard({ request, shift, driver, cutoff }: { request: ShiftRequest; shift: Shift; driver: Employee; cutoff: number }) {
  const data = useData()
  const { busy, error, run } = useAction()
  const block = data.blocksById.get(shift.block_id)
  const who = data.employeesById.get(request.requester_id)?.name ?? 'A coworker'
  const mineClaim = request.claimant_id === driver.id
  const problem = workProblem(driver, shift, block, data.shifts)
  const late = block ? insideCutoff(shift, block, cutoff) : false
  return (
    <Card className="space-y-2">
      <ShiftLine shift={shift} sub={<p className="text-xs text-[#1B2E6B] mt-1">Posted by {who}{request.note ? ` — "${request.note}"` : ''}</p>}
        right={mineClaim ? <StatusPill tone="amber">You asked</StatusPill> : undefined} />
      {mineClaim ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-[#6B7A99]">Waiting for dispatch to approve.</p>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => data.cancelRequest(request.id))}>Withdraw</Button>
        </div>
      ) : late ? (
        <p className="text-xs text-[#6B7A99]">Starts within {cutoff} hours — contact dispatch to pick it up.</p>
      ) : problem ? (
        <p className="text-xs text-[#6B7A99]">You can't take this one: {problem.replace(/\.$/, '').toLowerCase()}.</p>
      ) : (
        <Button size="sm" fullWidth variant="secondary" disabled={busy} onClick={() => run(() => data.claimGiveup(request.id))}>Take this shift</Button>
      )}
      {error && <Warning>{error}</Warning>}
    </Card>
  )
}

function MyRequest({ request, meId }: { request: ShiftRequest; meId: string }) {
  const data = useData()
  const { busy, error, run } = useAction()
  const shift = data.shifts.find(s => s.id === request.shift_id)
  const tone = request.status === 'approved' ? 'green' : request.status === 'denied' || request.status === 'declined' ? 'red' : isActive(request) ? 'amber' : 'muted'
  const role = request.claimant_id === meId && request.requester_id !== meId ? 'Taking' : request.target_id === meId ? 'Trade with ' + (data.employeesById.get(request.requester_id)?.name ?? 'coworker') : REQUEST_TYPE_LABEL[request.type]
  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[#0B1A5C]">{role}</p>
        <StatusPill tone={tone}>{REQUEST_STATUS_LABEL[request.status]}</StatusPill>
      </div>
      {shift ? <ShiftLine shift={shift} /> : <p className="text-xs text-[#6B7A99]">Shift no longer on your schedule.</p>}
      {request.decision_note && <p className="text-xs text-[#6B7A99]">Dispatch: {request.decision_note}</p>}
      {isActive(request) && request.requester_id === meId && request.type !== 'callout' && (
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => data.cancelRequest(request.id))}>Cancel request</Button>
      )}
      {error && <Warning>{error}</Warning>}
    </Card>
  )
}
