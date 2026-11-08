import { useEffect, useState } from 'react'
import { useData } from '../../lib/data-context'
import { addDays, todayISO } from '../../lib/scheduling'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Field, ScrollBody, Select, SubHeader, TextArea, TextInput, Toggle, Warning } from '../../components/ui/Form'
import { StatusPill } from '../../components/schedule/ShiftBits'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { TILE_ICONS, TileIcon, isAllowedUrl, isSetUp } from '../../components/tiles/Tiles'
import type { EmployeeRole, LinkTile, TileTap } from '../../types'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'

type Draft = Omit<LinkTile, 'id' | 'created_at'> & { id?: string }
const ROLES: { value: EmployeeRole; label: string }[] = [
  { value: 'driver', label: 'Drivers' }, { value: 'attendant', label: 'Attendants' },
  { value: 'dispatcher', label: 'Dispatch' }, { value: 'admin', label: 'Admins' },
]

export function AdminTiles({ onBack }: { onBack: () => void }) {
  const data = useData()
  const [editing, setEditing] = useState<LinkTile | 'new' | null>(null)
  const [taps, setTaps] = useState<TileTap[] | null>(null)
  const { loadTileTaps } = data

  useEffect(() => {
    let live = true
    loadTileTaps(`${addDays(todayISO(), -30)}T00:00:00Z`).then(t => { if (live) setTaps(t) }).catch(() => setTaps([]))
    return () => { live = false }
  }, [loadTileTaps, editing])

  if (editing) return <TileForm tile={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />

  const usage = (id: string) => {
    const mine = (taps ?? []).filter(t => t.tile_id === id)
    return { taps: mine.length, people: new Set(mine.map(t => t.employee_id)).size }
  }
  const missing = data.tiles.filter(t => t.active && !isSetUp(t)).length

  return (
    <>
      <SubHeader title="Linked tiles" onBack={onBack} />
      <ScrollBody>
        <p className="text-sm text-[#6B7A99] px-1">
          These are the links on everyone's Home screen. Tiles with a shift-card label also show as buttons on today's shift
          (for example "Clock in"). Tap counts show what people actually use.
        </p>
        {missing > 0 && <Warning tone="amber">{missing} tile{missing === 1 ? ' needs' : 's need'} a link. Until then, tapping {missing === 1 ? 'it' : 'them'} says "isn't set up yet".</Warning>}
        <Button fullWidth onClick={() => setEditing('new')}><Plus size={18} /> Add tile</Button>
        {data.tiles.map((t, i) => {
          const u = usage(t.id)
          return (
            <Card key={t.id} className={t.active ? '' : 'opacity-60'}>
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <button disabled={i === 0} onClick={() => data.moveTile(t.id, -1)} className="p-0.5 text-[#0B1A5C] disabled:opacity-20" aria-label={`Move ${t.name} up`}><ArrowUp size={15} /></button>
                  <button disabled={i === data.tiles.length - 1} onClick={() => data.moveTile(t.id, 1)} className="p-0.5 text-[#0B1A5C] disabled:opacity-20" aria-label={`Move ${t.name} down`}><ArrowDown size={15} /></button>
                </div>
                <button onClick={() => setEditing(t)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                  <div className="w-10 h-10 rounded-xl bg-[#EEF1F8] text-[#0B1A5C] flex items-center justify-center flex-shrink-0"><TileIcon tile={t} size={20} /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[#0B1A5C] truncate">{t.name}</p>
                    <p className="text-xs text-[#6B7A99]">
                      {t.roles_visible.length === 4 ? 'Everyone' : ROLES.filter(r => t.roles_visible.includes(r.value)).map(r => r.label).join(', ')}
                      {t.shift_label ? ` · shift card: "${t.shift_label}"` : ''}
                    </p>
                    <p className="text-xs text-[#6B7A99]">{taps === null ? '' : u.taps ? `${u.taps} tap${u.taps === 1 ? '' : 's'} by ${u.people} ${u.people === 1 ? 'person' : 'people'} in 30 days` : 'Not used in 30 days'}</p>
                  </div>
                </button>
                {!t.active ? <StatusPill>Hidden</StatusPill> : !isSetUp(t) ? <StatusPill tone="amber">Needs a link</StatusPill> : null}
              </div>
            </Card>
          )
        })}
      </ScrollBody>
    </>
  )
}

function TileForm({ tile, onDone }: { tile: LinkTile | null; onDone: () => void }) {
  const data = useData()
  const confirm = useConfirm()
  const [form, setForm] = useState<Draft>(() => tile
    ? (({ created_at: _c, ...rest }) => rest)(tile)
    : {
        name: '', icon: 'link', icon_url: null, url: '', fallback_url: null, roles_visible: ['driver', 'attendant', 'dispatcher', 'admin'],
        sort_order: (data.tiles.at(-1)?.sort_order ?? 0) + 10, help_text: null, shift_label: null, active: true,
      })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setForm(f => ({ ...f, [k]: v }))
  const toggleRole = (r: EmployeeRole, on: boolean) =>
    set('roles_visible', on ? [...new Set([...form.roles_visible, r])] : form.roles_visible.filter(x => x !== r))

  async function save() {
    if (!form.name.trim()) { setError('Give the tile a name.'); return }
    for (const [label, v] of [['Link', form.url], ['Fallback link', form.fallback_url], ['Icon image', form.icon_url]] as const) {
      if (v && v.trim() && !isAllowedUrl(v)) { setError(`${label} must start with https://, tel:, sms:, mailto: or an app link (like bambi://).`); return }
    }
    if (form.roles_visible.length === 0) { setError('Pick at least one group who sees it.'); return }
    setBusy(true); setError(null)
    try { await data.saveTile({ ...form, name: form.name.trim(), help_text: form.help_text?.trim() || null, shift_label: form.shift_label?.trim() || null }); onDone() }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save.'); setBusy(false) }
  }

  async function remove() {
    if (!tile || !(await confirm({ title: `Delete "${tile.name}"?`, body: 'To keep it but stop showing it, turn off "Show this tile" instead.', confirmLabel: 'Delete', danger: true }))) return
    try { await data.deleteTile(tile.id); onDone() } catch (err) { setError(err instanceof Error ? err.message : 'Could not delete.') }
  }

  return (
    <>
      <SubHeader title={tile ? tile.name : 'New tile'} onBack={onDone} />
      <ScrollBody>
        <Card className="space-y-4">
          <Field label="Name"><TextInput value={form.name} onChange={e => set('name', e.target.value)} placeholder="Time Clock (BBSI)" /></Field>
          <Field
            label="Link"
            hint={<>Web page (<b>https://…</b>), phone (<b>tel:+15305551234</b>), text (<b>sms:…</b>), or an app link. Leave empty until you have it — the tile shows "isn't set up yet".</>}
          >
            <TextInput value={form.url ?? ''} onChange={e => set('url', e.target.value)} placeholder="https://" inputMode="url" />
          </Field>
          <Field label="Fallback link (optional)" hint="Shown under the tile as “Didn't open? Try the website or app store”. Useful when the main link opens an app that may not be installed.">
            <TextInput value={form.fallback_url ?? ''} onChange={e => set('fallback_url', e.target.value || null)} placeholder="https://" inputMode="url" />
          </Field>
          <Field label="Sign-in help (optional)" hint="One short line under the tile.">
            <TextArea value={form.help_text ?? ''} onChange={e => set('help_text', e.target.value)} placeholder="Sign in with your Bambi driver login." />
          </Field>
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#EEF1F8] text-[#0B1A5C] flex items-center justify-center"><TileIcon tile={form} /></div>
            <div className="flex-1">
              <Field label="Icon">
                <Select value={form.icon} onChange={e => set('icon', e.target.value)}>
                  {Object.entries(TILE_ICONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </Select>
              </Field>
            </div>
          </div>
          <Field label="App icon image (optional)" hint="Link to the real app's icon image. If it doesn't load, the icon above is used.">
            <TextInput value={form.icon_url ?? ''} onChange={e => set('icon_url', e.target.value || null)} placeholder="https://…/icon.png" inputMode="url" />
          </Field>
          <Field label="Button on today's shift (optional)" hint='Short label, e.g. "Clock in" or "Today’s rides". Leave empty to show it only on Home.'>
            <TextInput value={form.shift_label ?? ''} onChange={e => set('shift_label', e.target.value)} maxLength={18} />
          </Field>
        </Card>

        <Card className="space-y-1">
          <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide pb-1">Who sees it</p>
          {ROLES.map(r => <Toggle key={r.value} label={r.label} checked={form.roles_visible.includes(r.value)} onChange={v => toggleRole(r.value, v)} />)}
          <div className="pt-2 border-t border-[#D8DFEF] mt-2"><Toggle label="Show this tile" checked={form.active} onChange={v => set('active', v)} /></div>
        </Card>

        {error && <Warning>{error}</Warning>}
        <Button fullWidth size="lg" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        {tile && <Button fullWidth variant="ghost" onClick={remove}><Trash2 size={16} /> Delete tile</Button>}
      </ScrollBody>
    </>
  )
}
