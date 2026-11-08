import { useMemo, useState } from 'react'
import { useData } from '../../lib/data-context'
import { biddingOrder, formatDate, isBidder, lineBidProblems, lineSummary, lineTargetHours } from '../../lib/scheduling'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { ScrollBody, SectionLabel, SubHeader, Toggle, Warning } from '../../components/ui/Form'
import { StatusPill } from '../../components/schedule/ShiftBits'
import type { BidPeriod, Employee, Line } from '../../types'
import { ArrowDown, ArrowUp, Gavel, Plus, X } from 'lucide-react'

export const deadlineText = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** The bid period this person should hear about right now (open, closed awaiting results, or just published). */
export function useMyBid(driver: Employee) {
  const data = useData()
  if (!isBidder(driver)) return null
  const open = data.bidPeriods.find(p => p.status === 'open')
  if (open) return open
  const closed = data.bidPeriods.find(p => p.status === 'closed')
  if (closed) return closed
  return data.bidPeriods.find(p => p.status === 'published' && p.end_date >= new Date().toISOString().slice(0, 10)) ?? null
}

/** Banner at the top of the driver's Schedule tab. */
export function BidBanner({ driver, onOpen }: { driver: Employee; onOpen: (p: BidPeriod) => void }) {
  const data = useData()
  const period = useMyBid(driver)
  if (!period) return null
  const ranked = data.bids.filter(b => b.bid_period_id === period.id && b.employee_id === driver.id).length
  const result = data.bidResults.find(r => r.bid_period_id === period.id && r.employee_id === driver.id)
  const gotLine = result?.line_id ? data.lines.find(l => l.id === result.line_id) : undefined

  if (period.status === 'published') {
    if (!result) return null
    return (
      <Card className="border-2 border-[#2E7D52]/30">
        <p className="text-xs font-semibold text-[#2E7D52] uppercase tracking-wide">{period.name} results</p>
        <p className="font-semibold text-[#0B1A5C] mt-1">{gotLine ? `You got ${gotLine.code}, starting ${formatDate(period.start_date)}` : 'No line this period'}</p>
        {!gotLine && <p className="text-sm text-[#6B7A99]">Talk to dispatch about open shifts and fill-ins.</p>}
      </Card>
    )
  }
  return (
    <Card onClick={period.status === 'open' ? () => onOpen(period) : undefined} className="border-2 border-[#CC2A2A]/30">
      <div className="flex items-start gap-3">
        <div className="rounded-xl p-2 bg-[#FCE9E9] text-[#CC2A2A]"><Gavel size={18} /></div>
        <div className="flex-1">
          <p className="font-semibold text-[#0B1A5C]">{period.status === 'open' ? `Bidding is open: ${period.name}` : `Bidding closed: ${period.name}`}</p>
          <p className="text-sm text-[#6B7A99]">
            {period.status === 'open'
              ? ranked ? `You ranked ${ranked} line${ranked === 1 ? '' : 's'}. Change it until ${deadlineText(period.closes_at)}.` : `Rank your lines by ${deadlineText(period.closes_at)}.`
              : 'Results are being reviewed. You\'ll get a notification when they\'re published.'}
          </p>
        </div>
        {period.status === 'open' && (ranked ? <StatusPill tone="green">Ranked</StatusPill> : <StatusPill tone="red">To do</StatusPill>)}
      </div>
    </Card>
  )
}

export function DriverBid({ driver, period, onBack }: { driver: Employee; period: BidPeriod; onBack: () => void }) {
  const data = useData()
  const savedRanking = useMemo(() => data.bids
    .filter(b => b.bid_period_id === period.id && b.employee_id === driver.id)
    .sort((a, b) => a.rank - b.rank).map(b => b.line_id), [data.bids, period.id, driver.id])
  const savedOptin = data.bidOptins.find(o => o.bid_period_id === period.id && o.employee_id === driver.id)
  const [ranking, setRanking] = useState<string[]>(savedRanking)
  const [wantsFT, setWantsFT] = useState(savedOptin?.wants_full_time ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [showOthers, setShowOthers] = useState(false)

  const availability = data.contacts.find(c => c.employee_id === driver.id)?.availability
  const lineIds = new Set(data.bidPeriodLines.filter(l => l.bid_period_id === period.id).map(l => l.line_id))
  const lines = data.lines.filter(l => lineIds.has(l.id))
  const lineById = new Map(lines.map(l => [l.id, l]))
  const daysOf = (l: Line) => data.lineDays.filter(d => d.line_id === l.id)
  const check = (l: Line) => lineBidProblems(driver, l, daysOf(l), availability, { wantsFullTime: wantsFT })
  const eligible = lines.filter(l => check(l).problems.length === 0)
  const others = lines.filter(l => check(l).problems.length > 0 && !ranking.includes(l.id))
  // Lines already in the ranking that are no longer allowed (e.g. availability changed in the sheet).
  const staleRanked = ranking.filter(id => { const l = lineById.get(id); return l ? check(l).problems.length > 0 : false })
  const order = biddingOrder(data.employees)
  const myPlace = order.findIndex(e => e.id === driver.id) + 1
  const dirty = JSON.stringify(ranking) !== JSON.stringify(savedRanking) || wantsFT !== (savedOptin?.wants_full_time ?? false)
  const closed = period.status !== 'open' || new Date(period.closes_at) < new Date()

  function move(i: number, by: number) {
    const next = [...ranking]
    const [x] = next.splice(i, 1)
    next.splice(i + by, 0, x)
    setRanking(next)
    setSaved(false)
  }

  function setFullTime(v: boolean) {
    setWantsFT(v)
    setSaved(false)
    // Turning it off removes full-time lines from the ranking.
    if (!v) setRanking(r => r.filter(id => !(lineById.get(id)?.employment_type === 'FT' && driver.employment_type === 'PT')))
  }

  async function save() {
    setBusy(true)
    setError(null)
    try { await data.submitBids(period.id, ranking, wantsFT); setSaved(true) }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save your ranking.') }
    finally { setBusy(false) }
  }

  const LineInfo = ({ l }: { l: Line }) => (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="px-1.5 py-0.5 rounded-md bg-[#0B1A5C] text-white text-[11px] font-bold">{l.code}</span>
        <p className="text-sm font-medium text-[#0B1A5C] truncate">{lineSummary(l, daysOf(l), data.blocksById)}</p>
      </div>
      <p className="text-xs text-[#6B7A99] mt-0.5">
        {l.is_flex ? 'On-call + fill-ins' : `${lineTargetHours(daysOf(l), data.blocksById)} hrs/week`} · {l.employment_type}
        {l.positions > 1 ? ` · ${l.positions} spots` : ''}{l.category === 'growth' ? ' · growth' : ''}
      </p>
      {check(l).warnings.map(w => <p key={w} className="text-xs text-amber-700">{w}</p>)}
    </div>
  )

  return (
    <>
      <SubHeader title={period.name} onBack={onBack} />
      <ScrollBody>
        <Card className="space-y-1">
          <p className="text-sm text-[#1B2E6B]">Lines run <b>{formatDate(period.start_date)} – {formatDate(period.end_date)}</b>.</p>
          <p className="text-sm text-[#1B2E6B]">Rank by <b>{deadlineText(period.closes_at)}</b>. You can change your ranking until then.</p>
          <p className="text-xs text-[#6B7A99]">
            Lines are given out in seniority order (full-time first, then part-time). You're <b>#{myPlace}</b> of {order.length}.
            You get your highest-ranked line that's still open when it's your turn, so rank every line you'd accept.
          </p>
        </Card>

        {driver.employment_type === 'PT' && (
          <Card>
            <Toggle label="I want full-time" checked={wantsFT} onChange={setFullTime}
              hint="Lets you rank full-time lines. You only get one if it's still open after every full-time employee has picked." />
          </Card>
        )}

        <SectionLabel>Your ranking</SectionLabel>
        {ranking.length === 0 && <p className="text-sm text-[#6B7A99] px-1">Add lines from the list below, best first.</p>}
        {ranking.map((id, i) => {
          const l = lineById.get(id)
          if (!l) return null
          return (
            <Card key={id}>
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-[#CC2A2A] text-white text-sm font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <LineInfo l={l} />
                  {check(l).problems.length > 0 && <p className="text-xs text-[#A82020]">Remove this — you can't rank it anymore: {check(l).problems[0]}</p>}
                </div>
                {!closed && (
                  <div className="flex flex-col">
                    <button disabled={i === 0} onClick={() => move(i, -1)} className="p-1 text-[#0B1A5C] disabled:opacity-20" aria-label={`Move ${l.code} up`}><ArrowUp size={16} /></button>
                    <button disabled={i === ranking.length - 1} onClick={() => move(i, 1)} className="p-1 text-[#0B1A5C] disabled:opacity-20" aria-label={`Move ${l.code} down`}><ArrowDown size={16} /></button>
                  </div>
                )}
                {!closed && <button onClick={() => { setRanking(ranking.filter(x => x !== id)); setSaved(false) }} className="p-1 text-[#6B7A99]" aria-label={`Remove ${l.code}`}><X size={16} /></button>}
              </div>
            </Card>
          )
        })}

        {!closed && (
          <>
            {error && <Warning>{error}</Warning>}
            {staleRanked.length > 0 && <Warning>Remove the lines marked in red before saving.</Warning>}
            {saved && !dirty && <div className="rounded-xl bg-[#E8F5EE] text-[#2E7D52] px-3 py-2 text-sm font-medium">Ranking saved.</div>}
            <Button fullWidth size="lg" onClick={save} disabled={busy || !dirty || staleRanked.length > 0}>{busy ? 'Saving…' : dirty ? 'Save ranking' : 'Saved'}</Button>
          </>
        )}

        <SectionLabel>Lines you can rank</SectionLabel>
        {eligible.filter(l => !ranking.includes(l.id)).map(l => (
          <Card key={l.id}>
            <div className="flex items-center gap-2">
              <LineInfo l={l} />
              {!closed && <Button size="sm" variant="secondary" onClick={() => { setRanking([...ranking, l.id]); setSaved(false) }} aria-label={`Add ${l.code}`}><Plus size={14} /> Add</Button>}
            </div>
          </Card>
        ))}
        {eligible.length > 0 && eligible.every(l => ranking.includes(l.id)) && <p className="text-sm text-[#6B7A99] px-1">You've ranked every line you can.</p>}

        {others.length > 0 && (
          <>
            <button onClick={() => setShowOthers(s => !s)} className="text-sm text-[#6B7A99] underline underline-offset-2 px-1">
              {showOthers ? 'Hide' : 'Show'} {others.length} line{others.length === 1 ? '' : 's'} you can't rank
            </button>
            {showOthers && others.map(l => (
              <Card key={l.id} className="opacity-70">
                <LineInfo l={l} />
                <p className="text-xs text-[#A82020] mt-1">{check(l).problems[0]}</p>
              </Card>
            ))}
          </>
        )}
      </ScrollBody>
    </>
  )
}
