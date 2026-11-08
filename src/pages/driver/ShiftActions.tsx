import { useState } from 'react'
import { useData } from '../../lib/data-context'
import { formatDate, insideCutoff, isActive, REQUEST_STATUS_LABEL, REQUEST_TYPE_LABEL, todayISO } from '../../lib/scheduling'
import type { SwapCandidate } from '../../lib/board-actions'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Field, Select, TextArea, Warning } from '../../components/ui/Form'
import { StatusPill } from '../../components/schedule/ShiftBits'
import type { Shift } from '../../types'
import { Repeat, HandHelping, Phone, MessageSquare } from 'lucide-react'
import { dispatchPhone } from '../../lib/dispatch-phone'

type Mode = 'menu' | 'giveup' | 'swap'

export function ShiftActions({ shift, onMessageDispatch }: { shift: Shift; onMessageDispatch?: () => void }) {
  const data = useData()
  const [mode, setMode] = useState<Mode>('menu')
  const [note, setNote] = useState('')
  const [candidates, setCandidates] = useState<SwapCandidate[] | null>(null)
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const block = data.blocksById.get(shift.block_id)
  const cutoff = typeof data.settings.request_cutoff_hours === 'number' ? data.settings.request_cutoff_hours : 48
  const active = data.requests.find(r => isActive(r) && (r.shift_id === shift.id || r.swap_shift_id === shift.id))
  if (!block) return null
  if (shift.status !== 'scheduled' || shift.date < todayISO()) {
    // e.g. right after a sick call: keep the confirmation on screen.
    return done ? <Card><div className="rounded-xl bg-[#E8F5EE] text-[#2E7D52] px-3 py-2 text-sm font-medium">{done}</div></Card> : null
  }
  const late = insideCutoff(shift, block, cutoff)
  const phone = dispatchPhone(data.settings)

  async function run(fn: () => Promise<void>, message: string) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      setDone(message)
      setMode('menu')
      setNote('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  async function openSwap() {
    setMode('swap')
    setCandidates(null)
    setError(null)
    try { setCandidates(await data.swapCandidates(shift.id)) }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load shifts to trade for.') }
  }

  return (
    <Card className="space-y-3">
      <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide">Can't work it?</p>
      {done && <div className="rounded-xl bg-[#E8F5EE] text-[#2E7D52] px-3 py-2 text-sm font-medium">{done}</div>}

      {active ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-[#1B2E6B]">{REQUEST_TYPE_LABEL[active.type]}</p>
          <StatusPill tone="amber">{REQUEST_STATUS_LABEL[active.status]}</StatusPill>
        </div>
      ) : late ? (
        <div className="rounded-xl bg-[#EEF1F8] px-3 py-2 text-sm text-[#1B2E6B] space-y-2">
          <p>This shift starts within {cutoff} hours, so it can't go on the shift board. Call or text dispatch to change it.</p>
          {onMessageDispatch && <Button size="sm" variant="ghost" className="-ml-2" onClick={onMessageDispatch}><MessageSquare size={14} /> Message dispatch in the app</Button>}
        </div>
      ) : mode === 'giveup' ? (
        <div className="space-y-2">
          <p className="text-sm text-[#1B2E6B]">Your shift goes on the board. A coworker can take it, and dispatch approves the change. You keep it until then.</p>
          <TextArea value={note} onChange={e => setNote(e.target.value)} placeholder="Reason or note (optional)" />
          <div className="flex gap-2">
            <Button className="flex-1" disabled={busy} onClick={() => run(() => data.postGiveup(shift.id, note.trim() || null), 'Posted on the board. You still work it until dispatch approves a change.')}>Post on the board</Button>
            <Button variant="secondary" onClick={() => setMode('menu')}>Cancel</Button>
          </div>
        </div>
      ) : mode === 'swap' ? (
        <div className="space-y-2">
          {candidates === null && !error && <p className="text-sm text-[#6B7A99]">Finding shifts you could trade for…</p>}
          {candidates?.length === 0 && <p className="text-sm text-[#6B7A99]">No coworker shifts in the next five weeks work for a trade (both of you have to be able to work the other's shift).</p>}
          {candidates && candidates.length > 0 && (
            <Field label="Trade for">
              <Select value={pick} onChange={e => setPick(e.target.value)}>
                <option value="">Choose a coworker's shift…</option>
                {candidates.map(c => (
                  <option key={c.shift_id} value={c.shift_id}>
                    {formatDate(c.date)} · {data.blocksById.get(c.block_id)?.code} · {c.employee_name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <TextArea value={note} onChange={e => setNote(e.target.value)} placeholder="Note to your coworker (optional)" />
          <p className="text-xs text-[#6B7A99]">They have to accept, then dispatch approves.</p>
          <div className="flex gap-2">
            <Button className="flex-1" disabled={busy || !pick} onClick={() => run(() => data.proposeSwap(shift.id, pick, note.trim() || null), 'Trade offer sent.')}>Send trade offer</Button>
            <Button variant="secondary" onClick={() => setMode('menu')}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => { setMode('giveup'); setDone(null) }}><HandHelping size={16} /> Give up</Button>
          <Button variant="secondary" onClick={() => { openSwap(); setDone(null) }}><Repeat size={16} /> Trade</Button>
        </div>
      )}

      {mode === 'menu' && (
        <div className="rounded-xl bg-[#EEF1F8] px-3 py-2.5 space-y-2">
          <p className="text-sm text-[#1B2E6B]"><b>Sick or can't make it?</b> Call or text dispatch at {phone.display}. They'll take care of the shift.</p>
          <div className="grid grid-cols-2 gap-2">
            <a href={phone.tel} className="flex items-center justify-center gap-1.5 rounded-xl bg-white border border-[#D8DFEF] py-2 text-sm font-semibold text-[#0B1A5C]"><Phone size={15} /> Call</a>
            <a href={phone.sms} className="flex items-center justify-center gap-1.5 rounded-xl bg-white border border-[#D8DFEF] py-2 text-sm font-semibold text-[#0B1A5C]"><MessageSquare size={15} /> Text</a>
          </div>
        </div>
      )}
      {error && <Warning>{error}</Warning>}
    </Card>
  )
}
