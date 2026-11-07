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
}

/** Tables the database audit trigger records (mirrored by the demo store). */
export const AUDITED_TABLES: TableName[] = [
  'employees', 'blocks', 'lines', 'line_days', 'coverage_requirements', 'line_assignments', 'app_settings',
]
