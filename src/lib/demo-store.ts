// In-memory stand-in for Supabase when no keys are configured (demo mode).
// Holds every table as a plain array and mimics insert/update/delete + realtime + the audit trigger.
import { demoShifts, demoNotifications, demoRequests, demoBidding, demoCompliance, demoTimeOff, demoTiles, DEMO_GENERATED_THROUGH } from './demo-schedule'
import { DEMO_ANNOUNCEMENTS, DEMO_ASSIGNMENTS, DEMO_CONTACTS, DEMO_EMPLOYEES, DEMO_MESSAGES, DEMO_VIEWS } from './demo-data'
import { SEED_BLOCKS, SEED_COVERAGE, SEED_LINE_DAYS, SEED_LINES, SEED_SETTINGS } from './scheduling/seed'
import type { AuditEntry } from '../types'
import { PRIMARY_KEYS, AUDITED_TABLES, rowMatches, type RowFilter, type TableName } from './tables'

type Row = Record<string, unknown>
type Listener = () => void

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

function initialTables(): Record<TableName, Row[]> {
  return {
    employees: clone(DEMO_EMPLOYEES) as unknown as Row[],
    employee_contacts: clone(DEMO_CONTACTS) as unknown as Row[],
    announcements: clone(DEMO_ANNOUNCEMENTS) as unknown as Row[],
    announcement_views: clone(DEMO_VIEWS) as unknown as Row[],
    messages: clone(DEMO_MESSAGES) as unknown as Row[],
    blocks: clone(SEED_BLOCKS) as unknown as Row[],
    lines: clone(SEED_LINES) as unknown as Row[],
    line_days: clone(SEED_LINE_DAYS) as unknown as Row[],
    coverage_requirements: clone(SEED_COVERAGE) as unknown as Row[],
    line_assignments: clone(DEMO_ASSIGNMENTS) as unknown as Row[],
    app_settings: Object.entries({ ...SEED_SETTINGS, shifts_generated_through: DEMO_GENERATED_THROUGH }).map(([key, value]) => ({ key, value })),
    audit_log: [],
    shifts: demoShifts() as unknown as Row[],
    notifications: demoNotifications() as unknown as Row[],
    shift_requests: demoRequests() as unknown as Row[],
    bid_periods: demoBidding().periods as unknown as Row[],
    bid_period_lines: demoBidding().links as unknown as Row[],
    bid_optins: demoBidding().optins as unknown as Row[],
    bids: demoBidding().bids as unknown as Row[],
    bid_results: [],
    compliance_requirements: demoCompliance().requirements as unknown as Row[],
    compliance_items: demoCompliance().items as unknown as Row[],
    time_off_requests: demoTimeOff() as unknown as Row[],
    link_tiles: demoTiles() as unknown as Row[],
    tile_taps: [],
    bambi_weeks: [],
    bambi_changes: [],
  }
}

let seq = 0
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`

function matches(row: Row, match: Row): boolean {
  return Object.entries(match).every(([k, v]) => row[k] === v)
}

class DemoStore {
  tables = initialTables()
  /** Who is "signed in" — used as the audit actor. */
  actorId: string | null = null
  private listeners = new Map<TableName, Set<Listener>>()
  private auditSeq = 1

  subscribe(table: TableName, fn: Listener) {
    if (!this.listeners.has(table)) this.listeners.set(table, new Set())
    this.listeners.get(table)!.add(fn)
    return () => { this.listeners.get(table)?.delete(fn) }
  }

  private notify(table: TableName) {
    this.listeners.get(table)?.forEach(fn => fn())
  }

  private audit(table: TableName, action: AuditEntry['action'], before: Row | null, after: Row | null) {
    if (!AUDITED_TABLES.includes(table)) return
    const row = (after ?? before)!
    const entry: AuditEntry = {
      id: this.auditSeq++,
      actor_employee_id: this.actorId,
      entity: table,
      entity_id: typeof row.id === 'string' ? row.id : null,
      action,
      before: before ? clone(before) : null,
      after: after ? clone(after) : null,
      at: new Date().toISOString(),
    }
    this.tables.audit_log.push(entry as unknown as Row)
    this.notify('audit_log')
  }

  /** Mirrors track_bambi_change(): log shift changes in weeks already entered in Bambi. */
  private trackBambi(op: 'insert' | 'update' | 'delete', before: Row | null, after: Row | null) {
    const s = (after ?? before)!
    const date = String(s.date)
    const d = new Date(`${date}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
    const monday = d.toISOString().slice(0, 10)
    if (!this.tables.bambi_weeks.some(w => w.week_start === monday)) return
    const name = (id: unknown) => (this.tables.employees.find(e => e.id === id)?.name as string) ?? 'open'
    const block = this.tables.blocks.find(b => b.id === s.block_id)
    const day = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '')
    const label = `${day} ${block?.code ?? ''}${s.role === 'attendant' ? ' attendant' : ''}`
    let msg: string | null = null
    if (op === 'insert') msg = `${label}: added — ${name(after!.employee_id)}`
    else if (op === 'delete') msg = `${label}: removed (${name(before!.employee_id)})`
    else if (after!.status === 'cancelled' && before!.status !== 'cancelled') msg = `${label}: cancelled (${name(before!.employee_id)})`
    else if (after!.employee_id !== before!.employee_id) msg = `${label}: ${name(before!.employee_id)} → ${name(after!.employee_id)}`
    else if (after!.start_time !== before!.start_time && after!.start_time) {
      const [h, m] = String(after!.start_time).split(':').map(Number)
      msg = `${label}: ${name(after!.employee_id)} starts ${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`
    }
    if (!msg) return
    this.tables.bambi_changes.push({
      id: newId('bc'), shift_id: op === 'delete' ? null : s.id, date, summary: msg,
      created_at: new Date().toISOString(), done_at: null, done_by: null,
    })
    this.notify('bambi_changes')
  }

  select(table: TableName, filter?: RowFilter): Row[] {
    return clone(this.tables[table].filter(r => rowMatches(r, filter)))
  }

  removeIds(table: TableName, ids: string[]) {
    const pk = PRIMARY_KEYS[table]
    const set = new Set(ids)
    const keep: Row[] = []
    for (const row of this.tables[table]) {
      if (set.has(row[pk] as string)) this.audit(table, 'delete', row, null)
      else keep.push(row)
    }
    this.tables[table] = keep
    this.notify(table)
  }

  insert(table: TableName, rows: Row[]): Row[] {
    const pk = PRIMARY_KEYS[table]
    const out: Row[] = []
    for (const r of rows) {
      const row: Row = { ...r }
      if (pk === 'id' && row.id == null) row.id = newId(table.slice(0, 3))
      if (this.tables[table].some(x => x[pk] === row[pk])) {
        throw new Error(`Duplicate ${table} ${String(row[pk])}`)
      }
      if (!('created_at' in row) && table !== 'app_settings' && table !== 'employee_contacts' && table !== 'line_days' && table !== 'coverage_requirements') {
        row.created_at = new Date().toISOString()
      }
      this.tables[table].push(row)
      this.audit(table, 'insert', null, row)
      if (table === 'shifts') this.trackBambi('insert', null, row)
      out.push(clone(row))
    }
    this.notify(table)
    return out
  }

  update(table: TableName, match: Row, patch: Row) {
    for (const row of this.tables[table]) {
      if (!matches(row, match)) continue
      const before = clone(row)
      Object.assign(row, patch)
      if (table === 'shifts') {
        // Mirrors reset_start_confirmation(): a confirmation only counts for that time and person.
        const changed = row.start_time !== before.start_time || row.employee_id !== before.employee_id
        if (changed && row.start_confirmed_at === before.start_confirmed_at) row.start_confirmed_at = null
        this.trackBambi('update', before, row)
      }
      this.audit(table, 'update', before, row)
    }
    this.notify(table)
  }

  upsert(table: TableName, rows: Row[]) {
    const pk = PRIMARY_KEYS[table]
    for (const r of rows) {
      const existing = this.tables[table].find(x => x[pk] === r[pk])
      if (existing) this.update(table, { [pk]: r[pk] }, r)
      else this.insert(table, [r])
    }
  }

  remove(table: TableName, match: Row) {
    const keep: Row[] = []
    for (const row of this.tables[table]) {
      if (matches(row, match)) {
        this.audit(table, 'delete', row, null)
        if (table === 'shifts') this.trackBambi('delete', row, null)
      } else keep.push(row)
    }
    this.tables[table] = keep
    this.notify(table)
  }
}

export const demoStore = new DemoStore()
