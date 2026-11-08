// In-memory stand-in for Supabase when no keys are configured (demo mode).
// Holds every table as a plain array and mimics insert/update/delete + realtime + the audit trigger.
import { demoShifts, demoNotifications, DEMO_GENERATED_THROUGH } from './demo-schedule'
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
      if (matches(row, match)) this.audit(table, 'delete', row, null)
      else keep.push(row)
    }
    this.tables[table] = keep
    this.notify(table)
  }
}

export const demoStore = new DemoStore()
