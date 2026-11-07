import { useMemo, useState } from 'react'
import { useData, type LineDraft } from '../../lib/data-context'
import { useAuth } from '../../lib/auth'
import {
  addDays, assignmentConflicts, bySeniority, DISPLAY_WEEK, DOW_LONG, formatDate, isActiveOn,
  lineIneligibility, lineSummary, lineTargetHours, todayISO,
} from '../../lib/scheduling'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Field, ScrollBody, SectionLabel, Segmented, Select, SubHeader, TextInput, Toggle, Warning } from '../../components/ui/Form'
import type { Dow, Line, LineAssignment, LineDay } from '../../types'
import { Plus, Trash2, UserPlus, ArrowUpCircle } from 'lucide-react'

export function AdminLines({ onBack }: { onBack: () => void }) {
  const data = useData()
  const [editing, setEditing] = useState<Line | 'new' | null>(null)
  const today = todayISO()

  if (editing) {
    const fresh = editing === 'new' ? null : data.lines.find(l => l.id === editing.id) ?? null
    return <LineForm line={fresh} onDone={() => setEditing(null)} />
  }

  const groups = [
    { label: 'Core lines', list: data.lines.filter(l => l.active && l.category === 'core') },
    { label: 'Growth lines', list: data.lines.filter(l => l.active && l.category === 'growth') },
    { label: 'Inactive', list: data.lines.filter(l => !l.active) },
  ]

  return (
    <>
      <SubHeader title="Lines" onBack={onBack} />
      <ScrollBody>
        <p className="text-sm text-[#6B7A99] px-1">A line is a recurring weekly pattern of blocks. People bid on lines.</p>
        <Button fullWidth onClick={() => setEditing('new')}><Plus size={18} /> Add line</Button>
        {groups.filter(g => g.list.length).map(g => (
          <div key={g.label} className="space-y-2">
            <SectionLabel>{g.label}</SectionLabel>
            {g.list.map(line => {
              const days = data.lineDays.filter(d => d.line_id === line.id)
              const holders = data.assignments.filter(a => a.line_id === line.id && isActiveOn(a.effective_from, a.effective_to, today))
              const open = line.positions - holders.length
              return (
                <Card key={line.id} onClick={() => setEditing(line)} className={line.active ? '' : 'opacity-60'}>
                  <div className="flex items-start gap-3">
                    <span className="min-w-12 text-center px-2 py-1 rounded-lg bg-[#0B1A5C] text-white text-xs font-bold">{line.code}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[#0B1A5C]">{lineSummary(line, days, data.blocksById)}</p>
                      <p className="text-xs text-[#6B7A99]">
                        {line.is_flex ? 'Hours vary' : `${lineTargetHours(days, data.blocksById)} hrs/week target`}
                        {line.positions > 1 && ` · ${line.positions} positions`}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        <Badge variant="muted">{line.employment_type}</Badge>
                        <Badge variant="muted">{line.role === 'attendant' ? 'Attendant' : 'Driver'}</Badge>
                        {line.requires_gurney_qual && <Badge variant="sage">Gurney</Badge>}
                        {holders.map(h => <Badge key={h.id} variant="sage">{data.employeesById.get(h.employee_id)?.name ?? 'Unknown'}</Badge>)}
                        {open > 0 && line.active && <Badge>{open === 1 ? 'Open' : `${open} open`}</Badge>}
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

function LineForm({ line, onDone }: { line: Line | null; onDone: () => void }) {
  const data = useData()
  const [form, setForm] = useState<LineDraft>(() => line
    ? (({ converted_to_core_at: _c, created_at: _ca, ...rest }) => rest)(line)
    : {
        code: '', name: '', employment_type: 'PT', category: 'growth', role: 'driver', requires_gurney_qual: false,
        is_flex: false, positions: 1, active: true, notes: null, sort_order: (data.lines.at(-1)?.sort_order ?? 0) + 10,
      })
  const [days, setDays] = useState<Partial<Record<Dow, string>>>(() =>
    Object.fromEntries(data.lineDays.filter(d => d.line_id === line?.id).map(d => [d.dow, d.block_id])))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof LineDraft>(k: K, v: LineDraft[K]) => setForm(f => ({ ...f, [k]: v }))

  const roleBlocks = data.blocks.filter(b => b.active && b.crew_roles.includes(form.role))
  const draftDays: LineDay[] = Object.entries(days)
    .filter(([, blockId]) => !!blockId)
    .map(([dow, blockId]) => ({ id: dow, line_id: 'draft', dow: Number(dow) as Dow, block_id: blockId! }))
  const hours = lineTargetHours(draftDays, data.blocksById)
  const needsGurney = draftDays.some(d => form.role === 'driver' && data.blocksById.get(d.block_id)?.requires_gurney_qual)

  const warnings: string[] = []
  if (!form.is_flex && hours > 40) warnings.push(`${hours} hrs/week target is over 40 — weekly overtime.`)
  for (const d of draftDays) {
    const b = data.blocksById.get(d.block_id)
    if (b && Number(b.target_paid_hours) > 10) warnings.push(`${b.code} is over 10 hrs — second meal break required.`)
    else if (b && Number(b.target_paid_hours) > 8) warnings.push(`${b.code} is over 8 hrs — daily overtime.`)
  }
  if (form.employment_type === 'FT' && !form.is_flex && hours < 30) warnings.push(`Full-time line with only ${hours} hrs/week.`)
  if (needsGurney && !form.requires_gurney_qual) warnings.push('This line uses gurney blocks — turn on "Requires gurney qualification".')

  async function save() {
    const code = form.code.trim().toUpperCase()
    if (!code) { setError('Code is required.'); return }
    if (data.lines.some(l => l.code === code && l.id !== line?.id)) { setError(`Code ${code} is already used.`); return }
    if (!form.is_flex && draftDays.length === 0) { setError('Pick at least one day, or mark this as a flex line.'); return }
    const bad = draftDays.find(d => !data.blocksById.get(d.block_id)?.crew_roles.includes(form.role))
    if (bad) { setError(`${data.blocksById.get(bad.block_id)?.code} has no ${form.role} position.`); return }
    setSaving(true)
    setError(null)
    try {
      await data.saveLine(
        { ...form, code, name: form.name.trim(), positions: Math.max(1, Math.floor(form.positions || 1)) },
        draftDays.map(d => ({ dow: d.dow, block_id: d.block_id })),
      )
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
      setSaving(false)
    }
  }

  async function convertToCore() {
    if (!line || !confirm(`Convert ${line.code} to a core line? It will be included in the next quarterly bid.`)) return
    try {
      await data.convertLineToCore(line.id)
      setForm(f => ({ ...f, category: 'core' }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Convert failed.')
    }
  }

  async function remove() {
    if (!line || !confirm(`Delete line ${line.code}?`)) return
    try {
      await data.deleteLine(line.id)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  return (
    <>
      <SubHeader title={line ? `Line ${line.code}` : 'New line'} onBack={onDone} />
      <ScrollBody>
        <Card className="space-y-4">
          <div className="grid grid-cols-[6rem_1fr] gap-3">
            <Field label="Code"><TextInput value={form.code} onChange={e => set('code', e.target.value.toUpperCase())} placeholder="PT5" maxLength={8} /></Field>
            <Field label="Name"><TextInput value={form.name} onChange={e => set('name', e.target.value)} placeholder="Optional label" /></Field>
          </div>
          <Field label="Type" group>
            <Segmented value={form.employment_type} options={[{ value: 'FT', label: 'Full-time' }, { value: 'PT', label: 'Part-time' }]} onChange={v => set('employment_type', v)} />
          </Field>
          <Field label="Role" group>
            <Segmented value={form.role} options={[{ value: 'driver', label: 'Driver' }, { value: 'attendant', label: 'Attendant' }]} onChange={v => { set('role', v); setDays({}) }} />
          </Field>
          <Field label="Category" group hint={form.category === 'core' ? 'Facility-backed, stable for the quarter.' : 'Extra crew, added or removed monthly as we grow.'}>
            {line && line.category === 'growth'
              ? <div className="flex items-center gap-2"><Badge>Growth</Badge>
                  <Button size="sm" variant="secondary" onClick={convertToCore}><ArrowUpCircle size={14} /> Convert to core</Button></div>
              : line ? <Badge variant="sage">Core</Badge>
              : <Segmented value={form.category} options={[{ value: 'core', label: 'Core' }, { value: 'growth', label: 'Growth' }]} onChange={v => set('category', v)} />}
          </Field>
          <Toggle label="Requires gurney qualification" checked={form.requires_gurney_qual} onChange={v => set('requires_gurney_qual', v)} />
          <Toggle label="Flex line" checked={form.is_flex} onChange={v => set('is_flex', v)} hint="No fixed blocks — on-call and fill-ins." />
          <Field label="Positions" hint="How many people can hold this line.">
            <TextInput type="number" inputMode="numeric" min={1} value={form.positions} onChange={e => set('positions', Number(e.target.value))} />
          </Field>
        </Card>

        {!form.is_flex && (
          <Card className="space-y-3">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide">Weekly pattern</p>
              <p className="text-sm font-semibold text-[#0B1A5C]">{hours} hrs/week</p>
            </div>
            {DISPLAY_WEEK.map(dow => (
              <div key={dow} className="grid grid-cols-[6.5rem_1fr] items-center gap-3">
                <span className="text-sm text-[#1B2E6B]">{DOW_LONG[dow]}</span>
                <Select value={days[dow] ?? ''} onChange={e => setDays(d => ({ ...d, [dow]: e.target.value || undefined }))}>
                  <option value="">Off</option>
                  {roleBlocks.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name} ({Number(b.target_paid_hours)}h)</option>)}
                </Select>
              </div>
            ))}
            <p className="text-sm text-[#6B7A99]">{lineSummary(form, draftDays, data.blocksById)}</p>
          </Card>
        )}

        {warnings.map(w => <Warning key={w} tone="amber">{w}</Warning>)}

        <Card className="space-y-3">
          <Toggle label="Active" checked={form.active} onChange={v => set('active', v)} hint="Inactive lines aren't offered or scheduled." />
          <Field label="Notes">
            <TextInput value={form.notes ?? ''} onChange={e => set('notes', e.target.value || null)} placeholder="Optional" />
          </Field>
        </Card>

        {error && <Warning>{error}</Warning>}
        <Button fullWidth size="lg" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save line'}</Button>

        {line && <LineHolders line={line} />}

        {line && !data.assignments.some(a => a.line_id === line.id) && (
          <Button fullWidth variant="ghost" onClick={remove}><Trash2 size={16} /> Delete line</Button>
        )}
      </ScrollBody>
    </>
  )
}

function LineHolders({ line }: { line: Line }) {
  const data = useData()
  const { me } = useAuth()
  const today = todayISO()
  const [adding, setAdding] = useState(false)
  const [employeeId, setEmployeeId] = useState('')
  const [from, setFrom] = useState(today)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const history = data.assignments
    .filter(a => a.line_id === line.id)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))
  const current = history.filter(a => a.effective_to === null || a.effective_to >= today)
  const past = history.filter(a => a.effective_to !== null && a.effective_to < today)

  const candidates = useMemo(() => {
    const crew = data.employees.filter(e => e.active && (e.role === 'driver' || e.role === 'attendant'))
    return bySeniority(crew).map(e => {
      const reasons = lineIneligibility(e, line)
      const holding = data.assignments.find(a => a.employee_id === e.id && isActiveOn(a.effective_from, a.effective_to, today))
      return { e, reasons, holding: holding ? data.lines.find(l => l.id === holding.line_id)?.code : undefined }
    }).sort((a, b) => Number(a.reasons.length > 0) - Number(b.reasons.length > 0))
  }, [data.employees, data.assignments, data.lines, line, today])

  const chosen = candidates.find(c => c.e.id === employeeId)
  const conflicts = chosen
    ? assignmentConflicts({ line_id: line.id, employee_id: chosen.e.id, effective_from: from, effective_to: null }, line, data.assignments)
    : []

  async function assign() {
    if (!chosen) return
    if (chosen.reasons.length && !confirm(`${chosen.e.name} isn't eligible for ${line.code}:\n${chosen.reasons.join('\n')}\n\nAssign anyway?`)) return
    setBusy(true)
    setError(null)
    try {
      await data.assignLine({ line_id: line.id, employee_id: chosen.e.id, effective_from: from, effective_to: null }, me?.id ?? null)
      setAdding(false)
      setEmployeeId('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assign failed.')
    } finally {
      setBusy(false)
    }
  }

  async function end(a: LineAssignment) {
    const name = data.employeesById.get(a.employee_id)?.name ?? 'this person'
    const last = prompt(`Last day ${name} holds ${line.code} (YYYY-MM-DD):`, addDays(today, -1))
    if (!last) return
    if (!/^\d{4}-\d{2}-\d{2}$/.test(last) || last < a.effective_from) { alert('Enter a date on or after the start date.'); return }
    try { await data.endAssignment(a.id, last) } catch (err) { setError(err instanceof Error ? err.message : 'Update failed.') }
  }

  async function undo(a: LineAssignment) {
    if (!confirm('Remove this assignment entirely? Use only to fix a mistake — it stays in the audit log.')) return
    try { await data.deleteAssignment(a.id) } catch (err) { setError(err instanceof Error ? err.message : 'Delete failed.') }
  }

  return (
    <Card className="space-y-3">
      <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide">Who holds this line</p>
      {current.length === 0 && <p className="text-sm text-[#CC2A2A] font-medium">Nobody — this line is open.</p>}
      {current.map(a => (
        <div key={a.id} className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[#0B1A5C]">{data.employeesById.get(a.employee_id)?.name ?? 'Unknown'}</p>
            <p className="text-xs text-[#6B7A99]">
              From {formatDate(a.effective_from)}{a.effective_to ? ` to ${formatDate(a.effective_to)}` : ''} · {a.source}
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => end(a)}>End</Button>
          <button onClick={() => undo(a)} className="p-1.5 rounded-lg text-[#6B7A99] hover:text-red-500 hover:bg-red-50" aria-label="Remove assignment">
            <Trash2 size={15} />
          </button>
        </div>
      ))}

      {adding ? (
        <div className="space-y-3 pt-2 border-t border-[#D8DFEF]">
          <Field label="Person (by seniority)">
            <Select value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
              <option value="">Choose…</option>
              {candidates.map(({ e, reasons, holding }) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {e.employment_type}{holding ? ` · holds ${holding}` : ''}{reasons.length ? ' · not eligible' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Starting"><TextInput type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field>
          {chosen?.reasons.length ? <Warning tone="amber">{chosen.reasons.map(r => <p key={r}>{r}</p>)}</Warning> : null}
          {conflicts.length > 0 && <Warning>{conflicts.map(r => <p key={r}>{r}</p>)}</Warning>}
          <div className="flex gap-2">
            <Button className="flex-1" onClick={assign} disabled={!chosen || !from || conflicts.length > 0 || busy}>Assign</Button>
            <Button variant="secondary" onClick={() => { setAdding(false); setError(null) }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button fullWidth variant="secondary" onClick={() => setAdding(true)}><UserPlus size={16} /> Assign someone</Button>
      )}
      {error && <Warning>{error}</Warning>}

      {past.length > 0 && (
        <div className="pt-2 border-t border-[#D8DFEF] space-y-1">
          <p className="text-xs text-[#6B7A99]">Past holders</p>
          {past.map(a => (
            <p key={a.id} className="text-xs text-[#6B7A99]">
              {data.employeesById.get(a.employee_id)?.name ?? 'Unknown'} · {formatDate(a.effective_from)} – {formatDate(a.effective_to!)}
            </p>
          ))}
        </div>
      )}
    </Card>
  )
}
