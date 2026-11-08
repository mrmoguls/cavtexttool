import { useMemo, useState } from 'react'
import { useData } from '../../lib/data-context'
import {
  addDays, AVAILABILITY_COLUMNS, datedShifts, formatDate, mondayOf, SHIFT_COLUMNS, toCsv, todayISO, weeklyAvailability, weeklyGrid,
  type ExportOptions,
} from '../../lib/scheduling'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Field, ScrollBody, Segmented, SubHeader, TextInput, Warning } from '../../components/ui/Form'
import { FileSpreadsheet, FileText } from 'lucide-react'

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** Export driver availability / shifts as Excel or CSV (e.g. to load into Bambi). */
export function ScheduleExport({ onBack }: { onBack: () => void }) {
  const data = useData()
  const today = todayISO()
  const variableBlocks = data.blocks.filter(b => b.active && b.start_type === 'variable')
  const [asOf, setAsOf] = useState(today)
  const [from, setFrom] = useState(mondayOf(addDays(today, 7)))
  const [to, setTo] = useState(addDays(mondayOf(addDays(today, 7)), 13))
  const [timeFormat, setTimeFormat] = useState<ExportOptions['timeFormat']>('24h')
  const [varStart, setVarStart] = useState<Record<string, string>>(() => Object.fromEntries(variableBlocks.map(b => [b.id, '06:00'])))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const weekly = useMemo(() => weeklyAvailability({
    asOf, employees: data.employees, contacts: data.contacts, lines: data.lines, lineDays: data.lineDays, blocks: data.blocks,
    assignments: data.assignments, options: { variableStart: varStart, timeFormat },
  }), [asOf, data.employees, data.contacts, data.lines, data.lineDays, data.blocks, data.assignments, varStart, timeFormat])
  const dated = useMemo(() => datedShifts({
    from, to, shifts: data.shifts, employees: data.employees, contacts: data.contacts, lines: data.lines, blocks: data.blocks,
    options: { variableStart: varStart, timeFormat },
  }), [from, to, data.shifts, data.employees, data.contacts, data.lines, data.blocks, varStart, timeFormat])
  const grid = weeklyGrid(weekly)
  const datedIncomplete = from < addDays(today, -14) || (!!data.generatedThrough && to > data.generatedThrough)

  async function excel() {
    setBusy(true); setError(null)
    try {
      const { default: writeExcelFile } = await import('write-excel-file/browser')
      const bold = (v: string) => ({ value: v, fontWeight: 'bold' as const })
      const sheet = <T,>(rows: T[], cols: { key: keyof T; header: string }[]) =>
        [cols.map(c => bold(c.header)), ...rows.map(r => cols.map(c => ({ value: r[c.key] as unknown as string | number })))]
      const blob = await writeExcelFile([
        { data: sheet(weekly, AVAILABILITY_COLUMNS), sheet: 'Weekly availability', stickyRowsCount: 1, columns: AVAILABILITY_COLUMNS.map(() => ({ width: 16 })) },
        { data: sheet(dated, SHIFT_COLUMNS), sheet: 'Dated shifts', stickyRowsCount: 1, columns: SHIFT_COLUMNS.map(() => ({ width: 15 })) },
        {
          data: [
            [bold('Driver'), bold('Phone'), bold('Line'), ...DAYS.map(bold)],
            ...grid.map(g => [{ value: g.name }, { value: g.phone }, { value: g.line }, ...DAYS.map(d => ({ value: g.days[d] ?? '' }))]),
            [],
            [{ value: '* End time estimated: start + target hours + 30 min meal. Actual end depends on the day\'s trips.' }],
          ],
          sheet: 'Week at a glance', stickyRowsCount: 1, columns: [{ width: 22 }, { width: 15 }, { width: 8 }, ...DAYS.map(() => ({ width: 15 }))],
        },
      // The library's cell typing is stricter than our simple text/number cells.
      ] as never).toBlob()
      download(blob, `care-a-van-schedule-${today}.xlsx`)
    } catch (err) {
      setError(err instanceof Error ? `Couldn't create the Excel file: ${err.message}` : "Couldn't create the Excel file.")
    } finally { setBusy(false) }
  }

  const csv = (kind: 'weekly' | 'dated') => download(
    new Blob([kind === 'weekly' ? toCsv(weekly, AVAILABILITY_COLUMNS) : toCsv(dated, SHIFT_COLUMNS)], { type: 'text/csv;charset=utf-8' }),
    kind === 'weekly' ? `driver-availability-${asOf}.csv` : `driver-shifts-${from}-to-${to}.csv`,
  )

  return (
    <>
      <SubHeader title="Export schedule" onBack={onBack} />
      <ScrollBody>
        <Card className="space-y-2">
          <p className="text-sm text-[#1B2E6B]">
            Download driver availability to load into Bambi (or anything else). Bambi's developer API doesn't accept availability,
            so use Bambi's import screen if it has one, or send the file to Bambi support.
          </p>
          <p className="text-xs text-[#6B7A99]">If Bambi's template uses different column names or a different layout, send it over and the export can match it exactly.</p>
        </Card>

        <Card className="space-y-4">
          <p className="font-semibold text-[#0B1A5C]">Settings</p>
          <Field label="Time format" group>
            <Segmented value={timeFormat} options={[{ value: '24h', label: '13:00' }, { value: '12h', label: '1:00 PM' }]} onChange={setTimeFormat} />
          </Field>
          {variableBlocks.map(b => (
            <Field key={b.id} label={`Typical ${b.code} start (it varies by day)`} hint="Used for the export only. Daily start times are still posted the day before.">
              <TextInput type="time" value={varStart[b.id] ?? '06:00'} onChange={e => setVarStart(v => ({ ...v, [b.id]: e.target.value || '06:00' }))} />
            </Field>
          ))}
          <p className="text-xs text-[#6B7A99]">Where a shift ends at the last drop-off, the end time is estimated as start + target hours + a 30-minute meal, and marked "estimated".</p>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center gap-2"><FileText size={18} className="text-[#0B1A5C]" /><p className="font-semibold text-[#0B1A5C]">Weekly availability</p></div>
          <p className="text-sm text-[#6B7A99]">One row per driver per working day, from who holds which line. Best for setting up recurring availability.</p>
          <Field label="Lines held as of"><TextInput type="date" value={asOf} onChange={e => setAsOf(e.target.value || today)} /></Field>
          <p className="text-sm text-[#1B2E6B]">{weekly.length} rows · {grid.length} people</p>
          {grid.length > 0 && (
            <div className="overflow-x-auto -mx-1">
              <table className="text-xs text-left text-[#1B2E6B] min-w-full">
                <thead><tr className="text-[#6B7A99]"><th className="pr-2 py-1">Driver</th>{DAYS.map(d => <th key={d} className="px-1 py-1">{d.slice(0, 3)}</th>)}</tr></thead>
                <tbody>
                  {grid.map(g => (
                    <tr key={g.name} className="border-t border-[#D8DFEF]">
                      <td className="pr-2 py-1 whitespace-nowrap font-medium">{g.name}</td>
                      {DAYS.map(d => <td key={d} className="px-1 py-1 whitespace-nowrap tabular-nums">{g.days[d] ?? '—'}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Button size="sm" variant="secondary" onClick={() => csv('weekly')} disabled={!weekly.length}>Download CSV</Button>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center gap-2"><FileText size={18} className="text-[#0B1A5C]" /><p className="font-semibold text-[#0B1A5C]">Dated shifts</p></div>
          <p className="text-sm text-[#6B7A99]">Every scheduled shift in a date range, including trades, pickups and one-off shifts.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From"><TextInput type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field>
            <Field label="Through"><TextInput type="date" value={to} onChange={e => setTo(e.target.value)} /></Field>
          </div>
          <p className="text-sm text-[#1B2E6B]">{dated.length} shifts · {formatDate(from)} – {formatDate(to)}</p>
          {datedIncomplete && <Warning tone="amber">Part of this range isn't loaded or scheduled yet{data.generatedThrough ? ` (scheduled through ${formatDate(data.generatedThrough)})` : ''}, so it may be incomplete.</Warning>}
          <Button size="sm" variant="secondary" onClick={() => csv('dated')} disabled={!dated.length}>Download CSV</Button>
        </Card>

        {error && <Warning>{error}</Warning>}
        <Button fullWidth size="lg" onClick={excel} disabled={busy || (!weekly.length && !dated.length)}>
          <FileSpreadsheet size={18} /> {busy ? 'Creating…' : 'Download Excel (all three sheets)'}
        </Button>
        <p className="text-xs text-[#6B7A99] px-1">The Excel file has three sheets: Weekly availability, Dated shifts, and Week at a glance.</p>
      </ScrollBody>
    </>
  )
}
