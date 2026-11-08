export type TableName =
  | 'employees'
  | 'employee_contacts'
  | 'announcements'
  | 'announcement_views'
  | 'messages'
  | 'blocks'
  | 'lines'
  | 'line_days'
  | 'coverage_requirements'
  | 'line_assignments'
  | 'app_settings'
  | 'audit_log'
  | 'shifts'
  | 'notifications'

export const PRIMARY_KEYS: Record<TableName, string> = {
  employees: 'id',
  employee_contacts: 'employee_id',
  announcements: 'id',
  announcement_views: 'id',
  messages: 'id',
  blocks: 'id',
  lines: 'id',
  line_days: 'id',
  coverage_requirements: 'id',
  line_assignments: 'id',
  app_settings: 'key',
  audit_log: 'id',
  shifts: 'id',
  notifications: 'id',
}

/** Tables the database audit trigger records (mirrored by the demo store). */
export const AUDITED_TABLES: TableName[] = [
  'employees', 'blocks', 'lines', 'line_days', 'coverage_requirements', 'line_assignments', 'app_settings', 'shifts',
]

/** Simple row filters supported by both Supabase and the demo store. */
export interface RowFilter {
  eq?: Record<string, unknown>
  gte?: Record<string, string>
  lte?: Record<string, string>
}

export function rowMatches(row: Record<string, unknown>, f?: RowFilter): boolean {
  if (!f) return true
  for (const [k, v] of Object.entries(f.eq ?? {})) if (row[k] !== v) return false
  for (const [k, v] of Object.entries(f.gte ?? {})) if (!(String(row[k] ?? '') >= v)) return false
  for (const [k, v] of Object.entries(f.lte ?? {})) if (!(String(row[k] ?? '') <= v)) return false
  return true
}
