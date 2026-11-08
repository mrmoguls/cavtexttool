import { useState } from 'react'
import { useData } from '../../lib/data-context'
import { useAuth } from '../../lib/auth'
import { addDays, buildRoster, formatDate, mondayOf, rosterText, shiftTimeLabel, todayISO } from '../../lib/scheduling'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { ScrollBody, SubHeader, Warning } from '../../components/ui/Form'
import { StatusPill } from '../../components/schedule/ShiftBits'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { Check, ChevronLeft, ChevronRight, Copy } from 'lucide-react'

/** Open "update Bambi" items (for the dispatch banner). */
export function useBambiUpdates() {
  const data = useData()
  return data.bambiChanges.filter(c => !c.done_at && c.date >= addDays(todayISO(), -1))
}

export function BambiBanner({ onOpen }: { onOpen: () => void }) {
  const open = useBambiUpdates()
  if (!open.length) return null
  return (
    <button onClick={onOpen} className="no-print w-full text-left px-4 py-2.5 text-sm font-medium flex items-center gap-2 bg-[#0B1A5C] text-white border-t border-white/10">
      <span className="flex-1">Bambi needs {open.length} update{open.length === 1 ? '' : 's'}</span>
      <span className="underline underline-offset-2">See what changed</span>
    </button>
  )
}

/**
 * Weekly Bambi setup: the week's teams day by day (to clone into Bambi), a mark for "entered in
 * Bambi", and after that, every change to the week as a checklist of Bambi updates.
 */
export function BambiWeek({ onBack }: { onBack: () => void }) {
  const data = useData()
  const { me } = useAuth()
  const confirm = useConfirm()
  const today = todayISO()
  const [monday, setMonday] = useState(() => mondayOf(addDays(today, 7)))
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const entered = data.bambiWeeks.find(w => w.week_start === monday)
  const open = data.bambiChanges.filter(c => !c.done_at)
  const weekOpen = open.filter(c => c.date >= monday && c.date <= days[6])
  const otherOpen = open.filter(c => !(c.date >= monday && c.date <= days[6]) && c.date >= addDays(today, -1))
  const notGenerated = !data.generatedThrough || days[6] > data.generatedThrough

  async function copyDay(date: string) {
    const groups = buildRoster({ date, shifts: data.shifts, blocks: data.blocks, employees: data.employees, requirements: data.coverage })
    const text = rosterText(date, groups)
    try { await navigator.clipboard.writeText(text); setCopied(date); setTimeout(() => setCopied(null), 2000) }
    catch { setError('Copying is blocked here. Select the text on screen instead.') }
  }

  async function markEntered() {
    if (!(await confirm({
      title: `Mark ${formatDate(monday)} – ${formatDate(days[6])} as entered in Bambi?`,
      body: 'From now on, any change to this week (sick calls, trades, reassignments, start times) shows up as a Bambi update to make.',
      confirmLabel: 'Mark entered',
    }))) return
    try { await data.markWeekEntered(monday, me?.id ?? null) } catch (err) { setError(err instanceof Error ? err.message : 'Could not save.') }
  }

  const Change = ({ c }: { c: (typeof open)[number] }) => (
    <div className="flex items-start gap-2 py-1.5 border-t border-[#D8DFEF] first:border-t-0">
      <p className="flex-1 text-sm text-[#0B1A5C]">{c.summary}</p>
      <Button size="sm" variant="secondary" onClick={() => data.markBambiDone([c.id], me?.id ?? null)}><Check size={14} /> Done</Button>
    </div>
  )

  return (
    <>
      <SubHeader title="Bambi week" onBack={onBack} />
      <ScrollBody>
        {(weekOpen.length > 0 || otherOpen.length > 0) && (
          <Card className="space-y-1 border-2 border-[#0B1A5C]/30">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-[#0B1A5C]">Update in Bambi ({weekOpen.length + otherOpen.length})</p>
              <Button size="sm" variant="ghost" onClick={() => data.markBambiDone([...weekOpen, ...otherOpen].map(c => c.id), me?.id ?? null)}>All done</Button>
            </div>
            {[...otherOpen, ...weekOpen].map(c => <Change key={c.id} c={c} />)}
          </Card>
        )}

        <div className="flex items-center justify-between">
          <button onClick={() => setMonday(addDays(monday, -7))} className="p-2 rounded-lg hover:bg-white" aria-label="Previous week"><ChevronLeft size={18} /></button>
          <div className="text-center">
            <p className="font-semibold text-[#0B1A5C]">{formatDate(monday)} – {formatDate(days[6])}</p>
            {entered
              ? <StatusPill tone="green">Entered in Bambi {new Date(entered.entered_at).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric' })}</StatusPill>
              : <StatusPill tone="amber">Not entered in Bambi yet</StatusPill>}
          </div>
          <button onClick={() => setMonday(addDays(monday, 7))} className="p-2 rounded-lg hover:bg-white" aria-label="Next week"><ChevronRight size={18} /></button>
        </div>

        <p className="text-sm text-[#6B7A99] px-1">
          Set up each day in Bambi (clone a day and adjust). AM shifts use a standard start for the week; exact times are posted the night before.
          When the week is in Bambi, mark it entered — after that, every change to it is listed above as a Bambi update.
        </p>
        {notGenerated && <Warning tone="amber">This week isn't fully scheduled yet. Admin → Schedule → Generate shifts.</Warning>}
        {error && <Warning>{error}</Warning>}

        {days.map(date => {
          const groups = buildRoster({ date, shifts: data.shifts, blocks: data.blocks, employees: data.employees, requirements: data.coverage })
          return (
            <Card key={date} className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-[#0B1A5C]">{formatDate(date)}</p>
                {groups.length > 0 && (
                  <Button size="sm" variant="secondary" onClick={() => copyDay(date)}>{copied === date ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}</Button>
                )}
              </div>
              {groups.length === 0 && <p className="text-sm text-[#6B7A99]">Nobody scheduled.</p>}
              {groups.map(g => (
                <div key={g.block.id} className="rounded-xl bg-[#EEF1F8] px-3 py-2">
                  <p className="text-xs font-bold text-[#0B1A5C]">{g.block.code} · {g.block.name}</p>
                  {g.rows.map((r, i) => (
                    <p key={r.shift?.id ?? `${r.role}-${i}`} className={`text-sm ${r.uncovered ? 'text-[#CC2A2A] font-semibold' : 'text-[#1B2E6B]'}`}>
                      {r.role === 'attendant' ? 'Attendant' : 'Driver'}: {r.uncovered ? 'UNCOVERED' : r.name}
                      {r.shift && !r.uncovered && <span className="text-[#6B7A99]"> · {shiftTimeLabel(r.shift, g.block)}</span>}
                    </p>
                  ))}
                </div>
              ))}
            </Card>
          )
        })}

        {entered
          ? <Button fullWidth variant="ghost" onClick={() => data.unmarkWeek(monday)}>Undo "entered in Bambi" for this week</Button>
          : <Button fullWidth size="lg" onClick={markEntered}><Check size={18} /> This week is entered in Bambi</Button>}
      </ScrollBody>
    </>
  )
}
