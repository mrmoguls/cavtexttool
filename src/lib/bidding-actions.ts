// Bidding actions (and applying the Google Sheet sync).
// Employees save rankings through the submit_bids database function (demo: the mirror below).
// Admin steps run here with admin write access in both modes.
import { db } from './db'
import { isDemoMode, supabase } from './supabase'
import { demoStore } from './demo-store'
import { DEMO_SHEET } from './demo-sheet'
import type { SheetValues, SyncPlan } from './sheet-sync'
import {
  addDays, autoAssign, formatDate, generateShifts, isBidder, lineBidProblems, rangesOverlap, todayISO,
} from './scheduling'
import type {
  Bid, BidOptin, BidPeriod, BidPeriodLine, BidResult, Block, Employee, EmployeeContact, Line, LineAssignment, LineDay, Shift,
} from '../types'

const now = () => new Date().toISOString()

async function getPeriod(id: string): Promise<BidPeriod> {
  const [p] = await db.select<BidPeriod>('bid_periods', { eq: { id } })
  if (!p) throw new Error('Bid period not found.')
  return p
}

async function periodLines(periodId: string): Promise<Line[]> {
  const [links, lines] = await Promise.all([
    db.select<BidPeriodLine>('bid_period_lines', { eq: { bid_period_id: periodId } }),
    db.select<Line>('lines'),
  ])
  const ids = new Set(links.map(l => l.line_id))
  return lines.filter(l => ids.has(l.id))
}

async function notifyMany(rows: { employee_id: string; kind: string; title: string; body: string | null }[]) {
  if (rows.length) await db.insert('notifications', rows.map(r => ({ ...r, shift_id: null, read_at: null })))
}

const deadlineText = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

// ─── Employees ────────────────────────────────────────────────────────────────

export async function submitBids(periodId: string, lineIds: string[], wantsFullTime: boolean) {
  if (!isDemoMode) {
    const { error } = await supabase.rpc('submit_bids', { p_period: periodId, p_lines: lineIds, p_wants_full_time: wantsFullTime })
    if (error) throw new Error(error.message)
    return
  }
  const me = demoStore.actorId
  if (!me) throw new Error('Sign in first.')
  const p = await getPeriod(periodId)
  if (p.status !== 'open') throw new Error('Bidding is not open for this period.')
  if (new Date(p.closes_at) < new Date()) throw new Error('The bidding deadline has passed.')
  if (new Set(lineIds).size !== lineIds.length) throw new Error('Each line can be ranked only once.')
  const [lines, lineDays, [emp], [contact]] = await Promise.all([
    periodLines(periodId), db.select<LineDay>('line_days'),
    db.select<Employee>('employees', { eq: { id: me } }), db.select<EmployeeContact>('employee_contacts', { eq: { employee_id: me } }),
  ])
  for (const id of lineIds) {
    const line = lines.find(l => l.id === id)
    if (!line) throw new Error('A ranked line is not part of this bid.')
    const { problems } = lineBidProblems(emp, line, lineDays.filter(d => d.line_id === id), contact?.availability, { wantsFullTime })
    if (problems.length) throw new Error(problems[0])
  }
  const mine = await db.select<Bid>('bids', { eq: { bid_period_id: periodId, employee_id: me } })
  await db.removeIds('bids', mine.map(b => b.id))
  await db.insert('bids', lineIds.map((line_id, i) => ({ bid_period_id: periodId, employee_id: me, line_id, rank: i + 1 })))
  const [optin] = await db.select<BidOptin>('bid_optins', { eq: { bid_period_id: periodId, employee_id: me } })
  if (optin) await db.update('bid_optins', { id: optin.id }, { wants_full_time: wantsFullTime, submitted_at: now() })
  else await db.insert('bid_optins', { bid_period_id: periodId, employee_id: me, wants_full_time: wantsFullTime, submitted_at: now() })
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export interface PeriodDraft {
  name: string
  kind: BidPeriod['kind']
  start_date: string
  end_date: string
  closes_at: string
  notes: string | null
  lineIds: string[]
}

export async function savePeriod(id: string | null, draft: PeriodDraft, by: string | null): Promise<string> {
  const { lineIds, ...fields } = draft
  if (draft.end_date < draft.start_date) throw new Error('The end date is before the start date.')
  if (lineIds.length === 0) throw new Error('Pick at least one line for this bid.')
  let periodId = id
  if (periodId) {
    const p = await getPeriod(periodId)
    if (p.status !== 'draft' && p.status !== 'open') throw new Error('This bid is closed; its setup can no longer change.')
    await db.update('bid_periods', { id: periodId }, fields)
  } else {
    const [created] = await db.insert<BidPeriod>('bid_periods', { ...fields, status: 'draft', created_by: by })
    periodId = created.id
  }
  const current = await db.select<BidPeriodLine>('bid_period_lines', { eq: { bid_period_id: periodId } })
  await db.removeIds('bid_period_lines', current.filter(c => !lineIds.includes(c.line_id)).map(c => c.id))
  const add = lineIds.filter(l => !current.some(c => c.line_id === l))
  if (add.length) await db.insert('bid_period_lines', add.map(line_id => ({ bid_period_id: periodId, line_id })))
  return periodId
}

export async function openBidding(id: string) {
  const p = await getPeriod(id)
  if (p.status !== 'draft') throw new Error('Only a draft can be opened.')
  if (new Date(p.closes_at) <= new Date()) throw new Error('Set a deadline in the future first.')
  await db.update('bid_periods', { id }, { status: 'open', opened_at: now() })
  const bidders = (await db.select<Employee>('employees')).filter(isBidder)
  await notifyMany(bidders.map(e => ({
    employee_id: e.id, kind: 'bid_open', title: `Bidding is open: ${p.name}`,
    body: `Rank the lines you want by ${deadlineText(p.closes_at)}. Seniority decides who gets what.`,
  })))
}

/** "Closing soon" reminder to bidders who haven't ranked yet. Returns how many were reminded. */
export async function sendReminder(id: string): Promise<number> {
  const p = await getPeriod(id)
  if (p.status !== 'open') throw new Error('Bidding is not open.')
  const [employees, optins] = await Promise.all([db.select<Employee>('employees'), db.select<BidOptin>('bid_optins', { eq: { bid_period_id: id } })])
  const done = new Set(optins.map(o => o.employee_id))
  const missing = employees.filter(e => isBidder(e) && !done.has(e.id))
  await notifyMany(missing.map(e => ({
    employee_id: e.id, kind: 'bid_closing', title: `Bidding closes soon: ${p.name}`, body: `Rank your lines by ${deadlineText(p.closes_at)}.`,
  })))
  await db.update('bid_periods', { id }, { reminder_sent_at: now() })
  return missing.length
}

/** Run the seniority assignment and store it as the period's results (replaces earlier results). */
export async function runAssignment(id: string) {
  const [lines, lineDays, employees, bids, optins, contacts, old] = await Promise.all([
    periodLines(id), db.select<LineDay>('line_days'), db.select<Employee>('employees'),
    db.select<Bid>('bids', { eq: { bid_period_id: id } }), db.select<BidOptin>('bid_optins', { eq: { bid_period_id: id } }),
    db.select<EmployeeContact>('employee_contacts'), db.select<BidResult>('bid_results', { eq: { bid_period_id: id } }),
  ])
  const results = autoAssign({
    employees, lines, lineDays, bids, optins,
    availability: new Map(contacts.map(c => [c.employee_id, c.availability])),
  })
  await db.removeIds('bid_results', old.map(r => r.id))
  await db.insert('bid_results', results.map(r => ({ bid_period_id: id, ...r, source: 'auto' })))
}

export async function closeBidding(id: string) {
  const p = await getPeriod(id)
  if (p.status !== 'open') throw new Error('Bidding is not open.')
  await db.update('bid_periods', { id }, { status: 'closed', closed_at: now() })
  await runAssignment(id)
}

/** Admin changes one person's result during review. */
export async function setResult(periodId: string, employeeId: string, lineId: string | null, note: string | null) {
  const p = await getPeriod(periodId)
  if (p.status !== 'closed') throw new Error('Results can only be changed after bidding closes and before publishing.')
  const [existing] = await db.select<BidResult>('bid_results', { eq: { bid_period_id: periodId, employee_id: employeeId } })
  const [rank] = lineId ? await db.select<Bid>('bids', { eq: { bid_period_id: periodId, employee_id: employeeId, line_id: lineId } }) : []
  const fields = { line_id: lineId, source: 'manual', rank_got: rank?.rank ?? null, note: note || 'Changed by admin.' }
  if (existing) await db.update('bid_results', { id: existing.id }, fields)
  else await db.insert('bid_results', { bid_period_id: periodId, employee_id: employeeId, seniority_order: null, ...fields })
}

/**
 * Publish: the period's lines get their new holders from the start date (earlier holders end the
 * day before), shifts are generated for the period, and everyone is told what they got.
 */
export async function publishPeriod(id: string, by: string | null) {
  const p = await getPeriod(id)
  if (p.status !== 'closed') throw new Error('Close bidding and review the results before publishing.')
  const [lines, results, assignments, lineDays, blocks, employees, settings] = await Promise.all([
    periodLines(id), db.select<BidResult>('bid_results', { eq: { bid_period_id: id } }), db.select<LineAssignment>('line_assignments'),
    db.select<LineDay>('line_days'), db.select<Block>('blocks'), db.select<Employee>('employees'),
    db.select<{ key: string; value: unknown }>('app_settings'),
  ])
  const winners = results.filter(r => r.line_id)
  const perLine = new Map<string, number>()
  for (const r of winners) perLine.set(r.line_id!, (perLine.get(r.line_id!) ?? 0) + 1)
  for (const l of lines) {
    if ((perLine.get(l.id) ?? 0) > l.positions) throw new Error(`${l.code} has more people than positions. Fix it in the review first.`)
  }

  const lineIds = new Set(lines.map(l => l.id))
  const winnerIds = new Set(winners.map(r => r.employee_id))
  // End (or remove) assignments that overlap the period on these lines, or held by people getting a new line.
  const ending = assignments.filter(a =>
    rangesOverlap(a.effective_from, a.effective_to, p.start_date, p.end_date) && (lineIds.has(a.line_id) || winnerIds.has(a.employee_id)))
  for (const a of ending) {
    const future = await db.select<Shift>('shifts', { eq: { assignment_id: a.id }, gte: { date: p.start_date } })
    await db.removeIds('shifts', future.filter(s => s.status !== 'cancelled').map(s => s.id))
    if (a.effective_from < p.start_date) await db.update('line_assignments', { id: a.id }, { effective_to: addDays(p.start_date, -1) })
    else await db.remove('line_assignments', { id: a.id })
  }

  const created = await db.insert<LineAssignment>('line_assignments', winners.map(r => ({
    line_id: r.line_id, employee_id: r.employee_id, bid_period_id: id, source: r.source === 'manual' ? 'manual' : 'auto',
    effective_from: p.start_date, effective_to: p.end_date, created_by: by,
  })))

  // Shifts for the whole period (from today if it has already started).
  const from = p.start_date > todayISO() ? p.start_date : todayISO()
  const allLines = await db.select<Line>('lines')
  const timeOff = await db.select<{ employee_id: string; start_date: string; end_date: string }>('time_off_requests', { eq: { status: 'approved' } })
  const drafts = generateShifts({ assignments: created, lines: allLines, lineDays, blocks, existing: [], from, to: p.end_date, createdBy: by, timeOff })
  await db.insert('shifts', drafts as unknown as Record<string, unknown>[])
  const through = settings.find(s => s.key === 'shifts_generated_through')?.value
  if (typeof through !== 'string' || through < p.end_date) {
    await db.upsert('app_settings', { key: 'shifts_generated_through', value: p.end_date, updated_at: now() })
  }

  await db.update('bid_periods', { id }, { status: 'published', published_at: now() })

  const lineById = new Map(lines.map(l => [l.id, l]))
  const empById = new Map(employees.map(e => [e.id, e]))
  await notifyMany(results.filter(r => empById.get(r.employee_id)?.active).map(r => {
    const l = r.line_id ? lineById.get(r.line_id) : undefined
    return l
      ? { employee_id: r.employee_id, kind: 'bid_result', title: `Bid results: you got ${l.code}`, body: `${l.name || l.code}, starting ${formatDate(p.start_date)}. It's on your Schedule.` }
      : { employee_id: r.employee_id, kind: 'bid_result', title: `Bid results: no line for ${p.name}`, body: 'Talk to dispatch about open shifts and fill-ins.' }
  }))
}

export async function cancelPeriod(id: string) {
  const p = await getPeriod(id)
  if (p.status === 'published') throw new Error('A published bid can’t be cancelled.')
  await db.update('bid_periods', { id }, { status: 'cancelled' })
}

// ─── Google Sheet sync ────────────────────────────────────────────────────────

export async function fetchSheet(): Promise<SheetValues> {
  if (isDemoMode) return JSON.parse(JSON.stringify(DEMO_SHEET))
  const { data, error } = await supabase.functions.invoke('sheet-sync', { body: {} })
  if (error) {
    let message = 'Could not reach the sheet sync. Is the sheet-sync function deployed?'
    try { message = (await (error as { context: Response }).context.json()).error ?? message } catch { /* keep */ }
    throw new Error(message)
  }
  return data as SheetValues
}

export async function applySync(plan: SyncPlan) {
  const stamp = now()
  const contactFields = (p: SyncPlan['creates'][number], existingPhone?: string) => ({
    phone: p.phone ?? existingPhone ?? '', availability: p.availability, availability_notes: p.availability_notes, updated_at: stamp,
  })
  const empFields = (p: SyncPlan['creates'][number]) => ({
    role: p.role, employment_type: p.employment_type, can_dispatch: p.can_dispatch, bids_on_lines: p.bids_on_lines,
    seniority_date: p.seniority_date, hire_seq: p.hire_seq, active: p.active, sheet_managed: true, sheet_synced_at: stamp,
  })
  const contacts = await db.select<EmployeeContact>('employee_contacts')
  for (const p of plan.creates) {
    const [e] = await db.insert<Employee>('employees', { name: p.name, gurney_qualified: false, ...empFields(p) })
    await db.upsert('employee_contacts', { employee_id: e.id, ...contactFields(p) })
  }
  for (const u of plan.updates) {
    await db.update('employees', { id: u.employee.id }, empFields(u.person))
    const existing = contacts.find(c => c.employee_id === u.employee.id)
    await db.upsert('employee_contacts', { employee_id: u.employee.id, ...contactFields(u.person, existing?.phone) })
  }
  for (const p of plan.unchanged) {
    // Keep the "last synced" time current.
    const e = (await db.select<Employee>('employees')).find(x => x.name.toLowerCase() === p.name.toLowerCase())
    if (e) await db.update('employees', { id: e.id }, { sheet_synced_at: stamp })
  }
}
