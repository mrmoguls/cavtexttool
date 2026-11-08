import { useState } from 'react'
import { useData } from '../../lib/data-context'
import { dueStatus, formatDate, NEEDS_ATTENTION, todayISO, type DueLevel } from '../../lib/scheduling'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { ScrollBody, SubHeader, TextArea, Warning } from '../../components/ui/Form'
import { StatusPill } from '../../components/schedule/ShiftBits'
import type { ComplianceItem, Employee } from '../../types'
import { BadgeCheck, ShieldAlert } from 'lucide-react'

export const LEVEL_TONE: Record<DueLevel, 'red' | 'amber' | 'green' | 'muted'> = {
  overdue: 'red', due7: 'red', due30: 'amber', due60: 'amber', ok: 'green', done: 'green', nodate: 'muted',
}
const ORDER: DueLevel[] = ['overdue', 'due7', 'due30', 'due60', 'nodate', 'ok', 'done']

export function sortByUrgency(items: ComplianceItem[], today: string) {
  return [...items].sort((a, b) => {
    const sa = dueStatus(a, today), sb = dueStatus(b, today)
    return ORDER.indexOf(sa.level) - ORDER.indexOf(sb.level) || (sa.days ?? 99999) - (sb.days ?? 99999)
  })
}

/** Summary card on the driver's Schedule tab. */
export function CertificationsCard({ driver, onOpen }: { driver: Employee; onOpen: () => void }) {
  const data = useData()
  const today = todayISO()
  const mine = data.complianceItems.filter(i => i.employee_id === driver.id)
  if (mine.length === 0) return null
  const overdue = mine.filter(i => dueStatus(i, today).level === 'overdue')
  const soon = mine.filter(i => ['due7', 'due30', 'due60'].includes(dueStatus(i, today).level))
  const urgent = overdue.length > 0
  return (
    <Card onClick={onOpen} className={urgent ? 'border-2 border-[#CC2A2A]/40' : soon.length ? 'border-2 border-amber-300' : ''}>
      <div className="flex items-center gap-3">
        <div className={`rounded-xl p-2 ${urgent ? 'bg-[#FCE9E9] text-[#CC2A2A]' : soon.length ? 'bg-amber-100 text-amber-800' : 'bg-[#E8F5EE] text-[#2E7D52]'}`}>
          {urgent || soon.length ? <ShieldAlert size={18} /> : <BadgeCheck size={18} />}
        </div>
        <div className="flex-1">
          <p className="font-semibold text-[#0B1A5C]">Certifications</p>
          <p className={`text-sm ${urgent ? 'text-[#CC2A2A]' : 'text-[#6B7A99]'}`}>
            {urgent ? `${overdue.map(i => i.requirement).join(', ')} overdue` : soon.length ? `${soon.length} coming due soon` : 'All current'}
          </p>
        </div>
      </div>
    </Card>
  )
}

export function MyCertifications({ driver, onBack }: { driver: Employee; onBack: () => void }) {
  const data = useData()
  const today = todayISO()
  const items = sortByUrgency(data.complianceItems.filter(i => i.employee_id === driver.id), today)
  return (
    <>
      <SubHeader title="My certifications" onBack={onBack} />
      <ScrollBody>
        <p className="text-sm text-[#6B7A99] px-1">
          You'll get a reminder 60, 30 and 7 days before something is due. After you renew, tap "I renewed it" so the office can update your record.
        </p>
        {items.length === 0 && <EmptyState icon={<BadgeCheck />} title="Nothing on file" body="The office hasn't added your certifications yet." />}
        {items.map(i => <CertCard key={i.id} item={i} today={today} />)}
      </ScrollBody>
    </>
  )
}

function CertCard({ item, today }: { item: ComplianceItem; today: string }) {
  const data = useData()
  const [reporting, setReporting] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const st = dueStatus(item, today)
  const req = data.complianceRequirements.find(r => r.name === item.requirement)
  const attention = NEEDS_ATTENTION.includes(st.level)

  async function report() {
    setBusy(true); setError(null)
    try { await data.reportRenewal(item.id, note.trim() || null); setReporting(false) }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not send.') }
    finally { setBusy(false) }
  }

  return (
    <Card className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-[#0B1A5C]">{item.requirement}</p>
          <p className="text-xs text-[#6B7A99]">
            {item.next_due ? `Due ${formatDate(item.next_due)}` : item.last_completed ? `Completed ${formatDate(item.last_completed)}` : 'No date on file'}
            {item.frequency_months ? ` · every ${item.frequency_months >= 12 && item.frequency_months % 12 === 0 ? `${item.frequency_months / 12} yr${item.frequency_months === 12 ? '' : 's'}` : `${item.frequency_months} months`}` : ''}
          </p>
        </div>
        <StatusPill tone={LEVEL_TONE[st.level]}>{st.label}</StatusPill>
      </div>
      {attention && req?.how_to && <p className="text-sm text-[#1B2E6B]"><b>How to renew:</b> {req.how_to}</p>}
      {item.notes && <p className="text-xs text-[#6B7A99]">Office note: {item.notes}</p>}
      {item.renewal_reported_at ? (
        <p className="text-xs text-[#2E7D52] font-medium">You reported this renewed on {formatDate(item.renewal_reported_at.slice(0, 10))}. The office will update it.</p>
      ) : attention && (
        reporting ? (
          <div className="space-y-2">
            <TextArea value={note} onChange={e => setNote(e.target.value)} placeholder="New expiration date or anything the office should know (optional)" />
            <p className="text-xs text-[#6B7A99]">Bring a copy of the new card or certificate to the office if they need one.</p>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" disabled={busy} onClick={report}>Tell the office</Button>
              <Button size="sm" variant="secondary" onClick={() => setReporting(false)}>Cancel</Button>
            </div>
          </div>
        ) : <Button size="sm" variant="secondary" onClick={() => setReporting(true)}>I renewed it</Button>
      )}
      {error && <Warning>{error}</Warning>}
    </Card>
  )
}
