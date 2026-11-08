import type { Employee, EmployeeContact, Announcement, AnnouncementView, LineAssignment, Message } from '../types'

type DemoEmployee = Employee & { phone: string }
const emp = (
  id: string, name: string, role: Employee['role'], employment_type: Employee['employment_type'],
  seniority_date: string, gurney_qualified: boolean, phone: string, hire_seq: number | null = null,
): DemoEmployee => ({
  id, name, role, employment_type, seniority_date, hire_seq, gurney_qualified, phone,
  active: true, created_at: '2025-06-01T08:00:00Z',
})

// Demo PIN = last 4 digits of the phone number.
const DEMO_EMPLOYEE_ROWS: DemoEmployee[] = [
  emp('e-admin', 'Pat Morgan', 'admin', 'FT', '2012-01-09', false, '(530) 555-0100'),
  emp('e-disp', 'Dana Reyes', 'dispatcher', 'FT', '2016-05-02', false, '(530) 555-0101'),
  emp('d1', 'Marcus Johnson', 'driver', 'FT', '2015-03-02', true, '(530) 555-0111'),
  emp('d2', 'Sarah Chen', 'driver', 'FT', '2017-06-12', false, '(530) 555-0112'),
  emp('d3', 'James Williams', 'driver', 'FT', '2019-01-07', true, '(530) 555-0113'),
  emp('d4', 'Rosa Martinez', 'driver', 'PT', '2018-04-09', false, '(530) 555-0114', 1),
  emp('d5', 'David Thompson', 'driver', 'PT', '2018-04-09', true, '(530) 555-0115', 2),
  emp('d6', 'Linda Baker', 'driver', 'PT', '2021-02-01', false, '(530) 555-0116'),
  emp('d7', 'Kevin Wright', 'driver', 'PT', '2022-05-23', false, '(530) 555-0117'),
  emp('d8', 'Angela Davis', 'attendant', 'FT', '2019-09-30', false, '(530) 555-0118'),
  emp('d9', 'Mike Patterson', 'attendant', 'PT', '2023-03-13', false, '(530) 555-0119'),
  emp('d10', 'Teresa Gonzalez', 'driver', 'PT', '2024-01-08', false, '(530) 555-0120'),
]

export const DEMO_EMPLOYEES: Employee[] = DEMO_EMPLOYEE_ROWS.map(({ phone: _phone, ...e }) => e)
export const DEMO_CONTACTS: EmployeeContact[] = DEMO_EMPLOYEE_ROWS.map(e => ({ employee_id: e.id, phone: e.phone }))

// Some lines are held, some aren't — so the coverage view shows both green and red.
const held: [string, string][] = [
  ['FT1', 'd2'], ['PT5', 'd1'], ['PT1', 'd4'], ['PT2', 'd6'], ['PT4', 'd5'], ['A1', 'd8'], ['FLEX', 'd7'],
]
export const DEMO_ASSIGNMENTS: LineAssignment[] = held.map(([code, empId]) => ({
  id: `la-${code}`, line_id: `line-${code}`, employee_id: empId, bid_period_id: null, source: 'manual',
  effective_from: '2026-10-01', effective_to: null, created_by: 'e-admin', created_at: '2026-09-25T17:00:00Z',
}))

const now = Date.now()
const hour = 3600000
const day = 86400000

export const DEMO_ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'a1',
    title: 'New Wheelchair Securement Training',
    body: 'All drivers must complete the updated wheelchair securement training video by end of week. This covers the new Q\'Straint system we\'re rolling out across the fleet.\n\nPlease watch the full video and acknowledge below.',
    video_url: 'https://www.youtube.com/watch?v=example',
    image_url: null,
    requires_ack: true,
    created_at: new Date(now - 2 * hour).toISOString(),
    created_by: 'dispatch',
  },
  {
    id: 'a2',
    title: 'Schedule Change — Friday July 4th',
    body: 'We\'ll be running a reduced schedule on Friday for the holiday. Check Bambi for your updated assignments by Thursday evening.\n\nIf you have questions about your route, message dispatch directly.',
    image_url: null,
    video_url: null,
    requires_ack: false,
    created_at: new Date(now - 5 * hour).toISOString(),
    created_by: 'dispatch',
  },
  {
    id: 'a3',
    title: 'Reminder: Pre-Trip Inspections',
    body: 'Quick reminder — pre-trip inspections must be logged before your first pickup every morning. We\'ve had a few missed lately. Keep up the good work, team.',
    image_url: null,
    video_url: null,
    requires_ack: false,
    created_at: new Date(now - 1 * day).toISOString(),
    created_by: 'dispatch',
  },
  {
    id: 'a4',
    title: 'HIPAA Refresher — Required',
    body: 'Annual HIPAA refresher is due. Watch the training and acknowledge below. This is required for compliance.',
    video_url: 'https://www.youtube.com/watch?v=hipaa-example',
    image_url: null,
    requires_ack: true,
    created_at: new Date(now - 3 * day).toISOString(),
    created_by: 'dispatch',
  },
]

export const DEMO_VIEWS: AnnouncementView[] = [
  // Wheelchair training — 7 viewed, 4 acknowledged
  { id: 'v1', announcement_id: 'a1', driver_id: 'd1', viewed_at: new Date(now - hour).toISOString(), acknowledged_at: new Date(now - 30 * 60000).toISOString() },
  { id: 'v2', announcement_id: 'a1', driver_id: 'd2', viewed_at: new Date(now - hour).toISOString(), acknowledged_at: new Date(now - 45 * 60000).toISOString() },
  { id: 'v3', announcement_id: 'a1', driver_id: 'd4', viewed_at: new Date(now - hour).toISOString(), acknowledged_at: new Date(now - 50 * 60000).toISOString() },
  { id: 'v4', announcement_id: 'a1', driver_id: 'd6', viewed_at: new Date(now - hour).toISOString(), acknowledged_at: new Date(now - 55 * 60000).toISOString() },
  { id: 'v5', announcement_id: 'a1', driver_id: 'd3', viewed_at: new Date(now - hour).toISOString(), acknowledged_at: null },
  { id: 'v6', announcement_id: 'a1', driver_id: 'd5', viewed_at: new Date(now - 40 * 60000).toISOString(), acknowledged_at: null },
  { id: 'v7', announcement_id: 'a1', driver_id: 'd7', viewed_at: new Date(now - 30 * 60000).toISOString(), acknowledged_at: null },
  // Schedule change — 8 viewed
  { id: 'v10', announcement_id: 'a2', driver_id: 'd1', viewed_at: new Date(now - 4 * hour).toISOString(), acknowledged_at: null },
  { id: 'v11', announcement_id: 'a2', driver_id: 'd2', viewed_at: new Date(now - 4 * hour).toISOString(), acknowledged_at: null },
  { id: 'v12', announcement_id: 'a2', driver_id: 'd3', viewed_at: new Date(now - 3 * hour).toISOString(), acknowledged_at: null },
  { id: 'v13', announcement_id: 'a2', driver_id: 'd4', viewed_at: new Date(now - 3 * hour).toISOString(), acknowledged_at: null },
  { id: 'v14', announcement_id: 'a2', driver_id: 'd5', viewed_at: new Date(now - 3 * hour).toISOString(), acknowledged_at: null },
  { id: 'v15', announcement_id: 'a2', driver_id: 'd6', viewed_at: new Date(now - 2 * hour).toISOString(), acknowledged_at: null },
  { id: 'v16', announcement_id: 'a2', driver_id: 'd8', viewed_at: new Date(now - 2 * hour).toISOString(), acknowledged_at: null },
  { id: 'v17', announcement_id: 'a2', driver_id: 'd9', viewed_at: new Date(now - 2 * hour).toISOString(), acknowledged_at: null },
  // HIPAA — all 10 acknowledged
  ...DEMO_EMPLOYEES.filter(d => d.id.startsWith('d')).map((d, i) => ({
    id: `v20-${i}`,
    announcement_id: 'a4',
    driver_id: d.id,
    viewed_at: new Date(now - 2 * day).toISOString(),
    acknowledged_at: new Date(now - 2 * day + i * hour).toISOString(),
  })),
]

export const DEMO_MESSAGES: Message[] = [
  { id: 'm1', driver_id: 'd1', sender: 'driver' as const, body: 'Hey, my van is making a weird noise on turns. Should I still run my route?', created_at: new Date(now - 3 * hour).toISOString(), read_at: new Date(now - 2.5 * hour).toISOString() },
  { id: 'm2', driver_id: 'd1', sender: 'dispatch' as const, body: 'Bring it in after your 10am pickup. We\'ll swap you to Van 7 for the rest of the day.', created_at: new Date(now - 2.5 * hour).toISOString(), read_at: new Date(now - 2 * hour).toISOString() },
  { id: 'm3', driver_id: 'd1', sender: 'driver' as const, body: 'Sounds good, thanks', created_at: new Date(now - 2 * hour).toISOString(), read_at: new Date(now - 1.5 * hour).toISOString() },
  { id: 'm4', driver_id: 'd2', sender: 'driver' as const, body: 'My 2pm patient cancelled. Want me to take the Cottonwood run instead?', created_at: new Date(now - 1 * hour).toISOString(), read_at: null },
  { id: 'm5', driver_id: 'd4', sender: 'dispatch' as const, body: 'Rosa, you\'re getting a new pickup added at 3:30 on Pine St. Check Bambi.', created_at: new Date(now - 4 * hour).toISOString(), read_at: new Date(now - 3.5 * hour).toISOString() },
  { id: 'm6', driver_id: 'd4', sender: 'driver' as const, body: 'Got it 👍', created_at: new Date(now - 3.5 * hour).toISOString(), read_at: new Date(now - 3 * hour).toISOString() },
]
