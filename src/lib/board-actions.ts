// Shift board actions.
//
// Driver actions: in the real app these call the database functions in
// supabase/migrations/004_shift_board.sql (which enforce the rules server-side). In demo mode
// the `demo*` functions below do the same thing against the in-memory store.
//
// Dispatch actions (approve / deny / reassign / add a shift) run here in both modes, using
// staff write access.
import { db } from './db'
import { isDemoMode, supabase } from './supabase'
import { demoStore } from './demo-store'
import {
  ACTIVE_STATUSES, addDays, formatDate, insideCutoff, todayISO, workProblem,
} from './scheduling'
import type { Block, CrewRole, Employee, Shift, ShiftRequest } from '../types'

// ─── Lookups ──────────────────────────────────────────────────────────────────

async function one<T>(table: 'shifts' | 'blocks' | 'employees' | 'shift_requests', id: string, what: string): Promise<T> {
  const [row] = await db.select<T>(table, { eq: { id } })
  if (!row) throw new Error(`${what} not found.`)
  return row
}
const getShift = (id: string) => one<Shift>('shifts', id, 'Shift')
const getBlock = (id: string) => one<Block>('blocks', id, 'Block')
const getEmployee = (id: string) => one<Employee>('employees', id, 'Employee')
const getRequest = (id: string) => one<ShiftRequest>('shift_requests', id, 'Request')

async function settings(): Promise<Record<string, unknown>> {
  const rows = await db.select<{ key: string; value: unknown }>('app_settings')
  return Object.fromEntries(rows.map(r => [r.key, r.value]))
}

function num(s: Record<string, unknown>, k: string, d: number) {
  return typeof s[k] === 'number' ? (s[k] as number) : d
}

export async function shiftLabel(shift: Shift): Promise<string> {
  const b = await getBlock(shift.block_id)
  return `${formatDate(shift.date)} ${b.code} (${b.name})`
}

async function problemFor(empId: string, shift: Shift, ignoreShiftId?: string | null): Promise<string | null> {
  const [emp, block, sameDay] = await Promise.all([
    db.select<Employee>('employees', { eq: { id: empId } }).then(r => r[0]),
    getBlock(shift.block_id),
    db.select<Shift>('shifts', { eq: { date: shift.date } }),
  ])
  return workProblem(emp, shift, block, sameDay, ignoreShiftId)
}

async function activeRequestsFor(shiftId: string): Promise<ShiftRequest[]> {
  const [a, b] = await Promise.all([
    db.select<ShiftRequest>('shift_requests', { eq: { shift_id: shiftId } }),
    db.select<ShiftRequest>('shift_requests', { eq: { swap_shift_id: shiftId } }),
  ])
  const seen = new Set<string>()
  return [...a, ...b].filter(r => ACTIVE_STATUSES.includes(r.status) && !seen.has(r.id) && (seen.add(r.id), true))
}

async function cancelActive(shiftId: string, exceptId: string | null, note: string) {
  const active = (await activeRequestsFor(shiftId)).filter(r => r.id !== exceptId)
  if (!active.length) return
  const label = await shiftLabel(await getShift(shiftId))
  for (const r of active) {
    await db.update('shift_requests', { id: r.id }, { status: 'cancelled', decision_note: note, updated_at: new Date().toISOString() })
    // Tell whoever was waiting on it (not the person whose shift it was).
    const waiting = r.type === 'pickup' ? r.requester_id : r.type === 'giveup' ? r.claimant_id : r.type === 'swap' ? r.target_id : null
    await notify(waiting, 'request_cancelled', `Request closed: ${label}`, `${note}. Check the Board for other open shifts.`, shiftId)
  }
}

async function requireOutsideCutoff(shift: Shift) {
  const [block, s] = await Promise.all([getBlock(shift.block_id), settings()])
  const hours = num(s, 'request_cutoff_hours', 48)
  if (insideCutoff(shift, block, hours)) throw new Error(`This shift starts within ${hours} hours. Contact dispatch directly.`)
}

// ─── Notifications ────────────────────────────────────────────────────────────

export async function notify(employeeId: string | null, kind: string, title: string, body: string | null, shiftId: string | null) {
  if (!employeeId) return
  await db.insert('notifications', { employee_id: employeeId, kind, title, body, shift_id: shiftId, read_at: null })
}

export async function notifyStaff(kind: string, title: string, body: string | null, shiftId: string | null) {
  const staff = (await db.select<Employee>('employees')).filter(e => e.active && (e.role === 'dispatcher' || e.role === 'admin'))
  if (staff.length) {
    await db.insert('notifications', staff.map(e => ({ employee_id: e.id, kind, title, body, shift_id: shiftId, read_at: null })))
  }
}

/** Tell everyone who could work an open shift (part-time only while "part-time first" is on). */
async function announceOpenShift(shift: Shift, excludeId: string | null) {
  const [employees, block, sameDay, s] = await Promise.all([
    db.select<Employee>('employees'), getBlock(shift.block_id), db.select<Shift>('shifts', { eq: { date: shift.date } }), settings(),
  ])
  const ptOnly = s.pt_first_open_shifts === true
  const label = `${formatDate(shift.date)} ${block.code} (${block.name})`
  const rows = employees
    .filter(e => e.active && e.id !== excludeId && (e.role === 'driver' || e.role === 'attendant'))
    .filter(e => !ptOnly || e.employment_type === 'PT')
    .filter(e => workProblem(e, shift, block, sameDay) === null)
    .map(e => ({ employee_id: e.id, kind: 'open_shift', title: `Open shift: ${label}`, body: 'You can request it on the Board.', shift_id: shift.id, read_at: null }))
  if (rows.length) await db.insert('notifications', rows)
}

// ─── Driver actions (real app → database functions; demo → below) ────────────

export interface SwapCandidate {
  shift_id: string
  date: string
  block_id: string
  employee_id: string
  employee_name: string
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

function me(): string {
  if (!demoStore.actorId) throw new Error('Sign in first.')
  return demoStore.actorId
}

export const driverActions = {
  async callOutSick(shiftId: string, note: string | null) {
    if (!isDemoMode) return void await rpc('call_out_sick', { p_shift: shiftId, p_note: note })
    const meId = me()
    const s = await getShift(shiftId)
    if (s.employee_id !== meId || s.status !== 'scheduled') throw new Error('You can only call out of your own scheduled shift.')
    if (s.date < todayISO()) throw new Error('That shift has already passed.')
    const who = (await getEmployee(meId)).name
    await cancelActive(shiftId, null, 'Called out sick')
    await db.update('shifts', { id: shiftId }, { employee_id: null, status: 'open', opened_at: new Date().toISOString() })
    await db.insert('shift_requests', reqRow({ type: 'callout', status: 'approved', shift_id: shiftId, requester_id: meId, previous_employee_id: meId, note, decided_at: new Date().toISOString() }))
    await notifyStaff('callout', `${who} called out sick: ${await shiftLabel(s)}`, note || 'The shift is now open for pickup.', shiftId)
    await announceOpenShift({ ...s, employee_id: null, status: 'open' }, meId)
  },

  async postGiveup(shiftId: string, note: string | null) {
    if (!isDemoMode) return void await rpc('post_giveup', { p_shift: shiftId, p_note: note })
    const meId = me()
    const s = await getShift(shiftId)
    if (s.employee_id !== meId || s.status !== 'scheduled') throw new Error('You can only give up your own scheduled shift.')
    await requireOutsideCutoff(s)
    if ((await activeRequestsFor(shiftId)).length) throw new Error('This shift already has an open request.')
    await db.insert('shift_requests', reqRow({ type: 'giveup', status: 'posted', shift_id: shiftId, requester_id: meId, previous_employee_id: meId, note }))
    await announceOpenShift(s, meId)
  },

  async swapCandidates(shiftId: string): Promise<SwapCandidate[]> {
    if (!isDemoMode) return rpc<SwapCandidate[]>('swap_candidates', { p_shift: shiftId })
    const meId = me()
    const mine = await getShift(shiftId)
    if (mine.employee_id !== meId) throw new Error('Not your shift.')
    await requireOutsideCutoff(mine)
    const today = todayISO()
    const [shifts, employees, blocks, requests, s] = await Promise.all([
      db.select<Shift>('shifts', { gte: { date: today }, lte: { date: addDays(today, 35) } }),
      db.select<Employee>('employees'), db.select<Block>('blocks'), db.select<ShiftRequest>('shift_requests'), settings(),
    ])
    const blocksById = new Map(blocks.map(b => [b.id, b]))
    const emps = new Map(employees.map(e => [e.id, e]))
    const busy = new Set(requests.filter(r => ACTIVE_STATUSES.includes(r.status)).flatMap(r => [r.shift_id, r.swap_shift_id]))
    const hours = num(s, 'request_cutoff_hours', 48)
    // Same-day shifts outside the 35-day window still matter for double-booking checks.
    const all = [...shifts, mine]
    return shifts
      .filter(o => o.status === 'scheduled' && o.employee_id && o.employee_id !== meId && o.role === mine.role)
      .filter(o => !busy.has(o.id) && !insideCutoff(o, blocksById.get(o.block_id)!, hours))
      .filter(o => workProblem(emps.get(meId), o, blocksById.get(o.block_id), all, mine.id) === null)
      .filter(o => workProblem(emps.get(o.employee_id!), mine, blocksById.get(mine.block_id), all, o.id) === null)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(o => ({ shift_id: o.id, date: o.date, block_id: o.block_id, employee_id: o.employee_id!, employee_name: emps.get(o.employee_id!)?.name ?? 'Unknown' }))
  },

  async proposeSwap(shiftId: string, swapShiftId: string, note: string | null) {
    if (!isDemoMode) return void await rpc('propose_swap', { p_shift: shiftId, p_swap_shift: swapShiftId, p_note: note })
    const meId = me()
    const [s, o] = await Promise.all([getShift(shiftId), getShift(swapShiftId)])
    if (s.employee_id !== meId || s.status !== 'scheduled') throw new Error('You can only trade your own scheduled shift.')
    if (o.status !== 'scheduled' || !o.employee_id || o.employee_id === meId) throw new Error("Pick a coworker's scheduled shift to trade for.")
    await requireOutsideCutoff(s)
    await requireOutsideCutoff(o)
    if ((await activeRequestsFor(shiftId)).length || (await activeRequestsFor(swapShiftId)).length) throw new Error('One of these shifts already has an open request.')
    const problem = (await problemFor(meId, o, s.id)) ?? (await problemFor(o.employee_id, s, o.id))
    if (problem) throw new Error(`This trade doesn't work: ${problem}`)
    await db.insert('shift_requests', reqRow({ type: 'swap', status: 'pending_partner', shift_id: shiftId, swap_shift_id: swapShiftId, requester_id: meId, target_id: o.employee_id, previous_employee_id: meId, note }))
    const who = (await getEmployee(meId)).name
    await notify(o.employee_id, 'swap_proposed', `${who} wants to trade shifts with you`,
      `Their ${await shiftLabel(s)} for your ${await shiftLabel(o)}. Answer on the Board.`, swapShiftId)
  },

  async respondSwap(requestId: string, accept: boolean) {
    if (!isDemoMode) return void await rpc('respond_swap', { p_request: requestId, p_accept: accept })
    const meId = me()
    const r = await getRequest(requestId)
    if (r.type !== 'swap' || r.target_id !== meId || r.status !== 'pending_partner') throw new Error('This trade is no longer waiting for you.')
    const who = (await getEmployee(meId)).name
    const [s, o] = await Promise.all([getShift(r.shift_id), getShift(r.swap_shift_id!)])
    if (accept) {
      await requireOutsideCutoff(s)
      await requireOutsideCutoff(o)
      await db.update('shift_requests', { id: r.id }, { status: 'pending', updated_at: new Date().toISOString() })
      await notify(r.requester_id, 'swap_accepted', `${who} accepted your trade`, 'Now waiting for dispatch to approve.', r.shift_id)
      await notifyStaff('request_pending', `Trade to approve: ${await shiftLabel(s)} ↔ ${await shiftLabel(o)}`, null, r.shift_id)
    } else {
      await db.update('shift_requests', { id: r.id }, { status: 'declined', updated_at: new Date().toISOString() })
      await notify(r.requester_id, 'swap_declined', `${who} declined your trade`, await shiftLabel(s), r.shift_id)
    }
  },

  async claimGiveup(requestId: string) {
    if (!isDemoMode) return void await rpc('claim_giveup', { p_request: requestId })
    const meId = me()
    const r = await getRequest(requestId)
    if (r.type !== 'giveup' || r.status !== 'posted') throw new Error('This shift is no longer available.')
    if (r.requester_id === meId) throw new Error("That's your own shift.")
    const s = await getShift(r.shift_id)
    await requireOutsideCutoff(s)
    const problem = await problemFor(meId, s)
    if (problem) throw new Error(problem)
    await db.update('shift_requests', { id: r.id }, { status: 'pending', claimant_id: meId, updated_at: new Date().toISOString() })
    const who = (await getEmployee(meId)).name
    await notify(r.requester_id, 'shift_claimed', `${who} wants to take your ${await shiftLabel(s)}`, 'Waiting for dispatch to approve.', s.id)
    await notifyStaff('request_pending', `Give-up to approve: ${who} → ${await shiftLabel(s)}`, null, s.id)
  },

  async requestOpenShift(shiftId: string, note: string | null) {
    if (!isDemoMode) return void await rpc('request_open_shift', { p_shift: shiftId, p_note: note })
    const meId = me()
    const s = await getShift(shiftId)
    if (s.status !== 'open' || s.employee_id) throw new Error('This shift is no longer open.')
    if (s.date < todayISO()) throw new Error('That shift has already passed.')
    const [e, st] = await Promise.all([getEmployee(meId), settings()])
    if (st.pt_first_open_shifts === true && e.employment_type === 'FT') {
      const opened = new Date(s.opened_at ?? s.created_at ?? Date.now()).getTime()
      if (opened + num(st, 'pt_first_hours', 24) * 3_600_000 > Date.now()) {
        throw new Error('Part-time employees get first pick on open shifts. Try again later.')
      }
    }
    const problem = await problemFor(meId, s)
    if (problem) throw new Error(problem)
    const mineAlready = (await db.select<ShiftRequest>('shift_requests', { eq: { shift_id: shiftId, requester_id: meId, type: 'pickup', status: 'pending' } })).length
    if (mineAlready) throw new Error('You already asked for this shift.')
    await db.insert('shift_requests', reqRow({ type: 'pickup', status: 'pending', shift_id: shiftId, requester_id: meId, note }))
    await notifyStaff('request_pending', `${e.name} wants open shift ${await shiftLabel(s)}`, note, shiftId)
  },

  async cancelRequest(requestId: string) {
    if (!isDemoMode) return void await rpc('cancel_my_request', { p_request: requestId })
    const meId = me()
    const r = await getRequest(requestId)
    if (!ACTIVE_STATUSES.includes(r.status)) throw new Error('This request is already closed.')
    const now = new Date().toISOString()
    if (r.requester_id === meId) {
      await db.update('shift_requests', { id: r.id }, { status: 'cancelled', updated_at: now })
      const label = await shiftLabel(await getShift(r.shift_id))
      await notify(r.claimant_id, 'request_cancelled', `Give-up withdrawn: ${label}`, null, r.shift_id)
      await notify(r.target_id, 'request_cancelled', `Trade withdrawn: ${label}`, null, r.shift_id)
    } else if (r.claimant_id === meId && r.status === 'pending') {
      await db.update('shift_requests', { id: r.id }, { status: 'posted', claimant_id: null, updated_at: now })
    } else {
      throw new Error("This isn't your request.")
    }
  },
}

function reqRow(r: Partial<ShiftRequest> & Pick<ShiftRequest, 'type' | 'status' | 'shift_id' | 'requester_id'>): Record<string, unknown> {
  const now = new Date().toISOString()
  return {
    swap_shift_id: null, target_id: null, claimant_id: null, previous_employee_id: null, note: null, decision_note: null,
    override_reason: null, ot_warnings: null, decided_by: null, decided_at: null, created_at: now, updated_at: now, ...r,
  }
}

// ─── Dispatch actions (both modes) ────────────────────────────────────────────

export interface DecisionOptions {
  by: string | null
  note?: string | null
  overrideReason?: string | null
  /** Overtime warnings the dispatcher saw; approving with any requires an override reason. */
  warnings?: string[]
  /** Don't notify the person taken off (e.g. their time off was approved; they get one summary). */
  quiet?: boolean
}

function requireOverride(opts: DecisionOptions) {
  if (opts.warnings?.length && !opts.overrideReason?.trim()) {
    throw new Error('This change triggers overtime warnings. Enter a reason to approve anyway.')
  }
}

const changed = () => new Error('This shift has changed since the request was made. Refresh and check the schedule.')

export async function decideRequest(requestId: string, approve: boolean, opts: DecisionOptions) {
  const r = await getRequest(requestId)
  if (!ACTIVE_STATUSES.includes(r.status)) throw new Error('This request was already handled.')
  const now = new Date().toISOString()
  const close = (status: 'approved' | 'denied') => db.update('shift_requests', { id: r.id }, {
    status, decided_by: opts.by, decided_at: now, updated_at: now, decision_note: opts.note ?? null,
    override_reason: opts.overrideReason?.trim() || null, ot_warnings: opts.warnings?.length ? opts.warnings : null,
  })
  const s = await getShift(r.shift_id)
  const label = await shiftLabel(s)
  const why = opts.note ? ` ${opts.note}` : ''

  if (!approve) {
    await close('denied')
    const msg = r.type === 'pickup' ? `Open shift request denied: ${label}` : r.type === 'swap' ? `Trade denied: ${label}` : `Give-up denied: ${label}`
    await notify(r.requester_id, 'request_denied', msg, opts.note ?? null, s.id)
    if (r.claimant_id) await notify(r.claimant_id, 'request_denied', `Not approved: ${label}`, opts.note ?? null, s.id)
    if (r.target_id && r.status === 'pending') await notify(r.target_id, 'request_denied', `Trade denied: ${label}`, opts.note ?? null, s.id)
    return
  }

  requireOverride(opts)

  if (r.type === 'giveup' && !r.claimant_id) {
    // Release to open shifts — nobody has claimed it yet.
    if (s.employee_id !== r.requester_id || s.status !== 'scheduled') throw changed()
    await db.update('shifts', { id: s.id }, { employee_id: null, status: 'open', opened_at: now })
    await close('approved')
    await cancelActive(s.id, r.id, 'Released to open shifts')
    await notify(r.requester_id, 'request_approved', `Give-up approved: ${label}`, `You're off this shift. It's now an open shift.${why}`, s.id)
    await announceOpenShift({ ...s, employee_id: null, status: 'open' }, r.requester_id)
    return
  }

  if (r.type === 'giveup') {
    if (s.employee_id !== r.requester_id || s.status !== 'scheduled') throw changed()
    const problem = await problemFor(r.claimant_id!, s)
    if (problem) throw new Error(`Can't give it to them: ${problem}`)
    await db.update('shifts', { id: s.id }, { employee_id: r.claimant_id, source: 'board' })
    await close('approved')
    await cancelActive(s.id, r.id, 'Shift changed hands')
    await notify(r.requester_id, 'request_approved', `Give-up approved: ${label}`, `You're off this shift.${why}`, s.id)
    await notify(r.claimant_id, 'request_approved', `You picked up ${label}`, `It's on your schedule now.${why}`, s.id)
    return
  }

  if (r.type === 'swap') {
    if (r.status !== 'pending') throw new Error('The coworker has not accepted this trade yet.')
    const o = await getShift(r.swap_shift_id!)
    if (s.employee_id !== r.requester_id || o.employee_id !== r.target_id || s.status !== 'scheduled' || o.status !== 'scheduled') throw changed()
    const problem = (await problemFor(r.requester_id, o, s.id)) ?? (await problemFor(r.target_id!, s, o.id))
    if (problem) throw new Error(`This trade doesn't work anymore: ${problem}`)
    await db.update('shifts', { id: s.id }, { employee_id: r.target_id, source: 'board' })
    await db.update('shifts', { id: o.id }, { employee_id: r.requester_id, source: 'board' })
    await close('approved')
    await cancelActive(s.id, r.id, 'Shift changed hands')
    await cancelActive(o.id, r.id, 'Shift changed hands')
    const otherLabel = await shiftLabel(o)
    await notify(r.requester_id, 'request_approved', 'Trade approved', `You now work ${otherLabel} instead of ${label}.${why}`, o.id)
    await notify(r.target_id, 'request_approved', 'Trade approved', `You now work ${label} instead of ${otherLabel}.${why}`, s.id)
    return
  }

  if (r.type === 'pickup') {
    if (s.status !== 'open' || s.employee_id) throw new Error('This shift has already been filled.')
    const problem = await problemFor(r.requester_id, s)
    if (problem) throw new Error(`Can't give it to them: ${problem}`)
    await db.update('shifts', { id: s.id }, { employee_id: r.requester_id, status: 'scheduled', source: 'board', opened_at: null })
    await close('approved')
    const who = (await getEmployee(r.requester_id)).name
    for (const other of await activeRequestsFor(s.id)) {
      if (other.id === r.id) continue
      await db.update('shift_requests', { id: other.id }, { status: 'denied', decision_note: `Filled by ${who}`, decided_by: opts.by, decided_at: now, updated_at: now })
      await notify(other.requester_id, 'request_denied', `Open shift filled: ${label}`, 'Someone else was approved for it.', s.id)
    }
    await notify(r.requester_id, 'request_approved', `You picked up ${label}`, `It's on your schedule now.${why}`, s.id)
    return
  }

  throw new Error('Nothing to approve on this request.')
}

/**
 * Dispatch puts someone on a shift, takes them off (employeeId = null → open shift),
 * or moves it to someone else. Role and gurney rules always apply; working another shift that
 * day shows up as an overtime warning instead.
 */
export async function assignShift(shiftId: string, employeeId: string | null, opts: DecisionOptions) {
  const s = await getShift(shiftId)
  if (s.employee_id === employeeId) return
  if (employeeId) {
    const problem = await problemFor(employeeId, s)
    if (problem && problem !== 'Already working that day.') throw new Error(problem)
  }
  requireOverride(opts)
  const now = new Date().toISOString()
  const label = await shiftLabel(s)
  await db.update('shifts', { id: s.id }, employeeId
    ? { employee_id: employeeId, status: 'scheduled', source: 'manual', opened_at: null }
    : { employee_id: null, status: 'open', opened_at: now })
  await cancelActive(s.id, null, 'Changed by dispatch')
  await db.insert('shift_requests', reqRow({
    type: 'assign', status: 'approved', shift_id: s.id, requester_id: opts.by ?? employeeId ?? s.employee_id!,
    claimant_id: employeeId, previous_employee_id: s.employee_id, note: opts.note ?? null,
    override_reason: opts.overrideReason?.trim() || null, ot_warnings: opts.warnings?.length ? opts.warnings : null,
    decided_by: opts.by, decided_at: now,
  }))
  if (s.employee_id && !opts.quiet) await notify(s.employee_id, 'shift_removed', `Dispatch took you off ${label}`, opts.note ?? null, s.id)
  if (employeeId) await notify(employeeId, 'shift_assigned', `Dispatch added you to ${label}`, opts.note ?? null, s.id)
  else await announceOpenShift({ ...s, employee_id: null, status: 'open' }, s.employee_id)
}

/** Dispatch adds a one-off shift (for an uncovered slot), for a person or as an open shift. */
export async function createShift(
  draft: { date: string; block_id: string; role: CrewRole; employee_id: string | null },
  opts: DecisionOptions,
) {
  const block = await getBlock(draft.block_id)
  if (!block.crew_roles.includes(draft.role)) throw new Error(`${block.code} has no ${draft.role} position.`)
  const [created] = await db.insert<Shift>('shifts', {
    date: draft.date, block_id: block.id, role: draft.role, employee_id: null, line_id: null, assignment_id: null,
    source: 'manual', status: 'open', opened_at: new Date().toISOString(),
    start_time: block.start_type === 'fixed' ? block.default_start : null,
    end_time: block.end_type === 'fixed' ? block.default_end : null,
    start_posted_at: null, start_posted_by: null, target_hours: Number(block.target_paid_hours), notes: opts.note ?? null,
    created_by: opts.by,
  })
  if (draft.employee_id) await assignShift(created.id, draft.employee_id, opts)
  else await announceOpenShift(created, null)
}

export async function loadShiftHistory(shiftId: string) {
  const [requests, swaps, audit] = await Promise.all([
    db.select<ShiftRequest>('shift_requests', { eq: { shift_id: shiftId } }),
    db.select<ShiftRequest>('shift_requests', { eq: { swap_shift_id: shiftId } }),
    db.select<{ id: number; action: string; at: string; actor_employee_id: string | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null }>(
      'audit_log', { eq: { entity: 'shifts', entity_id: shiftId } }),
  ])
  return {
    requests: [...requests, ...swaps.filter(x => !requests.some(r => r.id === x.id))].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    audit: audit.sort((a, b) => a.at.localeCompare(b.at)),
  }
}
