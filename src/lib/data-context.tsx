import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { db, type TableName } from './db'
import { useAuth } from './auth'
import { addDays, assignmentConflicts, formatDate, generateShifts, startMessage, todayISO } from './scheduling'
import { isDemoMode, supabase } from './supabase'
import * as bidding from './bidding-actions'
import * as people from './people-actions'
import type { SheetValues, SyncPlan } from './sheet-sync'
import { assignShift, createShift, decideRequest, driverActions, loadShiftHistory, type DecisionOptions, type SwapCandidate } from './board-actions'
import type {
  Announcement, AnnouncementView, AppSetting, Block, CoverageRequirement, CrewRole, Dow, Employee,
  EmployeeContact, Line, LineAssignment, LineDay, Message, Shift, AppNotification, ShiftRequest,
  BidPeriod, BidPeriodLine, BidOptin, Bid, BidResult,
  ComplianceItem, ComplianceRequirement, TimeOffKind, TimeOffRequest, LinkTile, TileTap,
  BambiWeek, BambiChange,
} from '../types'

const TABLES: TableName[] = [
  'employees', 'employee_contacts', 'announcements', 'announcement_views', 'messages',
  'blocks', 'lines', 'line_days', 'coverage_requirements', 'line_assignments', 'app_settings',
  'shifts', 'notifications', 'shift_requests',
  'bid_periods', 'bid_period_lines', 'bid_optins', 'bids', 'bid_results',
  'compliance_requirements', 'compliance_items', 'time_off_requests', 'link_tiles',
  'bambi_weeks', 'bambi_changes',
]

/** How far back shifts are loaded (the roster/schedule look ahead from today). */
const SHIFT_HISTORY_DAYS = 14
const REQUEST_HISTORY_DAYS = 60

type Tables = {
  employees: Employee[]
  employee_contacts: EmployeeContact[]
  announcements: Announcement[]
  announcement_views: AnnouncementView[]
  messages: Message[]
  blocks: Block[]
  lines: Line[]
  line_days: LineDay[]
  coverage_requirements: CoverageRequirement[]
  line_assignments: LineAssignment[]
  app_settings: AppSetting[]
  shifts: Shift[]
  notifications: AppNotification[]
  shift_requests: ShiftRequest[]
  bid_periods: BidPeriod[]
  bid_period_lines: BidPeriodLine[]
  bid_optins: BidOptin[]
  bids: Bid[]
  bid_results: BidResult[]
  compliance_requirements: ComplianceRequirement[]
  compliance_items: ComplianceItem[]
  time_off_requests: TimeOffRequest[]
  link_tiles: LinkTile[]
  bambi_weeks: BambiWeek[]
  bambi_changes: BambiChange[]
}

const EMPTY: Tables = {
  employees: [], employee_contacts: [], announcements: [], announcement_views: [], messages: [],
  blocks: [], lines: [], line_days: [], coverage_requirements: [], line_assignments: [], app_settings: [],
  shifts: [], notifications: [], shift_requests: [],
  bid_periods: [], bid_period_lines: [], bid_optins: [], bids: [], bid_results: [],
  compliance_requirements: [], compliance_items: [], time_off_requests: [], link_tiles: [],
  bambi_weeks: [], bambi_changes: [],
}

export type EmployeeDraft = Omit<Employee, 'id' | 'created_at' | 'auth_user_id' | 'push_subscription'> & { id?: string }
export type BlockDraft = Omit<Block, 'id' | 'created_at'> & { id?: string }
export type LineDraft = Omit<Line, 'id' | 'created_at' | 'converted_to_core_at'> & { id?: string }
export type AssignmentDraft = Pick<LineAssignment, 'line_id' | 'employee_id' | 'effective_from' | 'effective_to'>

interface DataAPI {
  loaded: boolean
  employees: Employee[]
  /** Staff see everyone's; employees see only their own. */
  contacts: EmployeeContact[]
  announcements: Announcement[]
  views: AnnouncementView[]
  messages: Message[]
  latestMessages: Message[]
  unreadDispatch: number

  blocks: Block[]
  lines: Line[]
  lineDays: LineDay[]
  coverage: CoverageRequirement[]
  assignments: LineAssignment[]
  settings: Record<string, unknown>
  blocksById: Map<string, Block>
  employeesById: Map<string, Employee>

  reload: () => Promise<void>

  // Comms
  addAnnouncement: (ann: { title: string; body: string; image_url?: string | null; video_url?: string | null; requires_ack: boolean }) => Promise<void>
  markViewed: (announcementId: string, driverId: string) => Promise<void>
  acknowledge: (announcementId: string, driverId: string) => Promise<void>
  sendMessage: (driverId: string, sender: 'driver' | 'dispatch', body: string) => Promise<void>
  markMessagesRead: (driverId: string, senderToMark: 'driver' | 'dispatch') => Promise<void>
  getDriverMessages: (driverId: string) => Message[]
  getUnreadForDriver: (driverId: string) => number

  // Admin
  saveEmployee: (emp: EmployeeDraft, phone: string) => Promise<void>
  saveBlock: (block: BlockDraft) => Promise<void>
  deleteBlock: (id: string) => Promise<void>
  saveLine: (line: LineDraft, days: { dow: Dow; block_id: string }[]) => Promise<void>
  deleteLine: (id: string) => Promise<void>
  convertLineToCore: (id: string) => Promise<void>
  setCoverage: (dow: Dow, blockId: string, role: CrewRole, count: number) => Promise<void>
  assignLine: (draft: AssignmentDraft, createdBy: string | null) => Promise<void>
  endAssignment: (id: string, endDate: string) => Promise<void>
  deleteAssignment: (id: string) => Promise<void>

  // Schedule
  shifts: Shift[]
  /** Last date shifts have been generated through (null = never). */
  generatedThrough: string | null
  generateSchedule: (from: string, to: string, opts: { rebuild: boolean; createdBy: string | null }) => Promise<{ added: number; removed: number }>
  setShiftStart: (shift: Shift, time: string | null, postedBy: string | null, firstPickup?: string | null) => Promise<void>
  /** Driver confirms their posted start time. */
  confirmStart: (shiftId: string) => Promise<void>
  /** Dispatch re-sends the start-time notification to someone who hasn't confirmed. */
  remindStart: (shift: Shift) => Promise<void>

  // Bambi weekly checklist (dispatch)
  bambiWeeks: BambiWeek[]
  bambiChanges: BambiChange[]
  markWeekEntered: (monday: string, by: string | null) => Promise<void>
  unmarkWeek: (monday: string) => Promise<void>
  markBambiDone: (ids: string[], by: string | null) => Promise<void>

  // Notifications (always your own)
  notifications: AppNotification[]
  unreadNotifications: number
  markNotificationsRead: (ids: string[]) => Promise<void>

  // Shift board
  requests: ShiftRequest[]
  callOutSick: (shiftId: string, note: string | null) => Promise<void>
  postGiveup: (shiftId: string, note: string | null) => Promise<void>
  swapCandidates: (shiftId: string) => Promise<SwapCandidate[]>
  proposeSwap: (shiftId: string, swapShiftId: string, note: string | null) => Promise<void>
  respondSwap: (requestId: string, accept: boolean) => Promise<void>
  claimGiveup: (requestId: string) => Promise<void>
  requestOpenShift: (shiftId: string, note: string | null) => Promise<void>
  cancelRequest: (requestId: string) => Promise<void>
  decideRequest: (requestId: string, approve: boolean, opts: DecisionOptions) => Promise<void>
  assignShift: (shiftId: string, employeeId: string | null, opts: DecisionOptions) => Promise<void>
  createShift: (draft: { date: string; block_id: string; role: CrewRole; employee_id: string | null }, opts: DecisionOptions) => Promise<void>
  loadShiftHistory: typeof loadShiftHistory

  // Bidding
  bidPeriods: BidPeriod[]
  bidPeriodLines: BidPeriodLine[]
  bidOptins: BidOptin[]
  bids: Bid[]
  bidResults: BidResult[]
  submitBids: (periodId: string, lineIds: string[], wantsFullTime: boolean) => Promise<void>
  savePeriod: (id: string | null, draft: bidding.PeriodDraft, by: string | null) => Promise<string>
  openBidding: (id: string) => Promise<void>
  sendBidReminder: (id: string) => Promise<number>
  closeBidding: (id: string) => Promise<void>
  rerunAssignment: (id: string) => Promise<void>
  setBidResult: (periodId: string, employeeId: string, lineId: string | null, note: string | null) => Promise<void>
  publishPeriod: (id: string, by: string | null) => Promise<void>
  cancelPeriod: (id: string) => Promise<void>

  // Google Sheet sync
  fetchSheet: () => Promise<SheetValues>
  /** Applies employee changes, then the Due Dates / Requirements tabs. */
  applySync: (plan: SyncPlan, values: SheetValues) => Promise<{ upserts: number; deletes: number; unmatched: string[] }>

  // Certifications
  complianceItems: ComplianceItem[]
  complianceRequirements: ComplianceRequirement[]
  reportRenewal: (itemId: string, note: string | null) => Promise<void>
  runAlertsNow: () => Promise<number>

  // Time off
  timeOff: TimeOffRequest[]
  requestTimeOff: (start: string, end: string, kind: TimeOffKind, note: string | null) => Promise<void>
  cancelTimeOff: (id: string) => Promise<void>
  decideTimeOff: (id: string, approve: boolean, opts: { by: string | null; note: string | null }) => Promise<void>

  // Linked tiles
  tiles: LinkTile[]
  /** Record a tap (fire-and-forget) for usage counts. */
  recordTap: (tileId: string, context: 'home' | 'shift') => void
  saveTile: (tile: Omit<LinkTile, 'id' | 'created_at'> & { id?: string }) => Promise<void>
  deleteTile: (id: string) => Promise<void>
  moveTile: (id: string, by: -1 | 1) => Promise<void>
  loadTileTaps: (sinceISO: string) => Promise<TileTap[]>
}

const DataContext = createContext<DataAPI>(null!)

export function useData() { return useContext(DataContext) }

export function DataProvider({ children }: { children: ReactNode }) {
  const [tables, setTables] = useState<Tables>(EMPTY)
  const meId = useAuth().me?.id ?? null
  const [loaded, setLoaded] = useState(false)

  const loadTable = useCallback(async (t: TableName) => {
    try {
      const rows = t === 'shifts'
        ? await db.select(t, { gte: { date: addDays(todayISO(), -SHIFT_HISTORY_DAYS) } })
        : t === 'shift_requests'
          ? await db.select(t, { gte: { created_at: addDays(todayISO(), -REQUEST_HISTORY_DAYS) } })
          : t === 'notifications'
            // Notifications are personal (the database enforces this too; demo mode relies on it).
            ? await db.select(t, { eq: { employee_id: meId } })
            : await db.select(t)
      setTables(prev => ({ ...prev, [t]: rows }))
    } catch (err) {
      console.error(`Failed to load ${t}:`, err)
    }
  }, [meId])

  const reload = useCallback(async () => {
    await Promise.all(TABLES.map(loadTable))
    setLoaded(true)
  }, [loadTable])

  useEffect(() => {
    reload()
    const unsubs = TABLES.map(t => db.subscribe(t, () => loadTable(t)))
    return () => unsubs.forEach(u => u())
  }, [reload, loadTable])

  const { messages, announcement_views: views } = tables

  const latestMessages = useMemo(() => {
    const sorted = [...messages].sort((a, b) => b.created_at.localeCompare(a.created_at))
    const seen = new Set<string>()
    const result: Message[] = []
    for (const m of sorted) {
      if (!seen.has(m.driver_id)) { seen.add(m.driver_id); result.push(m) }
    }
    return result
  }, [messages])

  const settings = useMemo(
    () => Object.fromEntries(tables.app_settings.map(s => [s.key, s.value])),
    [tables.app_settings],
  )
  /** Run a board action, then refresh what it touches (realtime also catches changes by others). */
  const board = async (fn: () => Promise<unknown>) => {
    try { await fn() } finally {
      await Promise.all([loadTable('shifts'), loadTable('shift_requests'), loadTable('notifications'), loadTable('bambi_changes')])
    }
  }

  const bid = async (fn: () => Promise<unknown>) => {
    try { await fn() } finally {
      await Promise.all(['bid_periods', 'bid_period_lines', 'bid_optins', 'bids', 'bid_results', 'notifications'].map(t => loadTable(t as TableName)))
    }
  }

  const generatedThrough = typeof settings.shifts_generated_through === 'string' ? settings.shifts_generated_through : null
  const blocksById = useMemo(() => new Map(tables.blocks.map(b => [b.id, b])), [tables.blocks])
  const employeesById = useMemo(() => new Map(tables.employees.map(e => [e.id, e])), [tables.employees])

  const api: DataAPI = {
    loaded,
    employees: useMemo(() => [...tables.employees].sort((a, b) => a.name.localeCompare(b.name)), [tables.employees]),
    contacts: tables.employee_contacts,
    announcements: useMemo(() => [...tables.announcements].sort((a, b) => b.created_at.localeCompare(a.created_at)), [tables.announcements]),
    views,
    messages,
    latestMessages,
    unreadDispatch: messages.filter(m => m.sender === 'driver' && !m.read_at).length,

    blocks: useMemo(() => [...tables.blocks].sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code)), [tables.blocks]),
    lines: useMemo(() => [...tables.lines].sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code)), [tables.lines]),
    lineDays: tables.line_days,
    coverage: tables.coverage_requirements,
    assignments: tables.line_assignments,
    settings,
    blocksById,
    employeesById,

    reload,

    addAnnouncement: async (ann) => {
      await db.insert('announcements', { ...ann, created_by: 'dispatch' })
      await loadTable('announcements')
    },

    markViewed: async (announcementId, driverId) => {
      if (views.some(v => v.announcement_id === announcementId && v.driver_id === driverId)) return
      await db.insert('announcement_views', { announcement_id: announcementId, driver_id: driverId, viewed_at: new Date().toISOString(), acknowledged_at: null })
      await loadTable('announcement_views')
    },

    acknowledge: async (announcementId, driverId) => {
      const now = new Date().toISOString()
      const existing = views.find(v => v.announcement_id === announcementId && v.driver_id === driverId)
      if (existing) await db.update('announcement_views', { id: existing.id }, { acknowledged_at: now })
      else await db.insert('announcement_views', { announcement_id: announcementId, driver_id: driverId, viewed_at: now, acknowledged_at: now })
      await loadTable('announcement_views')
    },

    sendMessage: async (driverId, sender, body) => {
      await db.insert('messages', { driver_id: driverId, sender, body, read_at: null })
      await loadTable('messages')
    },

    markMessagesRead: async (driverId, senderToMark) => {
      const unread = messages.filter(m => m.driver_id === driverId && m.sender === senderToMark && !m.read_at)
      if (unread.length === 0) return
      const now = new Date().toISOString()
      await Promise.all(unread.map(m => db.update('messages', { id: m.id }, { read_at: now })))
      await loadTable('messages')
    },

    getDriverMessages: (driverId) =>
      messages.filter(m => m.driver_id === driverId).sort((a, b) => a.created_at.localeCompare(b.created_at)),

    getUnreadForDriver: (driverId) =>
      messages.filter(m => m.driver_id === driverId && m.sender === 'dispatch' && !m.read_at).length,

    // ── Admin ────────────────────────────────────────────────────────────────

    saveEmployee: async ({ id, ...fields }, phone) => {
      let empId = id
      if (empId) {
        await db.update('employees', { id: empId }, fields)
      } else {
        const [created] = await db.insert<Employee>('employees', fields)
        empId = created.id
      }
      await db.upsert('employee_contacts', { employee_id: empId, phone: phone.trim(), updated_at: new Date().toISOString() })
      await Promise.all([loadTable('employees'), loadTable('employee_contacts')])
    },

    saveBlock: async ({ id, ...fields }) => {
      if (id) await db.update('blocks', { id }, fields)
      else await db.insert('blocks', fields)
      await loadTable('blocks')
    },

    deleteBlock: async (id) => {
      if (tables.line_days.some(d => d.block_id === id)) {
        throw new Error('This block is used by a line. Remove it from those lines first, or mark it inactive.')
      }
      await db.remove('coverage_requirements', { block_id: id })
      await db.remove('blocks', { id })
      await Promise.all([loadTable('blocks'), loadTable('coverage_requirements')])
    },

    saveLine: async ({ id, ...fields }, days) => {
      for (const d of days) {
        const block = blocksById.get(d.block_id)
        if (block && !block.crew_roles.includes(fields.role)) {
          throw new Error(`${block.code} has no ${fields.role} position.`)
        }
      }
      let lineId = id
      if (lineId) {
        await db.update('lines', { id: lineId }, fields)
      } else {
        const [created] = await db.insert<Line>('lines', fields)
        lineId = created.id
      }
      // Replace the line's days with the new set.
      const current = tables.line_days.filter(d => d.line_id === lineId)
      const wanted = fields.is_flex ? [] : days
      for (const c of current) {
        const w = wanted.find(x => x.dow === c.dow)
        if (!w) await db.remove('line_days', { id: c.id })
        else if (w.block_id !== c.block_id) await db.update('line_days', { id: c.id }, { block_id: w.block_id })
      }
      const toAdd = wanted.filter(w => !current.some(c => c.dow === w.dow))
      if (toAdd.length) await db.insert('line_days', toAdd.map(w => ({ line_id: lineId, dow: w.dow, block_id: w.block_id })))
      await Promise.all([loadTable('lines'), loadTable('line_days')])
    },

    deleteLine: async (id) => {
      if (tables.line_assignments.some(a => a.line_id === id)) {
        throw new Error('This line has assignment history. Mark it inactive instead of deleting it.')
      }
      await db.remove('line_days', { line_id: id })
      await db.remove('lines', { id })
      await Promise.all([loadTable('lines'), loadTable('line_days')])
    },

    convertLineToCore: async (id) => {
      await db.update('lines', { id }, { category: 'core', converted_to_core_at: new Date().toISOString() })
      await loadTable('lines')
    },

    setCoverage: async (dow, blockId, role, count) => {
      const existing = tables.coverage_requirements.find(c => c.dow === dow && c.block_id === blockId && c.role === role)
      if (existing && count <= 0) await db.remove('coverage_requirements', { id: existing.id })
      else if (existing) await db.update('coverage_requirements', { id: existing.id }, { required_count: count })
      else if (count > 0) await db.insert('coverage_requirements', { dow, block_id: blockId, role, required_count: count })
      await loadTable('coverage_requirements')
    },

    assignLine: async (draft, createdBy) => {
      const line = tables.lines.find(l => l.id === draft.line_id)
      if (!line) throw new Error('Line not found.')
      const problems = assignmentConflicts(draft, line, tables.line_assignments)
      if (problems.length) throw new Error(problems.join(' '))
      const [created] = await db.insert<LineAssignment>('line_assignments', { ...draft, source: 'manual', bid_period_id: null, created_by: createdBy })
      // Fill in their shifts up to the date the schedule has already been generated through.
      const from = draft.effective_from > todayISO() ? draft.effective_from : todayISO()
      if (created && generatedThrough && generatedThrough >= from) {
        const existing = await db.select<Shift>('shifts', { eq: { assignment_id: created.id } })
        const drafts = generateShifts({
          assignments: [created], lines: tables.lines, lineDays: tables.line_days, blocks: tables.blocks,
          existing, from, to: generatedThrough, createdBy, timeOff: await people.approvedTimeOff(),
        })
        await db.insert('shifts', drafts as unknown as Record<string, unknown>[])
      }
      await Promise.all([loadTable('line_assignments'), loadTable('shifts')])
    },

    endAssignment: async (id, endDate) => {
      await db.update('line_assignments', { id }, { effective_to: endDate })
      // Their shifts after the last day come off the schedule.
      const after = await db.select<Shift>('shifts', { eq: { assignment_id: id }, gte: { date: addDays(endDate, 1) } })
      await db.removeIds('shifts', after.map(s => s.id))
      await Promise.all([loadTable('line_assignments'), loadTable('shifts')])
    },

    deleteAssignment: async (id) => {
      // Upcoming shifts from a mistaken assignment go away; past ones stay (unlinked) for history.
      const upcoming = await db.select<Shift>('shifts', { eq: { assignment_id: id }, gte: { date: todayISO() } })
      await db.removeIds('shifts', upcoming.map(s => s.id))
      await db.remove('line_assignments', { id })
      await Promise.all([loadTable('line_assignments'), loadTable('shifts')])
    },

    // ── Schedule ─────────────────────────────────────────────────────────────

    shifts: tables.shifts,
    generatedThrough: generatedThrough,

    generateSchedule: async (from, to, { rebuild, createdBy }) => {
      if (to < from) throw new Error('The end date is before the start date.')
      let removed = 0
      let existing = await db.select<Shift>('shifts', { gte: { date: from }, lte: { date: to } })
      if (rebuild) {
        // Only untouched line shifts are rebuilt: posted start times and manual changes are kept.
        const stale = existing.filter(s => s.source === 'line' && s.status === 'scheduled' && !s.start_posted_at)
        await db.removeIds('shifts', stale.map(s => s.id))
        removed = stale.length
        const staleIds = new Set(stale.map(s => s.id))
        existing = existing.filter(s => !staleIds.has(s.id))
      }
      const drafts = generateShifts({
        assignments: tables.line_assignments, lines: tables.lines, lineDays: tables.line_days,
        blocks: tables.blocks, existing, from, to, createdBy, timeOff: await people.approvedTimeOff(),
      })
      await db.insert('shifts', drafts as unknown as Record<string, unknown>[])
      if (!generatedThrough || to > generatedThrough) {
        await db.upsert('app_settings', { key: 'shifts_generated_through', value: to, updated_at: new Date().toISOString() })
      }
      await Promise.all([loadTable('shifts'), loadTable('app_settings')])
      return { added: drafts.length, removed }
    },

    setShiftStart: async (shift, time, postedBy, firstPickup) => {
      const wasPosted = !!shift.start_time
      await db.update('shifts', { id: shift.id }, {
        start_time: time,
        first_pickup_time: firstPickup ?? null,
        start_posted_at: time ? new Date().toISOString() : null,
        start_posted_by: time ? postedBy : null,
        start_confirmed_at: null, // a new time needs a new confirmation
      })
      if (time && shift.employee_id) {
        const day = shift.date === addDays(todayISO(), 1) ? 'Tomorrow' : formatDate(shift.date)
        await db.insert('notifications', {
          employee_id: shift.employee_id,
          kind: wasPosted ? 'am_start_changed' : 'am_start_posted',
          title: `${wasPosted ? 'Changed — ' : ''}${day}: ${startMessage(time, firstPickup)}`,
          body: 'Tap Confirm on your Home screen so dispatch knows you’re on.',
          shift_id: shift.id,
          read_at: null,
        })
      }
      await Promise.all([loadTable('shifts'), loadTable('notifications')])
    },

    confirmStart: async (shiftId) => {
      if (!isDemoMode) {
        const { error } = await supabase.rpc('confirm_shift_start', { p_shift: shiftId })
        if (error) throw new Error(error.message)
      } else {
        const s = tables.shifts.find(x => x.id === shiftId)
        if (!s || s.employee_id !== meId || s.status !== 'scheduled') throw new Error("This isn't your shift.")
        if (!s.start_time || !s.start_posted_at) throw new Error("Your start time hasn't been posted yet.")
        await db.update('shifts', { id: shiftId }, { start_confirmed_at: new Date().toISOString() })
      }
      await loadTable('shifts')
    },

    remindStart: async (shift) => {
      if (!shift.employee_id || !shift.start_time) return
      const day = shift.date === addDays(todayISO(), 1) ? 'Tomorrow' : formatDate(shift.date)
      await db.insert('notifications', {
        employee_id: shift.employee_id, kind: 'start_reminder',
        title: `Please confirm — ${day}: ${startMessage(shift.start_time, shift.first_pickup_time)}`,
        body: 'Tap Confirm on your Home screen so dispatch knows you’re on.', shift_id: shift.id, read_at: null,
      })
      await loadTable('notifications')
    },

    bambiWeeks: tables.bambi_weeks,
    bambiChanges: useMemo(() => [...tables.bambi_changes].sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at)), [tables.bambi_changes]),
    markWeekEntered: async (monday, by) => {
      await db.upsert('bambi_weeks', { week_start: monday, entered_at: new Date().toISOString(), entered_by: by })
      await loadTable('bambi_weeks')
    },
    unmarkWeek: async (monday) => {
      await db.remove('bambi_weeks', { week_start: monday })
      await loadTable('bambi_weeks')
    },
    markBambiDone: async (ids, by) => {
      const now = new Date().toISOString()
      await Promise.all(ids.map(id => db.update('bambi_changes', { id }, { done_at: now, done_by: by })))
      await loadTable('bambi_changes')
    },

    notifications: useMemo(
      () => [...tables.notifications].sort((a, b) => b.created_at.localeCompare(a.created_at)),
      [tables.notifications],
    ),
    unreadNotifications: tables.notifications.filter(n => !n.read_at).length,

    requests: tables.shift_requests,
    callOutSick: (id, note) => board(() => driverActions.callOutSick(id, note)),
    postGiveup: (id, note) => board(() => driverActions.postGiveup(id, note)),
    swapCandidates: (id) => driverActions.swapCandidates(id),
    proposeSwap: (id, other, note) => board(() => driverActions.proposeSwap(id, other, note)),
    respondSwap: (id, accept) => board(() => driverActions.respondSwap(id, accept)),
    claimGiveup: (id) => board(() => driverActions.claimGiveup(id)),
    requestOpenShift: (id, note) => board(() => driverActions.requestOpenShift(id, note)),
    cancelRequest: (id) => board(() => driverActions.cancelRequest(id)),
    decideRequest: (id, approve, opts) => board(() => decideRequest(id, approve, opts)),
    assignShift: (id, emp, opts) => board(() => assignShift(id, emp, opts)),
    createShift: (draft, opts) => board(() => createShift(draft, opts)),
    loadShiftHistory,

    bidPeriods: useMemo(() => [...tables.bid_periods].sort((a, b) => b.start_date.localeCompare(a.start_date)), [tables.bid_periods]),
    bidPeriodLines: tables.bid_period_lines,
    bidOptins: tables.bid_optins,
    bids: tables.bids,
    bidResults: tables.bid_results,
    submitBids: (p, l, ft) => bid(() => bidding.submitBids(p, l, ft)),
    savePeriod: async (id, draft, by) => { let out = ''; await bid(async () => { out = await bidding.savePeriod(id, draft, by) }); return out },
    openBidding: (id) => bid(() => bidding.openBidding(id)),
    sendBidReminder: async (id) => { let n = 0; await bid(async () => { n = await bidding.sendReminder(id) }); return n },
    closeBidding: (id) => bid(() => bidding.closeBidding(id)),
    rerunAssignment: (id) => bid(() => bidding.runAssignment(id)),
    setBidResult: (p, e, l, note) => bid(() => bidding.setResult(p, e, l, note)),
    publishPeriod: (id, by) => bid(async () => { await bidding.publishPeriod(id, by); await Promise.all([loadTable('line_assignments'), loadTable('shifts'), loadTable('app_settings')]) }),
    cancelPeriod: (id) => bid(() => bidding.cancelPeriod(id)),

    fetchSheet: bidding.fetchSheet,
    applySync: async (plan, values) => {
      try {
        await bidding.applySync(plan)
        return await people.applyCompliance(values)
      } finally {
        await Promise.all(['employees', 'employee_contacts', 'compliance_items', 'compliance_requirements'].map(t => loadTable(t as TableName)))
      }
    },

    complianceItems: tables.compliance_items,
    complianceRequirements: tables.compliance_requirements,
    reportRenewal: async (id, note) => { try { await people.reportRenewal(id, note) } finally { await Promise.all([loadTable('compliance_items'), loadTable('notifications')]) } },
    runAlertsNow: async () => { try { return await people.runAlertsNow() } finally { await Promise.all([loadTable('compliance_items'), loadTable('notifications')]) } },

    tiles: useMemo(() => [...tables.link_tiles].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)), [tables.link_tiles]),
    recordTap: (tileId, context) => {
      if (!meId) return
      db.insert('tile_taps', { tile_id: tileId, employee_id: meId, context, tapped_at: new Date().toISOString() }).catch(() => { /* never block the link */ })
    },
    saveTile: async ({ id, ...fields }) => {
      const clean = { ...fields, url: fields.url?.trim() || null, fallback_url: fields.fallback_url?.trim() || null, icon_url: fields.icon_url?.trim() || null }
      if (id) await db.update('link_tiles', { id }, clean)
      else await db.insert('link_tiles', clean)
      await loadTable('link_tiles')
    },
    deleteTile: async (id) => { await db.remove('link_tiles', { id }); await loadTable('link_tiles') },
    moveTile: async (id, by) => {
      const list = [...tables.link_tiles].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      const i = list.findIndex(t => t.id === id)
      const j = i + by
      if (i < 0 || j < 0 || j >= list.length) return
      ;[list[i], list[j]] = [list[j], list[i]]
      await Promise.all(list.map((t, k) => t.sort_order === (k + 1) * 10 ? null : db.update('link_tiles', { id: t.id }, { sort_order: (k + 1) * 10 })))
      await loadTable('link_tiles')
    },
    loadTileTaps: (since) => db.select<TileTap>('tile_taps', { gte: { tapped_at: since } }),

    timeOff: tables.time_off_requests,
    requestTimeOff: async (a, b, k, n) => { try { await people.requestTimeOff(a, b, k, n) } finally { await Promise.all([loadTable('time_off_requests'), loadTable('notifications')]) } },
    cancelTimeOff: async (id) => { try { await people.cancelTimeOff(id) } finally { await loadTable('time_off_requests') } },
    decideTimeOff: (id, approve, opts) => board(async () => { try { await people.decideTimeOff(id, approve, opts) } finally { await loadTable('time_off_requests') } }),

    markNotificationsRead: async (ids) => {
      if (ids.length === 0) return
      const now = new Date().toISOString()
      await Promise.all(ids.map(id => db.update('notifications', { id }, { read_at: now })))
      await loadTable('notifications')
    },
  }

  return <DataContext.Provider value={api}>{children}</DataContext.Provider>
}
