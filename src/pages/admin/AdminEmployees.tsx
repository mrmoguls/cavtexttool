import { useMemo, useState } from 'react'
import { useData, type EmployeeDraft } from '../../lib/data-context'
import { useAuth } from '../../lib/auth'
import { bySeniority, formatDate, isActiveOn, todayISO } from '../../lib/scheduling'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Field, ScrollBody, SectionLabel, Segmented, SubHeader, TextInput, Toggle, Warning } from '../../components/ui/Form'
import type { Employee, EmployeeRole } from '../../types'
import { UserPlus } from 'lucide-react'

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
        <Button fullWidth onClick={() => setEditing('new')}>
          <UserPlus size={18} /> Add employee
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
        <Card className="space-y-4">
          <Field label="Name">
            <TextInput value={form.name} onChange={e => set('name', e.target.value)} placeholder="Full name" />
          </Field>
          <Field label="Role" group>
            <Segmented value={form.role} options={ROLE_OPTIONS} onChange={v => set('role', v)} />
          </Field>
          <Field label="Employment" group>
            <Segmented value={form.employment_type} options={[{ value: 'FT', label: 'Full-time' }, { value: 'PT', label: 'Part-time' }]} onChange={v => set('employment_type', v)} />
          </Field>
          <Field
            label="Phone"
            hint={pin ? <>Sign-in PIN: <b className="text-[#0B1A5C]">{pin}</b> (last 4 digits)</> : 'Needed to sign in — the PIN is the last 4 digits.'}
          >
            <TextInput type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(530) 555-1234" />
          </Field>
        </Card>

        <Card className="space-y-4">
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
          <Toggle label="Gurney qualified" checked={form.gurney_qualified} onChange={v => set('gurney_qualified', v)} hint="Can drive gurney lines and shifts." />
          <Toggle label="Active" checked={form.active} onChange={v => set('active', v)} hint="Inactive people can't sign in and aren't scheduled." />
        </Card>

        {error && <Warning>{error}</Warning>}
        <Button fullWidth size="lg" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </ScrollBody>
    </>
  )
}
