// Certifications (expiration tracking) and time-off actions.
// Drivers act through database functions (demo: the mirrors below); dispatch decides here.
import { db } from './db'
import { isDemoMode, supabase } from './supabase'
import { demoStore } from './demo-store'
import { assignShift, notify, notifyStaff } from './board-actions'
import { alertLevel, formatDate, hoursUntilStart, todayISO } from './scheduling'
import { parseDueDates, parseRequirements, planCompliance, type SheetValues } from './sheet-sync'
import type { Block, ComplianceItem, Employee, Shift, TimeOffKind, TimeOffRequest } from '../types'

const now = () => new Date().toISOString()

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

function me(): string {
  if (!demoStore.actorId) throw new Error('Sign in first.')
  return demoStore.actorId
}

async function settingNum(key: string, d: number): Promise<number> {
  const [row] = await db.select<{ key: string; value: unknown }>('app_settings', { eq: { key } })
  return typeof row?.value === 'number' ? row.value : d
}

const dayRange = (a: string, b: string) =>
  a === b ? formatDate(a) : `${formatDate(a)} – ${formatDate(b)}`

// ─── Certifications ───────────────────────────────────────────────────────────

export async function reportRenewal(itemId: string, note: string | null) {
  if (!isDemoMode) return void await rpc('report_renewal', { p_item: itemId, p_note: note })
  const meId = me()
  const [item] = await db.select<ComplianceItem>('compliance_items', { eq: { id: itemId } })
  if (!item || item.employee_id !== meId) throw new Error('Not your item.')
  await db.update('compliance_items', { id: itemId }, { renewal_reported_at: now(), renewal_note: note })
  const [e] = await db.select<Employee>('employees', { eq: { id: meId } })
  await notifyStaff('renewal_reported', `${e.name} renewed: ${item.requirement}`, note || 'Update the Due Dates tab, then sync.', null)
}

/** Send due/overdue alerts now (normally a daily job). Returns how many people were alerted. */
export async function runAlertsNow(): Promise<number> {
  if (!isDemoMode) return rpc<number>('run_daily_alerts_now')
  const today = todayISO()
  const [items, employees] = await Promise.all([db.select<ComplianceItem>('compliance_items'), db.select<Employee>('employees')])
  const active = new Set(employees.filter(e => e.active).map(e => e.id))
  let sent = 0, overdue = 0, soon = 0
  for (const it of items) {
    if (!active.has(it.employee_id) || !it.next_due) continue
    const lvl = alertLevel(it, today)
    if (!lvl) continue
    const weekAgo = Date.now() - 7 * 86_400_000
    if (it.last_alert_level === lvl && (lvl !== 'overdue' || new Date(it.last_alerted_at ?? 0).getTime() > weekAgo)) continue
    const days = Math.round((new Date(`${it.next_due}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86_400_000)
    await notify(it.employee_id, 'expiration',
      days < 0 ? `${it.requirement} is overdue` : `${it.requirement} is due in ${days} day${days === 1 ? '' : 's'}`,
      `Due ${formatDate(it.next_due)}. See Certifications in the app for how to renew.`, null)
    await db.update('compliance_items', { id: it.id }, { last_alert_level: lvl, last_alerted_at: now() })
    sent++
    if (lvl === 'overdue') overdue++; else soon++
  }
  if (sent) await notifyStaff('expiration_summary', `Certifications: ${overdue} overdue, ${soon} coming due`, 'Admin → Certifications has the full list.', null)
  const [shifts, blocks] = await Promise.all([db.select<Shift>('shifts', { eq: { status: 'open' } }), db.select<Block>('blocks')])
  const byId = new Map(blocks.map(b => [b.id, b]))
  const openSoon = shifts.filter(s => !s.employee_id && (() => { const h = hoursUntilStart(s, byId.get(s.block_id)!); return h >= 0 && h <= 24 })()).length
  if (openSoon) {
    await notifyStaff('open_shift_unfilled', `${openSoon} open shift${openSoon === 1 ? '' : 's'} starting in the next 24 hours`,
      `Nobody has picked ${openSoon === 1 ? 'it' : 'them'} up. Assign from Requests → Open shifts.`, null)
  }
  return sent
}

/** Write the Due Dates and Requirements tabs into the app (after employees are synced). */
export async function applyCompliance(values: SheetValues) {
  const stamp = now()
  const reqs = parseRequirements(values.requirements)
  if (reqs.length) await db.upsert('compliance_requirements', reqs.map(r => ({ ...r, synced_at: stamp })))
  if (!values.dueDates?.length) return { upserts: 0, deletes: 0, unmatched: [] as string[] }
  const [employees, existing] = await Promise.all([db.select<Employee>('employees'), db.select<ComplianceItem>('compliance_items')])
  const plan = planCompliance(parseDueDates(values.dueDates), employees, existing)
  for (const u of plan.upserts) {
    const fields = {
      last_completed: u.row.last_completed, expiration_date: u.row.expiration_date, frequency_months: u.row.frequency_months,
      next_due: u.row.next_due, sheet_status: u.row.sheet_status, owner: u.row.owner, notes: u.row.notes, synced_at: stamp,
      // A new due date (e.g. renewed) starts the alerts over and clears "I renewed it".
      ...(u.dueChanged ? { last_alert_level: null, last_alerted_at: null, renewal_reported_at: null, renewal_note: null } : {}),
    }
    if (u.existing) await db.update('compliance_items', { id: u.existing.id }, fields)
    else await db.insert('compliance_items', { employee_id: u.employeeId, requirement: u.row.requirement, ...fields,
      last_alert_level: null, last_alerted_at: null, renewal_reported_at: null, renewal_note: null })
  }
  await db.removeIds('compliance_items', plan.deletes.map(d => d.id))
  return { upserts: plan.upserts.length, deletes: plan.deletes.length, unmatched: plan.unmatched }
}

// ─── Time off ─────────────────────────────────────────────────────────────────

export async function requestTimeOff(start: string, end: string, kind: TimeOffKind, note: string | null) {
  if (!isDemoMode) return void await rpc('request_time_off', { p_start: start, p_end: end, p_kind: kind, p_note: note })
  const meId = me()
  const today = todayISO()
  if (end < start) throw new Error('The last day is before the first day.')
  if (start < today) throw new Error("Time off can't start in the past.")
  const days = (new Date(`${end}T12:00:00Z`).getTime() - new Date(`${start}T12:00:00Z`).getTime()) / 86_400_000
  if (days > 60) throw new Error('For more than 60 days off, talk to the office.')
  const mine = await db.select<TimeOffRequest>('time_off_requests', { eq: { employee_id: meId } })
  if (mine.some(r => (r.status === 'pending' || r.status === 'approved') && r.start_date <= end && r.end_date >= start)) {
    throw new Error('You already have time off requested for some of those days.')
  }
  const notice = await settingNum('time_off_notice_days', 14)
  const lead = (new Date(`${start}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86_400_000
  const short = lead < notice
  await db.insert('time_off_requests', {
    employee_id: meId, start_date: start, end_date: end, kind, note, status: 'pending', short_notice: short,
    shifts_released: null, decided_by: null, decided_at: null, decision_note: null, created_at: now(), updated_at: now(),
  })
  const [e] = await db.select<Employee>('employees', { eq: { id: meId } })
  const n = (await db.select<Shift>('shifts', { eq: { employee_id: meId, status: 'scheduled' }, gte: { date: start }, lte: { date: end } })).length
  await notifyStaff('time_off_requested', `${e.name} requested time off: ${dayRange(start, end)}`,
    `${n} scheduled shift${n === 1 ? '' : 's'} affected${short ? ' · short notice' : ''}`, null)
}

export async function cancelTimeOff(id: string) {
  if (!isDemoMode) return void await rpc('cancel_time_off', { p_request: id })
  const meId = me()
  const [r] = await db.select<TimeOffRequest>('time_off_requests', { eq: { id } })
  if (!r || r.employee_id !== meId) throw new Error('Not your request.')
  if (r.status !== 'pending') throw new Error('Only a pending request can be cancelled. For approved time off, contact dispatch.')
  await db.update('time_off_requests', { id }, { status: 'cancelled', updated_at: now() })
}

/** Dispatch approves (their shifts in those days become open shifts) or denies. */
export async function decideTimeOff(id: string, approve: boolean, opts: { by: string | null; note: string | null }) {
  const [r] = await db.select<TimeOffRequest>('time_off_requests', { eq: { id } })
  if (!r || r.status !== 'pending') throw new Error('This request was already handled.')
  const range = dayRange(r.start_date, r.end_date)
  if (!approve) {
    await db.update('time_off_requests', { id }, { status: 'denied', decided_by: opts.by, decided_at: now(), decision_note: opts.note, updated_at: now() })
    await notify(r.employee_id, 'time_off_denied', `Time off not approved: ${range}`, opts.note, null)
    return
  }
  const shifts = await db.select<Shift>('shifts', { eq: { employee_id: r.employee_id, status: 'scheduled' }, gte: { date: r.start_date }, lte: { date: r.end_date } })
  for (const s of shifts) {
    await assignShift(s.id, null, { by: opts.by, note: `Time off (${range})`, quiet: true })
  }
  await db.update('time_off_requests', { id }, {
    status: 'approved', shifts_released: shifts.length, decided_by: opts.by, decided_at: now(), decision_note: opts.note, updated_at: now(),
  })
  await notify(r.employee_id, 'time_off_approved', `Time off approved: ${range}`,
    shifts.length ? `Your ${shifts.length} shift${shifts.length === 1 ? ' was' : 's were'} released as open shift${shifts.length === 1 ? '' : 's'}.${opts.note ? ` ${opts.note}` : ''}` : opts.note, null)
}

/** Approved time off, for schedule generation to skip. */
export async function approvedTimeOff() {
  return db.select<TimeOffRequest>('time_off_requests', { eq: { status: 'approved' } })
}
