import { useMemo, useState } from 'react'
import { useData, type EmployeeDraft } from '../../lib/data-context'
import { useAuth } from '../../lib/auth'
import { isDemoMode } from '../../lib/supabase'
import { bySeniority, DISPLAY_WEEK, DOW_SHORT, formatDate, isActiveOn, todayISO } from '../../lib/scheduling'
import { nameKey, parseDueDates, parseSheet, planSync, type SheetValues, type SyncPlan } from '../../lib/sheet-sync'
import { dueStatus } from '../../lib/scheduling'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Field, ScrollBody, SectionLabel, Segmented, SubHeader, TextInput, Toggle, Warning } from '../../components/ui/Form'
import type { Availability, Employee, EmployeeRole } from '../../types'
import { UserPlus, Sheet, RefreshCw } from 'lucide-react'

const ROLE_OPTIONS: { value: EmployeeRole; label: string }[] = [
  { value: 'driver', label: 'Driver' },
  { value: 'attendant', label: 'Attendant' },
  { value: 'dispatcher', label: 'Dispatch' },
  { value: 'admin', label: 'Admin' },
]

function pinFrom(phone: string | undefined) {
  const d = (phone ?? '').replace(/\D/g, '')
  return d.length >= 4 ? d.slice(-4) : null
}

export function AdminEmployees({ onBack }: { onBack: () => void }) {
  const data = useData()
  const [editing, setEditing] = useState<Employee | 'new' | null>(null)
  const [syncing, setSyncing] = useState(false)
  const today = todayISO()

  const lineFor = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of data.assignments) {
      if (!isActiveOn(a.effective_from, a.effective_to, today)) continue
      const line = data.lines.find(l => l.id === a.line_id)
      if (line) map.set(a.employee_id, line.code)
    }
    return map
  }, [data.assignments, data.lines, today])

  if (editing) {
    return <EmployeeForm employee={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
  }
  if (syncing) return <SheetSync onBack={() => setSyncing(false)} />

  const lastSync = data.employees.map(e => e.sheet_synced_at).filter(Boolean).sort().at(-1)

  const active = bySeniority(data.employees.filter(e => e.active))
  const groups: { label: string; list: Employee[] }[] = [
    { label: 'Drivers (by seniority)', list: active.filter(e => e.role === 'driver') },
    { label: 'Attendants (by seniority)', list: active.filter(e => e.role === 'attendant') },
    { label: 'Dispatch & admin', list: active.filter(e => e.role === 'dispatcher' || e.role === 'admin') },
    { label: 'Inactive', list: data.employees.filter(e => !e.active) },
  ]

  return (
    <>
      <SubHeader title="Employees" onBack={onBack} />
      <ScrollBody>
        <Card onClick={() => setSyncing(true)}>
          <div className="flex items-center gap-3">
            <div className="rounded-xl p-2.5 bg-[#E8F5EE] text-[#2E7D52]"><Sheet size={20} /></div>
            <div className="flex-1">
              <p className="font-semibold text-[#0B1A5C]">Sync from Google Sheet</p>
              <p className="text-sm text-[#6B7A99]">
                Seniority, role, FT/PT, phone and availability come from the Master Contact and Schedule sheet.
                {lastSync ? ` Last synced ${new Date(lastSync).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.` : ' Not synced yet.'}
              </p>
            </div>
          </div>
        </Card>
        <Button fullWidth variant="secondary" onClick={() => setEditing('new')}>
          <UserPlus size={18} /> Add employee (not in the sheet)
        </Button>
        {groups.filter(g => g.list.length).map(g => (
          <div key={g.label} className="space-y-2">
            <SectionLabel>{g.label}</SectionLabel>
            {g.list.map((e, i) => {
              const hasPin = !!pinFrom(data.contacts.find(c => c.employee_id === e.id)?.phone)
              const crew = e.role === 'driver' || e.role === 'attendant'
              return (
                <Card key={e.id} onClick={() => setEditing(e)}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#FCE9E9] flex items-center justify-center text-[#CC2A2A] font-semibold text-sm flex-shrink-0">
                      {crew && e.active ? i + 1 : e.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[#0B1A5C] truncate">{e.name}</p>
                      <p className="text-xs text-[#6B7A99]">
                        {e.seniority_date ? `Since ${formatDate(e.seniority_date)}` : 'No seniority date'}
                        {crew && ` · ${lineFor.get(e.id) ?? 'No line'}`}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <Badge variant="muted">{e.employment_type}</Badge>
                        {e.gurney_qualified && <Badge variant="sage">Gurney</Badge>}
                        {!crew && <Badge variant="muted">{e.role === 'admin' ? 'Admin' : 'Dispatch'}</Badge>}
                        {crew && e.can_dispatch && <Badge variant="muted">Also dispatches</Badge>}
                        {crew && e.bids_on_lines === false && <Badge variant="muted">Backup · no bidding</Badge>}
                        {!hasPin && <Badge>No phone · can't sign in</Badge>}
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        ))}
      </ScrollBody>
    </>
  )
}

function EmployeeForm({ employee, onDone }: { employee: Employee | null; onDone: () => void }) {
  const data = useData()
  const auth = useAuth()
  const existingPhone = employee ? data.contacts.find(c => c.employee_id === employee.id)?.phone ?? '' : ''
  const [form, setForm] = useState<EmployeeDraft>(() => employee
    ? {
        id: employee.id, name: employee.name, role: employee.role, employment_type: employee.employment_type,
        seniority_date: employee.seniority_date, hire_seq: employee.hire_seq,
        gurney_qualified: employee.gurney_qualified, active: employee.active,
      }
    : { name: '', role: 'driver', employment_type: 'PT', seniority_date: todayISO(), hire_seq: null, gurney_qualified: false, active: true })
  const [phone, setPhone] = useState(existingPhone)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof EmployeeDraft>(k: K, v: EmployeeDraft[K]) => setForm(f => ({ ...f, [k]: v }))
  const pin = pinFrom(phone)
  // Synced from the Google Sheet: change these in the sheet, then sync.
  const locked = !!employee?.sheet_managed
  const contact = employee ? data.contacts.find(c => c.employee_id === employee.id) : undefined
  const sameDay = form.seniority_date
    ? data.employees.filter(e => e.id !== form.id && e.active && e.seniority_date === form.seniority_date)
    : []

  async function save() {
    if (!form.name.trim()) { setError('Name is required.'); return }
    if (form.id && form.id === auth.me?.id && (form.role !== 'admin' || !form.active)) {
      setError("You can't remove your own admin access. Ask another admin.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      await data.saveEmployee({ ...form, name: form.name.trim() }, phone)
      if (form.id === auth.me?.id) await auth.refreshMe()
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
      setSaving(false)
    }
  }

  return (
    <>
      <SubHeader title={employee ? employee.name : 'New employee'} onBack={onDone} />
      <ScrollBody>
        {locked && (
          <div className="flex items-start gap-2 rounded-xl bg-[#E8F5EE] text-[#2E7D52] px-3 py-2 text-sm">
            <Sheet size={16} className="mt-0.5 flex-shrink-0" />
            <p>Managed in the Google Sheet. To change name, role, FT/PT, phone, seniority or active status, edit the sheet and sync. Gurney qualification is set here.</p>
          </div>
        )}
        <fieldset disabled={locked} className="space-y-3 disabled:opacity-60">
        <Card className="space-y-4">
          <Field label="Name">
            <TextInput value={form.name} onChange={e => set('name', e.target.value)} placeholder="Full name" />
          </Field>
          <Field label="Role" group hint={employee?.can_dispatch ? 'Also has dispatch access (from the sheet).' : employee?.bids_on_lines === false ? 'Backup driver: picks up open shifts, does not bid on lines.' : undefined}>
            <Segmented value={form.role} options={ROLE_OPTIONS} onChange={v => set('role', v)} />
          </Field>
          <Field label="Employment" group>
            <Segmented value={form.employment_type} options={[{ value: 'FT', label: 'Full-time' }, { value: 'PT', label: 'Part-time' }]} onChange={v => set('employment_type', v)} />
          </Field>
          <Field
            label="Phone"
            hint={isDemoMode ? "Demo mode: everyone signs in with 0000. In the real app the PIN is the last 4 digits of this number." : pin ? <>Sign-in PIN: <b className="text-[#0B1A5C]">{pin}</b> (last 4 digits)</> : 'Needed to sign in — the PIN is the last 4 digits.'}
          >
            <TextInput type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(530) 555-1234" />
          </Field>
        </Card>

        </fieldset>

        <Card className="space-y-4">
          <fieldset disabled={locked} className="space-y-4 disabled:opacity-60">
          <Field label="Seniority date" hint="Earlier date = higher seniority for bidding.">
            <TextInput type="date" value={form.seniority_date ?? ''} onChange={e => set('seniority_date', e.target.value || null)} />
          </Field>
          <Field
            label="Hire order (tie-break)"
            hint={sameDay.length
              ? `Same seniority date as ${sameDay.map(e => e.name).join(', ')}. Lower number = more senior.`
              : 'Only needed when two people share a seniority date. Lower number = more senior.'}
          >
            <TextInput
              type="number" inputMode="numeric" min={1}
              value={form.hire_seq ?? ''}
              onChange={e => set('hire_seq', e.target.value === '' ? null : Number(e.target.value))}
            />
          </Field>
          <Toggle label="Active" checked={form.active} onChange={v => set('active', v)} hint="Inactive people can't sign in and aren't scheduled." />
          </fieldset>
          <Toggle label="Gurney qualified" checked={form.gurney_qualified} onChange={v => set('gurney_qualified', v)} hint="Can drive gurney lines and shifts." />
        </Card>

        {contact && (contact.availability || contact.availability_notes) && (
          <Card className="space-y-2">
            <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide">Availability (from the sheet)</p>
            <AvailabilityStrip availability={contact.availability ?? null} />
            {contact.availability_notes && <p className="text-sm text-[#1B2E6B]">{contact.availability_notes}</p>}
          </Card>
        )}

        {error && <Warning>{error}</Warning>}
        <Button fullWidth size="lg" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </ScrollBody>
    </>
  )
}

export function AvailabilityStrip({ availability }: { availability: Availability | null }) {
  if (!availability) return <p className="text-sm text-[#6B7A99]">No days marked.</p>
  return (
    <div className="grid grid-cols-7 gap-1">
      {DISPLAY_WEEK.map(d => {
        const v = Number(availability[String(d)] ?? 0)
        const cls = v >= 1 ? 'bg-[#E8F5EE] text-[#2E7D52]' : v > 0 ? 'bg-amber-100 text-amber-900' : 'bg-[#EEF1F8] text-[#6B7A99] line-through'
        return (
          <div key={d} className={`rounded-lg text-center py-1.5 text-xs font-semibold ${cls}`} title={v >= 1 ? 'Available' : v > 0 ? 'Partly available' : 'Not available'}>
            {DOW_SHORT[d]}
          </div>
        )
      })}
    </div>
  )
}

function SheetSync({ onBack }: { onBack: () => void }) {
  const data = useData()
  const [plan, setPlan] = useState<SyncPlan | null>(null)
  const [values, setValues] = useState<SheetValues | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function preview() {
    setBusy(true); setError(null); setDone(null)
    try {
      const v = await data.fetchSheet()
      setValues(v)
      setPlan(planSync(parseSheet(v), data.employees, data.contacts))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read the sheet.')
    } finally { setBusy(false) }
  }

  async function apply() {
    if (!plan || !values) return
    setBusy(true); setError(null)
    try {
      const c = await data.applySync(plan, values)
      setDone(`Synced: ${plan.creates.length} added, ${plan.updates.length} updated, ${plan.unchanged.length} unchanged. Certifications: ${c.upserts} items${c.unmatched.length ? `; ${c.unmatched.length} name${c.unmatched.length === 1 ? '' : 's'} on the Due Dates tab didn't match anyone (${c.unmatched.join(', ')})` : ''}.`)
      setPlan(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed.')
    } finally { setBusy(false) }
  }

  // Certifications preview (Due Dates tab), matched against people in the app or about to be added.
  const due = values ? parseDueDates(values.dueDates) : []
  const known = new Set([...data.employees.map(e => nameKey(e.name)), ...(plan?.creates.map(p => p.key) ?? [])])
  const dueMatched = due.filter(r => known.has(r.key))
  const dueUnmatched = [...new Set(due.filter(r => !known.has(r.key)).map(r => r.name))]
  const today = todayISO()
  const dueOverdue = dueMatched.filter(r => dueStatus({ ...r }, today).level === 'overdue').length
  const dueSoon = dueMatched.filter(r => ['due7', 'due30', 'due60'].includes(dueStatus({ ...r }, today).level)).length

  const issues = plan ? [...plan.creates, ...plan.updates.map(u => u.person), ...plan.unchanged].filter(p => p.issues.length) : []

  return (
    <>
      <SubHeader title="Sync from Google Sheet" onBack={onBack} />
      <ScrollBody>
        <Card className="space-y-2">
          <p className="text-sm text-[#1B2E6B]">
            Reads the <b>Roster</b> tab (start date = seniority, role, status), the <b>Schedule</b> tab (phone, days available, notes),
            and the <b>Due Dates</b> and <b>Requirements</b> tabs (certifications and how to renew them).
            You'll see what changes before anything is saved.
          </p>
          <p className="text-xs text-[#6B7A99]">
            Role wording: "FT Driver" / "PT Driver" → driver; "Backup Driver" → part-time, open shifts only (no bidding);
            "…, dispatch" → driver with dispatch access; "Gurney tech" → attendant; "Dispatch" → dispatcher; "Owner" / "Exec" / "Director" → admin.
            Status "Confirm" rows are skipped until they're Active or Former.
          </p>
          <Button fullWidth onClick={preview} disabled={busy}><RefreshCw size={16} /> {busy && !plan ? 'Reading the sheet…' : plan ? 'Read it again' : 'Preview changes'}</Button>
        </Card>
        {error && <Warning>{error}</Warning>}
        {done && <div className="rounded-xl bg-[#E8F5EE] text-[#2E7D52] px-3 py-2 text-sm font-medium">{done}</div>}

        {plan && (
          <>
            {plan.creates.length > 0 && (
              <>
                <SectionLabel>New in the app ({plan.creates.length})</SectionLabel>
                {plan.creates.map(p => (
                  <Card key={p.key}>
                    <p className="font-medium text-[#0B1A5C]">{p.name}</p>
                    <p className="text-xs text-[#6B7A99]">{p.roleText} · since {p.seniority_date ? formatDate(p.seniority_date) : 'no date'}{p.phone ? '' : ' · no phone yet'}</p>
                  </Card>
                ))}
              </>
            )}
            {plan.updates.length > 0 && (
              <>
                <SectionLabel>Changes ({plan.updates.length})</SectionLabel>
                {plan.updates.map(u => (
                  <Card key={u.employee.id}>
                    <p className="font-medium text-[#0B1A5C]">{u.employee.name}</p>
                    {u.changes.map(c => <p key={c} className="text-xs text-[#1B2E6B]">• {c}</p>)}
                  </Card>
                ))}
              </>
            )}
            {plan.unchanged.length > 0 && <p className="text-sm text-[#6B7A99] px-1">{plan.unchanged.length} already match the sheet.</p>}
            {issues.length > 0 && (
              <Warning tone="amber">{issues.flatMap(p => p.issues.map(i => <p key={p.key + i}><b>{p.name}:</b> {i}</p>))}</Warning>
            )}
            {plan.skipped.length > 0 && (
              <Card className="space-y-1">
                <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide">Not imported</p>
                {plan.skipped.map(s => <p key={s.name} className="text-xs text-[#1B2E6B]"><b>{s.name}:</b> {s.reason}</p>)}
              </Card>
            )}
            {due.length > 0 && (
              <Card className="space-y-1">
                <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide">Certifications (Due Dates tab)</p>
                <p className="text-sm text-[#1B2E6B]">{dueMatched.length} items · <b className="text-[#CC2A2A]">{dueOverdue} overdue</b> · {dueSoon} due within 60 days</p>
                {dueUnmatched.length > 0 && <p className="text-xs text-[#A82020]">Not matched to anyone (check spelling): {dueUnmatched.join(', ')}</p>}
              </Card>
            )}
            {plan.notInSheet.length > 0 && (
              <Card className="space-y-1">
                <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide">In the app but not in the sheet (left as is)</p>
                {plan.notInSheet.map(e => <p key={e.id} className="text-xs text-[#1B2E6B]">{e.name}</p>)}
              </Card>
            )}
            <Button fullWidth size="lg" onClick={apply} disabled={busy}>
              {busy ? 'Saving…' : plan.creates.length || plan.updates.length
                ? `Apply ${plan.creates.length + plan.updates.length} change${plan.creates.length + plan.updates.length === 1 ? '' : 's'} + certifications`
                : 'Update certifications'}
            </Button>
          </>
        )}
      </ScrollBody>
    </>
  )
}
