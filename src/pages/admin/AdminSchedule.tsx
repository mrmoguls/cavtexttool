import { useState } from 'react'
import { useData } from '../../lib/data-context'
import { useAuth } from '../../lib/auth'
import { addDays, formatDate, todayISO } from '../../lib/scheduling'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Field, ScrollBody, SubHeader, TextInput, Toggle, Warning } from '../../components/ui/Form'
import { CheckCircle } from 'lucide-react'

export function AdminSchedule({ onBack }: { onBack: () => void }) {
  const data = useData()
  const { me } = useAuth()
  const today = todayISO()
  const through = data.generatedThrough
  const defaultFrom = through && through >= today ? addDays(through, 1) : today
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(addDays(defaultFrom, 27))
  const [rebuild, setRebuild] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const r = await data.generateSchedule(from, to, { rebuild, createdBy: me?.id ?? null })
      setResult(rebuild
        ? `Rebuilt ${formatDate(from)} – ${formatDate(to)}: removed ${r.removed}, added ${r.added} shifts.`
        : `Added ${r.added} shift${r.added === 1 ? '' : 's'} for ${formatDate(from)} – ${formatDate(to)}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate shifts.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SubHeader title="Schedule" onBack={onBack} />
      <ScrollBody>
        <Card className="space-y-1">
          <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide">Scheduled through</p>
          <p className="text-lg font-bold text-[#0B1A5C]">{through ? formatDate(through) : 'Not generated yet'}</p>
          <p className="text-sm text-[#6B7A99]">
            Shifts come from who holds each line. When you assign someone a line, their shifts are added up to this date automatically.
          </p>
        </Card>

        <Card className="space-y-4">
          <p className="font-semibold text-[#0B1A5C]">Generate shifts</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From"><TextInput type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field>
            <Field label="Through"><TextInput type="date" value={to} onChange={e => setTo(e.target.value)} /></Field>
          </div>
          <Toggle
            label="Rebuild from lines"
            checked={rebuild}
            onChange={setRebuild}
            hint="Use after changing a line's days or a block's times. Replaces line shifts in this range, but keeps any with a posted start time."
          />
          {rebuild && <Warning tone="amber">Rebuilding replaces existing line shifts in this date range.</Warning>}
          {error && <Warning>{error}</Warning>}
          {result && (
            <div className="flex items-center gap-2 rounded-xl bg-[#E8F5EE] text-[#2E7D52] px-3 py-2 text-sm font-medium">
              <CheckCircle size={16} /> {result}
            </div>
          )}
          <Button fullWidth onClick={run} disabled={busy || !from || !to}>{busy ? 'Working…' : rebuild ? 'Rebuild shifts' : 'Generate shifts'}</Button>
        </Card>
      </ScrollBody>
    </>
  )
}
