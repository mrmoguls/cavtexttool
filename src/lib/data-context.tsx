import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { db, type TableName } from './db'
import { useAuth } from './auth'
import { addDays, assignmentConflicts, formatDate, formatTime, generateShifts, todayISO } from './scheduling'
import { assignShift, createShift, decideRequest, driverActions, loadShiftHistory, type DecisionOptions, type SwapCandidate } from './board-actions'
import type {
  Announcement, AnnouncementView, AppSetting, Block, CoverageRequirement, CrewRole, Dow, Employee,
  EmployeeContact, Line, LineAssignment, LineDay, Message, Shift, AppNotification, ShiftRequest,
} from '../types'

const TABLES: TableName[] = [
  'employees', 'employee_contacts', 'announcements', 'announcement_views', 'messages',
  'blocks', 'lines', 'line_days', 'coverage_requirements', 'line_assignments', 'app_settings',
  'shifts', 'notifications', 'shift_requests',
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
}

const EMPTY: Tables = {
  employees: [], employee_contacts: [], announcements: [], announcement_views: [], messages: [],
  blocks: [], lines: [], line_days: [], coverage_requirements: [], line_assignments: [], app_settings: [],
  shifts: [], notifications: [], shift_requests: [],
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
  setShiftStart: (shift: Shift, time: string | null, postedBy: string | null) => Promise<void>

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
      await Promise.all([loadTable('shifts'), loadTable('shift_requests'), loadTable('notifications')])
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
          existing, from, to: generatedThrough, createdBy,
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
        blocks: tables.blocks, existing, from, to, createdBy,
      })
      await db.insert('shifts', drafts as unknown as Record<string, unknown>[])
      if (!generatedThrough || to > generatedThrough) {
        await db.upsert('app_settings', { key: 'shifts_generated_through', value: to, updated_at: new Date().toISOString() })
      }
      await Promise.all([loadTable('shifts'), loadTable('app_settings')])
      return { added: drafts.length, removed }
    },

    setShiftStart: async (shift, time, postedBy) => {
      const wasPosted = !!shift.start_time
      await db.update('shifts', { id: shift.id }, {
        start_time: time,
        start_posted_at: time ? new Date().toISOString() : null,
        start_posted_by: time ? postedBy : null,
      })
      if (time && shift.employee_id) {
        await db.insert('notifications', {
          employee_id: shift.employee_id,
          kind: wasPosted ? 'am_start_changed' : 'am_start_posted',
          title: `${wasPosted ? 'Start time changed' : 'Start time'} for ${formatDate(shift.date)}: ${formatTime(time)}`,
          body: `Report at ${formatTime(time)} and work until your assigned trips are complete.`,
          shift_id: shift.id,
          read_at: null,
        })
      }
      await Promise.all([loadTable('shifts'), loadTable('notifications')])
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

    markNotificationsRead: async (ids) => {
      if (ids.length === 0) return
      const now = new Date().toISOString()
      await Promise.all(ids.map(id => db.update('notifications', { id }, { read_at: now })))
      await loadTable('notifications')
    },
  }

  return <DataContext.Provider value={api}>{children}</DataContext.Provider>
}
