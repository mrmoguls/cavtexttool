import { useState } from 'react'
import { useData } from '../../lib/data-context'
import { dueStatus, formatDate, NEEDS_ATTENTION, todayISO, type DueLevel } from '../../lib/scheduling'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { ScrollBody, SectionLabel, Select, SubHeader, Warning } from '../../components/ui/Form'
import { StatusPill } from '../../components/schedule/ShiftBits'
import { LEVEL_TONE, sortByUrgency } from '../driver/MyCertifications'
import { BadgeCheck, BellRing } from 'lucide-react'

const GROUPS: { label: string; levels: DueLevel[] }[] = [
  { label: 'Overdue', levels: ['overdue'] },
  { label: 'Due within 7 days', levels: ['due7'] },
  { label: 'Due within 30 days', levels: ['due30'] },
  { label: 'Due within 60 days', levels: ['due60'] },
  { label: 'No date on file', levels: ['nodate'] },
]

export function AdminCertifications({ onBack }: { onBack: () => void }) {
  const data = useData()
  const today = todayISO()
  const [person, setPerson] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const active = new Set(data.employees.filter(e => e.active).map(e => e.id))
  const items = sortByUrgency(data.complianceItems.filter(i => active.has(i.employee_id) && (!person || i.employee_id === person)), today)
  const count = (l: DueLevel) => items.filter(i => dueStatus(i, today).level === l).length
  const reported = items.filter(i => i.renewal_reported_at)
  const lastSync = data.complianceItems.map(i => i.synced_at).sort().at(-1)
  const people = data.employees.filter(e => e.active && data.complianceItems.some(i => i.employee_id === e.id))

  async function sendAlerts() {
    setBusy(true); setError(null); setMsg(null)
    try {
      const n = await data.runAlertsNow()
      setMsg(n ? `Sent ${n} reminder${n === 1 ? '' : 's'}. Admins got a summary.` : 'Everyone already has their current reminders. Nothing new to send.')
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not send alerts.') }
    finally { setBusy(false) }
  }

  const Row = ({ i }: { i: (typeof items)[number] }) => {
    const st = dueStatus(i, today)
    return (
      <Card className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-[#0B1A5C]">{data.employeesById.get(i.employee_id)?.name ?? 'Unknown'}</p>
            <p className="text-sm text-[#1B2E6B]">{i.requirement}</p>
            <p className="text-xs text-[#6B7A99]">{i.next_due ? `Due ${formatDate(i.next_due)}` : i.last_completed ? `Completed ${formatDate(i.last_completed)}` : 'No date in the sheet'}{i.notes ? ` · ${i.notes}` : ''}</p>
          </div>
          <StatusPill tone={LEVEL_TONE[st.level]}>{st.label}</StatusPill>
        </div>
        {i.renewal_reported_at && (
          <p className="text-xs font-medium text-[#2E7D52]">
            Reported renewed {formatDate(i.renewal_reported_at.slice(0, 10))}{i.renewal_note ? `: "${i.renewal_note}"` : ''}. Update the Due Dates tab, then sync.
          </p>
        )}
      </Card>
    )
  }

  return (
    <>
      <SubHeader title="Certifications" onBack={onBack} />
      <ScrollBody>
        <Card className="space-y-2">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><p className="text-2xl font-bold text-[#CC2A2A] tabular-nums">{count('overdue')}</p><p className="text-xs text-[#6B7A99]">Overdue</p></div>
            <div><p className="text-2xl font-bold text-amber-700 tabular-nums">{count('due7') + count('due30')}</p><p className="text-xs text-[#6B7A99]">Due in 30 days</p></div>
            <div><p className="text-2xl font-bold text-[#1B2E6B] tabular-nums">{count('due60')}</p><p className="text-xs text-[#6B7A99]">Due in 31–60</p></div>
          </div>
          <p className="text-xs text-[#6B7A99]">
            Dates come from the sheet's <b>Due Dates</b> tab. To record a renewal, update the sheet, then Admin → Employees → Sync.
            {lastSync ? ` Last synced ${new Date(lastSync).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.` : ''}
          </p>
          <p className="text-xs text-[#6B7A99]">Reminders go out automatically at 60, 30 and 7 days, and weekly once overdue.</p>
          <Button size="sm" variant="secondary" disabled={busy} onClick={sendAlerts}><BellRing size={14} /> Send reminders now</Button>
        </Card>
        {msg && <div className="rounded-xl bg-[#E8F5EE] text-[#2E7D52] px-3 py-2 text-sm font-medium">{msg}</div>}
        {error && <Warning>{error}</Warning>}

        <Select value={person} onChange={e => setPerson(e.target.value)} aria-label="Filter by person">
          <option value="">Everyone</option>
          {people.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Select>

        {data.complianceItems.length === 0 && (
          <EmptyState icon={<BadgeCheck />} title="No certifications yet" body="Sync from the Google Sheet (Admin → Employees) to bring in the Due Dates tab." />
        )}

        {reported.length > 0 && (
          <>
            <SectionLabel>Renewed, waiting for the sheet ({reported.length})</SectionLabel>
            {reported.map(i => <Row key={`r-${i.id}`} i={i} />)}
          </>
        )}

        {GROUPS.map(g => {
          const list = items.filter(i => g.levels.includes(dueStatus(i, today).level))
          if (!list.length) return null
          return (
            <div key={g.label} className="space-y-2">
              <SectionLabel>{g.label} ({list.length})</SectionLabel>
              {list.map(i => <Row key={i.id} i={i} />)}
            </div>
          )
        })}

        {items.some(i => !NEEDS_ATTENTION.includes(dueStatus(i, today).level) && dueStatus(i, today).level !== 'nodate') && (
          <>
            <button onClick={() => setShowAll(s => !s)} className="text-sm text-[#6B7A99] underline underline-offset-2 px-1">
              {showAll ? 'Hide' : 'Show'} current items
            </button>
            {showAll && items.filter(i => ['ok', 'done'].includes(dueStatus(i, today).level)).map(i => <Row key={i.id} i={i} />)}
          </>
        )}
      </ScrollBody>
    </>
  )
}
