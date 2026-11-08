import { useMemo, useState } from 'react'
import { useData } from '../../lib/data-context'
import { useAuth } from '../../lib/auth'
import {
  addDays, biddingOrder, formatDate, lineBidProblems, lineSummary, lineTargetHours, openPositions, pacificToInstant, todayISO,
} from '../../lib/scheduling'
import type { PeriodDraft } from '../../lib/bidding-actions'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Field, ScrollBody, SectionLabel, Segmented, Select, SubHeader, TextArea, TextInput, Warning } from '../../components/ui/Form'
import { StatusPill } from '../../components/schedule/ShiftBits'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { deadlineText } from '../driver/DriverBid'
import type { BidPeriod, BidResult, Employee, Line } from '../../types'
import { Plus, ChevronRight, Gavel } from 'lucide-react'

const STATUS: Record<BidPeriod['status'], { label: string; tone: 'muted' | 'amber' | 'green' | 'red' }> = {
  draft: { label: 'Draft', tone: 'muted' }, open: { label: 'Bidding open', tone: 'amber' }, closed: { label: 'Reviewing results', tone: 'amber' },
  published: { label: 'Published', tone: 'green' }, cancelled: { label: 'Cancelled', tone: 'muted' },
}

/** ISO instant → 'YYYY-MM-DDTHH:MM' in Pacific for <input type="datetime-local">. */
function toPacificInput(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso))
  const g = (t: string) => parts.find(p => p.type === t)!.value
  return `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`
}
function fromPacificInput(v: string): string {
  const [d, t] = v.split('T')
  return pacificToInstant(d, t || '17:00').toISOString()
}

/** Next quarter starting on a Sunday, as a sensible default. */
function nextQuarter(): { start: string; end: string; name: string } {
  const t = todayISO()
  const [y, m] = t.split('-').map(Number)
  const qStartMonth = Math.floor((m - 1) / 3) * 3 + 3 // next quarter (0-based month index)
  const year = y + Math.floor(qStartMonth / 12)
  const month = qStartMonth % 12
  let start = `${year}-${String(month + 1).padStart(2, '0')}-01`
  while (new Date(`${start}T12:00:00Z`).getUTCDay() !== 0) start = addDays(start, 1)
  return { start, end: addDays(start, 90), name: `Q${month / 3 + 1} ${year} lines` }
}

export function AdminBidding({ onBack }: { onBack: () => void }) {
  const data = useData()
  const [selected, setSelected] = useState<string | 'new' | null>(null)

  if (selected === 'new') return <PeriodSetup period={null} onDone={id => setSelected(id)} onBack={() => setSelected(null)} />
  if (selected) {
    const p = data.bidPeriods.find(x => x.id === selected)
    if (p) return <PeriodDetail period={p} onBack={() => setSelected(null)} />
  }

  return (
    <>
      <SubHeader title="Line bidding" onBack={onBack} />
      <ScrollBody>
        <p className="text-sm text-[#6B7A99] px-1">
          Set up a bid, open it, and people rank the lines they want. When it closes, lines are given out by seniority
          (full-time first). You review, adjust, then publish to put everyone's new line and shifts on the schedule.
        </p>
        <Button fullWidth onClick={() => setSelected('new')}><Plus size={18} /> New bid</Button>
        {data.bidPeriods.map(p => (
          <Card key={p.id} onClick={() => setSelected(p.id)}>
            <div className="flex items-center gap-3">
              <div className="rounded-xl p-2 bg-[#EEF1F8] text-[#1B2E6B]"><Gavel size={18} /></div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[#0B1A5C]">{p.name}</p>
                <p className="text-xs text-[#6B7A99]">{formatDate(p.start_date)} – {formatDate(p.end_date)}{p.status === 'open' ? ` · closes ${deadlineText(p.closes_at)}` : ''}</p>
              </div>
              <StatusPill tone={STATUS[p.status].tone}>{STATUS[p.status].label}</StatusPill>
              <ChevronRight size={16} className="text-[#6B7A99]" />
            </div>
          </Card>
        ))}
      </ScrollBody>
    </>
  )
}

export function PeriodSetup({ period, onDone, onBack, presetLineIds, presetKind }: {
  period: BidPeriod | null
  onDone: (id: string) => void
  onBack: () => void
  presetLineIds?: string[]
  presetKind?: BidPeriod['kind']
}) {
  const data = useData()
  const { me } = useAuth()
  const q = nextQuarter()
  const existingLines = period ? data.bidPeriodLines.filter(l => l.bid_period_id === period.id).map(l => l.line_id) : null
  const [form, setForm] = useState<PeriodDraft>(() => period
    ? { name: period.name, kind: period.kind, start_date: period.start_date, end_date: period.end_date, closes_at: period.closes_at, notes: period.notes, lineIds: existingLines ?? [] }
    : {
        name: presetKind === 'offer' ? 'Growth line offer' : q.name, kind: presetKind ?? 'quarter',
        start_date: presetKind === 'offer' ? addDays(todayISO(), 7) : q.start, // An offer runs to the end of the current quarter (the day before the next one starts).
        end_date: presetKind === 'offer' ? addDays(q.start, -1) : q.end,
        closes_at: pacificToInstant(addDays(todayISO(), presetKind === 'offer' ? 3 : 14), '17:00').toISOString(), notes: null,
        lineIds: presetLineIds ?? data.lines.filter(l => l.active && l.category === 'core').map(l => l.id),
      })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof PeriodDraft>(k: K, v: PeriodDraft[K]) => setForm(f => ({ ...f, [k]: v }))
  const toggle = (id: string) => set('lineIds', form.lineIds.includes(id) ? form.lineIds.filter(x => x !== id) : [...form.lineIds, id])

  async function save() {
    if (!form.name.trim()) { setError('Give the bid a name.'); return }
    setBusy(true)
    setError(null)
    try { onDone(await data.savePeriod(period?.id ?? null, { ...form, name: form.name.trim() }, me?.id ?? null)) }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save.') }
    finally { setBusy(false) }
  }

  const groups = [
    { label: 'Core lines', list: data.lines.filter(l => l.active && l.category === 'core') },
    { label: 'Growth lines', list: data.lines.filter(l => l.active && l.category === 'growth') },
  ]

  return (
    <>
      <SubHeader title={period ? `Set up ${period.name}` : 'New bid'} onBack={onBack} />
      <ScrollBody>
        <Card className="space-y-4">
          <Field label="Name"><TextInput value={form.name} onChange={e => set('name', e.target.value)} /></Field>
          <Field label="Kind" group hint={form.kind === 'quarter' ? 'Core lines, stable for the quarter.' : form.kind === 'month' ? 'Growth lines added for the month.' : 'One or more lines offered mid-period by seniority.'}>
            <Segmented value={form.kind} options={[{ value: 'quarter', label: 'Quarter' }, { value: 'month', label: 'Month' }, { value: 'offer', label: 'Offer' }]} onChange={v => set('kind', v)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Lines start"><TextInput type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} /></Field>
            <Field label="Lines end"><TextInput type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)} /></Field>
          </div>
          <Field label="Bidding deadline (Pacific)">
            <TextInput type="datetime-local" value={toPacificInput(form.closes_at)} onChange={e => e.target.value && set('closes_at', fromPacificInput(e.target.value))} />
          </Field>
          <Field label="Notes (shown to admins)"><TextArea value={form.notes ?? ''} onChange={e => set('notes', e.target.value || null)} /></Field>
        </Card>
        <Card className="space-y-2">
          <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide">Lines in this bid ({form.lineIds.length})</p>
          {groups.filter(g => g.list.length).map(g => (
            <div key={g.label} className="space-y-1">
              <p className="text-xs text-[#6B7A99]">{g.label}</p>
              {g.list.map(l => (
                <label key={l.id} className="flex items-center gap-3 py-1">
                  <input type="checkbox" checked={form.lineIds.includes(l.id)} onChange={() => toggle(l.id)} className="w-4 h-4 accent-[#CC2A2A]" />
                  <span className="px-1.5 py-0.5 rounded-md bg-[#0B1A5C] text-white text-[11px] font-bold">{l.code}</span>
                  <span className="text-sm text-[#0B1A5C] flex-1">{lineSummary(l, data.lineDays.filter(d => d.line_id === l.id), data.blocksById)}</span>
                </label>
              ))}
            </div>
          ))}
        </Card>
        {error && <Warning>{error}</Warning>}
        <Button fullWidth size="lg" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
      </ScrollBody>
    </>
  )
}

function PeriodDetail({ period, onBack }: { period: BidPeriod; onBack: () => void }) {
  const data = useData()
  const { me } = useAuth()
  const confirm = useConfirm()
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const lineIds = new Set(data.bidPeriodLines.filter(l => l.bid_period_id === period.id).map(l => l.line_id))
  const lines = data.lines.filter(l => lineIds.has(l.id))
  const order = useMemo(() => biddingOrder(data.employees), [data.employees])
  const results = data.bidResults.filter(r => r.bid_period_id === period.id)
  const bids = data.bids.filter(b => b.bid_period_id === period.id)
  const optins = data.bidOptins.filter(o => o.bid_period_id === period.id)

  if (editing) return <PeriodSetup period={period} onDone={() => setEditing(false)} onBack={() => setEditing(false)} />

  async function run(fn: () => Promise<unknown>, done?: string) {
    setBusy(true); setError(null); setMsg(null)
    try { await fn(); if (done) setMsg(done) } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.') } finally { setBusy(false) }
  }

  const submitted = order.filter(e => optins.some(o => o.employee_id === e.id))
  const left = openPositions(lines, results)

  return (
    <>
      <SubHeader title={period.name} onBack={onBack} right={<StatusPill tone={STATUS[period.status].tone}>{STATUS[period.status].label}</StatusPill>} />
      <ScrollBody>
        <Card className="space-y-1">
          <p className="text-sm text-[#1B2E6B]">Lines run <b>{formatDate(period.start_date)} – {formatDate(period.end_date)}</b> · {lines.length} lines, {lines.reduce((n, l) => n + l.positions, 0)} spots</p>
          <p className="text-sm text-[#1B2E6B]">Deadline: <b>{deadlineText(period.closes_at)}</b></p>
          {period.notes && <p className="text-xs text-[#6B7A99]">{period.notes}</p>}
        </Card>

        {msg && <div className="rounded-xl bg-[#E8F5EE] text-[#2E7D52] px-3 py-2 text-sm font-medium">{msg}</div>}
        {error && <Warning>{error}</Warning>}

        {period.status === 'draft' && (
          <div className="flex gap-2">
            <Button className="flex-1" disabled={busy} onClick={async () => {
              if (await confirm({ title: `Open bidding for ${period.name}?`, body: `Everyone who bids on lines gets a notification and can rank lines until ${deadlineText(period.closes_at)}.`, confirmLabel: 'Open bidding' })) {
                await run(() => data.openBidding(period.id), 'Bidding is open. Everyone has been notified.')
              }
            }}>Open bidding</Button>
            <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
          </div>
        )}

        {period.status === 'open' && (
          <>
            <Card className="space-y-2">
              <p className="font-semibold text-[#0B1A5C]">{submitted.length} of {order.length} have ranked</p>
              <div className="h-2 bg-[#EEF1F8] rounded-full overflow-hidden"><div className="h-full bg-[#2E7D52]" style={{ width: `${order.length ? (submitted.length / order.length) * 100 : 0}%` }} /></div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(async () => { const n = await data.sendBidReminder(period.id); setMsg(`Reminder sent to ${n} ${n === 1 ? 'person' : 'people'}.`) })}>Send reminder</Button>
                <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Edit deadline / lines</Button>
              </div>
            </Card>
            <Button fullWidth size="lg" disabled={busy} onClick={async () => {
              const early = new Date(period.closes_at) > new Date()
              if (await confirm({
                title: 'Close bidding and assign lines?',
                body: <>{early && <p>The deadline hasn't passed yet. {order.length - submitted.length} people haven't ranked.</p>}<p>Lines are given out by seniority. You can review and change results before publishing.</p></>,
                confirmLabel: 'Close and assign', danger: early,
              })) await run(() => data.closeBidding(period.id), 'Bidding closed. Review the results below.')
            }}>Close bidding and assign by seniority</Button>
          </>
        )}

        {(period.status === 'closed' || period.status === 'published') && (
          <ResultsReview period={period} lines={lines} order={order} results={results} left={left} />
        )}

        {period.status === 'closed' && (
          <div className="space-y-2">
            <Button fullWidth size="lg" disabled={busy} onClick={async () => {
              if (await confirm({
                title: `Publish ${period.name}?`,
                body: <><p>Each person's line starts {formatDate(period.start_date)}. Current holders of these lines end the day before, and shifts are created through {formatDate(period.end_date)}.</p><p>Everyone gets a notification with their result.</p></>,
                confirmLabel: 'Publish',
              })) await run(() => data.publishPeriod(period.id, me?.id ?? null), 'Published. New lines and shifts are on the schedule.')
            }}>Publish results</Button>
            <Button fullWidth variant="secondary" disabled={busy} onClick={async () => {
              if (await confirm({ title: 'Re-run the seniority assignment?', body: 'This replaces the results, including any changes you made.', confirmLabel: 'Re-run', danger: true })) {
                await run(() => data.rerunAssignment(period.id), 'Results recalculated.')
              }
            }}>Re-run assignment</Button>
          </div>
        )}

        <Rankings order={order} bids={bids} optins={optins} lines={lines} />

        {(period.status === 'draft' || period.status === 'open' || period.status === 'closed') && (
          <Button fullWidth variant="ghost" disabled={busy} onClick={async () => {
            if (await confirm({ title: `Cancel ${period.name}?`, body: 'Rankings are kept for the record, but nothing is assigned.', confirmLabel: 'Cancel bid', danger: true })) {
              await run(() => data.cancelPeriod(period.id))
            }
          }}>Cancel this bid</Button>
        )}
      </ScrollBody>
    </>
  )
}

function ResultsReview({ period, lines, order, results, left }: {
  period: BidPeriod; lines: Line[]; order: Employee[]; results: BidResult[]; left: Map<string, number>
}) {
  const data = useData()
  const editable = period.status === 'closed'
  const unfilled = lines.filter(l => (left.get(l.id) ?? 0) > 0)
  const over = lines.filter(l => (left.get(l.id) ?? 0) < 0)
  const byEmp = new Map(results.map(r => [r.employee_id, r]))
  const people = [...order, ...data.employees.filter(e => byEmp.has(e.id) && !order.includes(e))]

  return (
    <>
      <SectionLabel>Results</SectionLabel>
      {over.length > 0 && <Warning>{over.map(l => `${l.code} has more people than spots.`).join(' ')} Fix before publishing.</Warning>}
      {unfilled.length > 0
        ? <Warning tone="amber">Still open after bidding: {unfilled.map(l => `${l.code}${(left.get(l.id) ?? 0) > 1 ? ` (${left.get(l.id)} spots)` : ''}`).join(', ')}.</Warning>
        : <div className="rounded-xl bg-[#E8F5EE] text-[#2E7D52] px-3 py-2 text-sm font-medium">Every line in this bid is filled.</div>}
      {people.map((e, i) => <ResultRow key={e.id} period={period} employee={e} place={i + 1} result={byEmp.get(e.id)} lines={lines} editable={editable} />)}
    </>
  )
}

function ResultRow({ period, employee, place, result, lines, editable }: {
  period: BidPeriod; employee: Employee; place: number; result: BidResult | undefined; lines: Line[]; editable: boolean
}) {
  const data = useData()
  const [changing, setChanging] = useState(false)
  const [choice, setChoice] = useState(result?.line_id ?? '')
  const [error, setError] = useState<string | null>(null)
  const line = result?.line_id ? lines.find(l => l.id === result.line_id) ?? data.lines.find(l => l.id === result.line_id) : undefined
  const availability = data.contacts.find(c => c.employee_id === employee.id)
  const optin = data.bidOptins.find(o => o.bid_period_id === period.id && o.employee_id === employee.id)
  const chosen = lines.find(l => l.id === choice)
  const check = chosen ? lineBidProblems(employee, chosen, data.lineDays.filter(d => d.line_id === chosen.id), availability?.availability, { wantsFullTime: optin?.wants_full_time }) : null

  async function save() {
    setError(null)
    try { await data.setBidResult(period.id, employee.id, choice || null, null); setChanging(false) }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save.') }
  }

  return (
    <Card className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="w-7 text-center text-sm font-bold text-[#6B7A99]">{place}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[#0B1A5C]">{employee.name} <span className="text-xs text-[#6B7A99]">· {employee.employment_type}{employee.role === 'attendant' ? ' attendant' : ''}</span></p>
          <p className="text-xs text-[#6B7A99]">{result?.note ?? 'Not assigned yet'}{result?.source === 'manual' ? ' (admin)' : ''}</p>
        </div>
        {line
          ? <span className="px-2 py-1 rounded-lg bg-[#0B1A5C] text-white text-xs font-bold">{line.code}</span>
          : <StatusPill tone="red">No line</StatusPill>}
      </div>
      {availability?.availability_notes && <p className="text-xs text-[#6B7A99] pl-10">Availability: {availability.availability_notes}</p>}
      {editable && !changing && <button className="text-xs text-[#CC2A2A] underline underline-offset-2 pl-10" onClick={() => setChanging(true)}>Change</button>}
      {changing && (
        <div className="space-y-2 pl-10">
          <Select value={choice} onChange={e => setChoice(e.target.value)} aria-label={`Line for ${employee.name}`}>
            <option value="">No line</option>
            {lines.map(l => <option key={l.id} value={l.id}>{l.code} · {lineSummary(l, data.lineDays.filter(d => d.line_id === l.id), data.blocksById)} · {lineTargetHours(data.lineDays.filter(d => d.line_id === l.id), data.blocksById)}h</option>)}
          </Select>
          {check && check.problems.length > 0 && <Warning tone="amber">{check.problems.map(p => <p key={p}>{p}</p>)}<p>You can still assign it.</p></Warning>}
          {check && check.warnings.length > 0 && <Warning tone="amber">{check.warnings.map(p => <p key={p}>{p}</p>)}</Warning>}
          {error && <Warning>{error}</Warning>}
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={save}>Save</Button>
            <Button size="sm" variant="secondary" onClick={() => setChanging(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </Card>
  )
}

/** Who ranked what, and when (the audit view). */
function Rankings({ order, bids, optins, lines }: { order: Employee[]; bids: { employee_id: string; line_id: string; rank: number }[]; optins: { employee_id: string; wants_full_time: boolean; submitted_at: string }[]; lines: Line[] }) {
  const [show, setShow] = useState(false)
  const code = (id: string) => lines.find(l => l.id === id)?.code ?? '?'
  return (
    <>
      <button onClick={() => setShow(s => !s)} className="text-sm text-[#6B7A99] underline underline-offset-2 px-1">{show ? 'Hide' : 'Show'} everyone's rankings</button>
      {show && (
        <Card className="space-y-2">
          {order.map((e, i) => {
            const mine = bids.filter(b => b.employee_id === e.id).sort((a, b) => a.rank - b.rank)
            const o = optins.find(x => x.employee_id === e.id)
            return (
              <div key={e.id} className="border-l-2 border-[#D8DFEF] pl-3">
                <p className="text-sm text-[#0B1A5C]"><b>{i + 1}. {e.name}</b> · {e.employment_type}{o?.wants_full_time ? ' · wants full-time' : ''}</p>
                <p className="text-xs text-[#6B7A99]">
                  {mine.length ? mine.map(b => `${b.rank}. ${code(b.line_id)}`).join('  ') : 'Did not rank'}
                  {o && ` · saved ${new Date(o.submitted_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
                </p>
              </div>
            )
          })}
        </Card>
      )}
    </>
  )
}
