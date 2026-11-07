import { useState } from 'react'
import { useData, type BlockDraft } from '../../lib/data-context'
import { blockInstructions, blockTimeLabel, crewLabel, toHHMM } from '../../lib/scheduling'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Field, ScrollBody, Segmented, SubHeader, TextInput, Toggle, Warning } from '../../components/ui/Form'
import type { Block, CrewRole, TimeRule } from '../../types'
import { Plus, Trash2 } from 'lucide-react'

export function AdminBlocks({ onBack }: { onBack: () => void }) {
  const data = useData()
  const [editing, setEditing] = useState<Block | 'new' | null>(null)

  if (editing) return <BlockForm block={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />

  return (
    <>
      <SubHeader title="Blocks" onBack={onBack} />
      <ScrollBody>
        <p className="text-sm text-[#6B7A99] px-1">A block is a type of daily shift. Lines are built from blocks.</p>
        <Button fullWidth onClick={() => setEditing('new')}><Plus size={18} /> Add block</Button>
        {data.blocks.map(b => (
          <Card key={b.id} onClick={() => setEditing(b)} className={b.active ? '' : 'opacity-60'}>
            <div className="flex items-start gap-3">
              <span className="min-w-12 text-center px-2 py-1 rounded-lg bg-[#0B1A5C] text-white text-xs font-bold">{b.code}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[#0B1A5C]">{b.name}</p>
                <p className="text-sm text-[#6B7A99]">{blockTimeLabel(b)}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  <Badge variant="muted">{Number(b.target_paid_hours)} hrs target</Badge>
                  <Badge variant="muted">{crewLabel(b)}</Badge>
                  {b.requires_gurney_qual && <Badge variant="sage">Gurney</Badge>}
                  {!b.active && <Badge>Inactive</Badge>}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </ScrollBody>
    </>
  )
}

function BlockForm({ block, onDone }: { block: Block | null; onDone: () => void }) {
  const data = useData()
  const [form, setForm] = useState<BlockDraft>(() => block
    ? { ...block, default_start: toHHMM(block.default_start) || null, default_end: toHHMM(block.default_end) || null, target_paid_hours: Number(block.target_paid_hours) }
    : {
        code: '', name: '', crew_roles: ['driver'], start_type: 'fixed', end_type: 'fixed',
        default_start: '08:00', default_end: '16:30', target_paid_hours: 8, requires_gurney_qual: false,
        start_rule_note: null, end_rule_note: null, active: true, sort_order: (data.blocks.at(-1)?.sort_order ?? 0) + 10,
      })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof BlockDraft>(k: K, v: BlockDraft[K]) => setForm(f => ({ ...f, [k]: v }))

  const usedBy = block ? data.lines.filter(l => data.lineDays.some(d => d.line_id === l.id && d.block_id === block.id)) : []

  function toggleCrew(role: CrewRole, on: boolean) {
    const next = on ? [...new Set([...form.crew_roles, role])] : form.crew_roles.filter(r => r !== role)
    set('crew_roles', next.length ? (['driver', 'attendant'] as CrewRole[]).filter(r => next.includes(r)) : form.crew_roles)
  }

  const preview = { ...form, id: block?.id ?? 'new' } as Block
  const hours = Number(form.target_paid_hours)
  const warnings: string[] = []
  if (hours > 10) warnings.push('Over 10 hours — a second meal break is required.')
  else if (hours > 8) warnings.push('Over 8 hours — daily overtime in California.')

  async function save() {
    const code = form.code.trim().toUpperCase()
    if (!code || !form.name.trim()) { setError('Code and name are required.'); return }
    if (data.blocks.some(b => b.code === code && b.id !== block?.id)) { setError(`Code ${code} is already used.`); return }
    if (!(hours > 0 && hours <= 16)) { setError('Target hours must be between 0 and 16.'); return }
    if (form.start_type === 'fixed' && !form.default_start) { setError('Fixed start needs a start time.'); return }
    if (form.end_type === 'fixed' && !form.default_end) { setError('Fixed end needs an end time.'); return }
    setSaving(true)
    setError(null)
    try {
      await data.saveBlock({
        ...form, code, name: form.name.trim(), target_paid_hours: hours,
        default_start: form.start_type === 'fixed' ? form.default_start : null,
        default_end: form.end_type === 'fixed' ? form.default_end : null,
        start_rule_note: form.start_type === 'variable' ? (form.start_rule_note?.trim() || null) : null,
        end_rule_note: form.end_type === 'variable' ? (form.end_rule_note?.trim() || null) : null,
      })
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
      setSaving(false)
    }
  }

  async function remove() {
    if (!block || !confirm(`Delete block ${block.code}?`)) return
    try {
      await data.deleteBlock(block.id)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  const ruleOptions: { value: TimeRule; label: string }[] = [{ value: 'fixed', label: 'Fixed time' }, { value: 'variable', label: 'Variable' }]

  return (
    <>
      <SubHeader title={block ? `Block ${block.code}` : 'New block'} onBack={onDone} />
      <ScrollBody>
        <Card className="space-y-4">
          <div className="grid grid-cols-[6rem_1fr] gap-3">
            <Field label="Code"><TextInput value={form.code} onChange={e => set('code', e.target.value.toUpperCase())} placeholder="AM" maxLength={8} /></Field>
            <Field label="Name"><TextInput value={form.name} onChange={e => set('name', e.target.value)} placeholder="Early" /></Field>
          </div>
          <Field label="Crew" group>
            <div className="space-y-1">
              <Toggle label="Driver" checked={form.crew_roles.includes('driver')} onChange={v => toggleCrew('driver', v)} />
              <Toggle label="Attendant" checked={form.crew_roles.includes('attendant')} onChange={v => toggleCrew('attendant', v)} hint="Gurney crews ride with an attendant." />
            </div>
          </Field>
          <Toggle label="Driver needs gurney qualification" checked={form.requires_gurney_qual} onChange={v => set('requires_gurney_qual', v)} />
        </Card>

        <Card className="space-y-4">
          <Field label="Start" group>
            <Segmented value={form.start_type} options={ruleOptions} onChange={v => set('start_type', v)} />
          </Field>
          {form.start_type === 'fixed'
            ? <TextInput type="time" value={form.default_start ?? ''} onChange={e => set('default_start', e.target.value || null)} />
            : <Field label="Report…" hint='Shown as "Report ___." Dispatch posts the actual time the day before.'>
                <TextInput value={form.start_rule_note ?? ''} onChange={e => set('start_rule_note', e.target.value)} placeholder="30 minutes before your first scheduled pickup" />
              </Field>}
          <Field label="End" group>
            <Segmented value={form.end_type} options={ruleOptions} onChange={v => set('end_type', v)} />
          </Field>
          {form.end_type === 'fixed'
            ? <TextInput type="time" value={form.default_end ?? ''} onChange={e => set('default_end', e.target.value || null)} />
            : <Field label="Ends at"><TextInput value={form.end_rule_note ?? ''} onChange={e => set('end_rule_note', e.target.value)} placeholder="last scheduled drop-off" /></Field>}
          <Field label="Target paid hours">
            <TextInput type="number" inputMode="decimal" step={0.25} min={0.25} max={16} value={form.target_paid_hours} onChange={e => set('target_paid_hours', e.target.value === '' ? 0 : Number(e.target.value))} />
          </Field>
          {warnings.map(w => <Warning key={w} tone="amber">{w}</Warning>)}
          <Toggle label="Active" checked={form.active} onChange={v => set('active', v)} />
        </Card>

        <Card className="space-y-2">
          <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide">What drivers will see</p>
          <p className="text-sm font-semibold text-[#0B1A5C]">{blockTimeLabel(preview)} · {hours || 0} hrs target</p>
          {blockInstructions(preview).map(line => <p key={line} className="text-sm text-[#1B2E6B]">{line}</p>)}
        </Card>

        {usedBy.length > 0 && <p className="text-xs text-[#6B7A99] px-1">Used by lines: {usedBy.map(l => l.code).join(', ')}</p>}
        {error && <Warning>{error}</Warning>}
        <Button fullWidth size="lg" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        {block && usedBy.length === 0 && (
          <Button fullWidth variant="ghost" onClick={remove}><Trash2 size={16} /> Delete block</Button>
        )}
      </ScrollBody>
    </>
  )
}
