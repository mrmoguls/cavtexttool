import { useMemo, useState } from 'react'
import { useData } from '../../lib/data-context'
import { useAuth } from '../../lib/auth'
import { bySeniority, DOW_LONG, dowOf, drivingBlockers, overtimeLimits, overtimeWarnings, todayISO, workProblem } from '../../lib/scheduling'
import { Button } from '../ui/Button'
import { Field, Select, TextArea, Warning } from '../ui/Form'
import type { Shift } from '../../types'

type Target = Pick<Shift, 'id' | 'date' | 'block_id' | 'role' | 'target_hours' | 'employee_id'>

/**
 * Pick who works a shift, with eligibility and California overtime checks.
 * Overtime is a warning: approving anyway needs a reason, which is saved with the change.
 */
export function AssignPicker({ shift, onSave, saveLabel = 'Assign', allowOpen = false }: {
  shift: Target
  onSave: (employeeId: string | null, opts: { warnings: string[]; overrideReason: string | null; note: string | null; by: string | null }) => Promise<void>
  saveLabel?: string
  /** Show "Leave open (post as open shift)" as a choice. */
  allowOpen?: boolean
}) {
  const data = useData()
  const { me } = useAuth()
  const [choice, setChoice] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const block = data.blocksById.get(shift.block_id)
  const limits = overtimeLimits(data.settings)

  const options = useMemo(() => {
    const crew = bySeniority(data.employees.filter(e => e.active && e.role === shift.role))
    return crew.map(e => {
      const problem = workProblem(e, shift, block, data.shifts)
      const warnings = overtimeWarnings({ employeeId: e.id, add: [shift], shifts: data.shifts, blocksById: data.blocksById, limits })
      // Availability from the schedule sheet (a warning for dispatch, not a block).
      const av = data.contacts.find(c => c.employee_id === e.id)?.availability
      if (av) {
        const v = Number(av[String(dowOf(shift.date))] ?? 0)
        if (v <= 0) warnings.unshift(`Marked not available on ${DOW_LONG[dowOf(shift.date)]}s in the schedule sheet.`)
        else if (v < 1) warnings.unshift(`Only partly available on ${DOW_LONG[dowOf(shift.date)]}s.`)
      }
      // Expired license / medical card (from the certifications sheet).
      if (shift.role === 'driver') {
        for (const i of drivingBlockers(data.complianceItems, e.id, todayISO())) {
          warnings.unshift(`${i.requirement} is expired${i.renewal_reported_at ? ' (they reported renewing it; confirm before assigning)' : ''}.`)
        }
      }
      if (data.timeOff.some(t => t.employee_id === e.id && t.status === 'approved' && t.start_date <= shift.date && t.end_date >= shift.date)) {
        warnings.unshift('On approved time off that day.')
      }
      return { e, problem, warnings }
    }).sort((a, b) =>
      Number(!!a.problem && a.problem !== 'Already working that day.') - Number(!!b.problem && b.problem !== 'Already working that day.') ||
      a.warnings.length - b.warnings.length)
  }, [data.employees, data.shifts, data.blocksById, data.contacts, data.complianceItems, data.timeOff, shift, block, limits])

  const chosen = options.find(o => o.e.id === choice)
  const blocked = chosen?.problem && chosen.problem !== 'Already working that day.'
  const warnings = chosen ? [...(chosen.problem === 'Already working that day.' ? ['Already working another shift that day.'] : []), ...chosen.warnings] : []

  async function save() {
    if (choice !== 'open' && !chosen) return
    if (warnings.length && !reason.trim()) { setError('Enter a reason to go ahead despite the warnings.'); return }
    setBusy(true)
    setError(null)
    try {
      await onSave(choice === 'open' ? null : choice, { warnings, overrideReason: reason.trim() || null, note: note.trim() || null, by: me?.id ?? null })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <Field label="Who works it">
        <Select value={choice} onChange={e => { setChoice(e.target.value); setError(null) }}>
          <option value="">Choose…</option>
          {allowOpen && <option value="open">Nobody yet — post as an open shift</option>}
          {options.map(({ e, problem, warnings }) => (
            <option key={e.id} value={e.id} disabled={e.id === shift.employee_id}>
              {e.name} · {e.employment_type}
              {problem && problem !== 'Already working that day.' ? ` · ${problem.replace(/\.$/, '')}` : problem ? ' · working that day' : ''}
              {!problem && warnings.length ? (/expired/.test(warnings[0]) ? ' · expired cert' : warnings[0].startsWith('On approved time off') ? ' · time off' : warnings[0].startsWith('Marked not') ? ' · unavailable' : ' · warning') : ''}
              {e.id === shift.employee_id ? ' · current' : ''}
            </option>
          ))}
        </Select>
      </Field>
      {blocked && <Warning>{chosen!.problem}</Warning>}
      {!blocked && warnings.length > 0 && (
        <>
          <Warning tone="amber">{warnings.map(w => <p key={w}>{w}</p>)}</Warning>
          <Field label="Reason to go ahead (saved with the change)">
            <TextArea value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. No one else available; approved by ops manager" />
          </Field>
        </>
      )}
      <Field label="Note to the driver (optional)">
        <TextArea value={note} onChange={e => setNote(e.target.value)} />
      </Field>
      {error && <Warning>{error}</Warning>}
      <Button fullWidth onClick={save} disabled={busy || !choice || !!blocked}>{busy ? 'Saving…' : saveLabel}</Button>
    </div>
  )
}
