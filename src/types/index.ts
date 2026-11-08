export type EmployeeRole = 'driver' | 'attendant' | 'dispatcher' | 'admin'
export type EmploymentType = 'FT' | 'PT'
export type CrewRole = 'driver' | 'attendant'

export interface Employee {
  id: string
  name: string
  role: EmployeeRole
  employment_type: EmploymentType
  seniority_date: string | null
  hire_seq: number | null
  gurney_qualified: boolean
  active: boolean
  auth_user_id?: string | null
  push_subscription?: string | null
  created_at: string
}

export interface EmployeeContact {
  employee_id: string
  phone: string
  updated_at?: string
}

export interface DirectoryEntry {
  id: string
  name: string
  role: EmployeeRole
}

export interface Announcement {
  id: string
  title: string
  body: string
  image_url?: string | null
  video_url?: string | null
  requires_ack: boolean
  created_at: string
  created_by: string
}

export interface AnnouncementView {
  id: string
  announcement_id: string
  driver_id: string
  viewed_at: string
  acknowledged_at?: string | null
}

export interface Message {
  id: string
  driver_id: string
  sender: 'driver' | 'dispatch'
  body: string
  created_at: string
  read_at?: string | null
}

// ─── Scheduling ───────────────────────────────────────────────────────────────

export type TimeRule = 'fixed' | 'variable'

export interface Block {
  id: string
  code: string
  name: string
  crew_roles: CrewRole[]
  start_type: TimeRule
  end_type: TimeRule
  default_start: string | null // 'HH:MM' or 'HH:MM:SS'
  default_end: string | null
  target_paid_hours: number
  /** Applies to the driver position on this block. */
  requires_gurney_qual: boolean
  start_rule_note: string | null
  end_rule_note: string | null
  active: boolean
  sort_order: number
  created_at?: string
}

export type LineCategory = 'core' | 'growth'

export interface Line {
  id: string
  code: string
  name: string
  employment_type: EmploymentType
  category: LineCategory
  role: CrewRole
  requires_gurney_qual: boolean
  is_flex: boolean
  positions: number
  active: boolean
  notes: string | null
  sort_order: number
  converted_to_core_at?: string | null
  created_at?: string
}

/** 0 = Sunday … 6 = Saturday */
export type Dow = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface LineDay {
  id: string
  line_id: string
  dow: Dow
  block_id: string
}

export interface CoverageRequirement {
  id: string
  dow: Dow
  block_id: string
  role: CrewRole
  required_count: number
}

export interface LineAssignment {
  id: string
  line_id: string
  employee_id: string
  bid_period_id: string | null
  source: 'manual' | 'auto' | 'growth_offer'
  effective_from: string // YYYY-MM-DD
  effective_to: string | null
  created_by?: string | null
  created_at?: string
}

export interface AppSetting {
  key: string
  value: unknown
}

export interface AuditEntry {
  id: number
  actor_employee_id: string | null
  entity: string
  entity_id: string | null
  action: 'insert' | 'update' | 'delete'
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  at: string
}

export type ShiftSource = 'line' | 'manual' | 'growth' | 'board'
export type ShiftStatus = 'scheduled' | 'open' | 'cancelled'

export interface Shift {
  id: string
  date: string // YYYY-MM-DD (Pacific)
  block_id: string
  role: CrewRole
  /** null = open shift */
  employee_id: string | null
  line_id: string | null
  assignment_id: string | null
  source: ShiftSource
  status: ShiftStatus
  start_time: string | null
  end_time: string | null
  start_posted_at: string | null
  start_posted_by: string | null
  target_hours: number
  notes: string | null
  opened_at?: string | null
  created_by?: string | null
  created_at?: string
}

export interface AppNotification {
  id: string
  employee_id: string
  kind: string
  title: string
  body: string | null
  shift_id: string | null
  read_at: string | null
  created_at: string
}

export type RequestType = 'giveup' | 'swap' | 'pickup' | 'callout' | 'assign'
export type RequestStatus = 'posted' | 'pending_partner' | 'pending' | 'approved' | 'denied' | 'declined' | 'cancelled'

export interface ShiftRequest {
  id: string
  type: RequestType
  status: RequestStatus
  shift_id: string
  swap_shift_id: string | null
  requester_id: string
  target_id: string | null
  claimant_id: string | null
  previous_employee_id: string | null
  note: string | null
  decision_note: string | null
  override_reason: string | null
  ot_warnings: string[] | null
  decided_by: string | null
  decided_at: string | null
  created_at: string
  updated_at: string
}
