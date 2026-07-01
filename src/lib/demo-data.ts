import type { Driver, Announcement, AnnouncementView, Message } from '../types'

export const DEMO_DRIVERS: Driver[] = [
  { id: 'd1', name: 'Marcus Johnson', created_at: '2025-06-01T08:00:00Z' },
  { id: 'd2', name: 'Sarah Chen', created_at: '2025-06-01T08:00:00Z' },
  { id: 'd3', name: 'James Williams', created_at: '2025-06-01T08:00:00Z' },
  { id: 'd4', name: 'Rosa Martinez', created_at: '2025-06-02T08:00:00Z' },
  { id: 'd5', name: 'David Thompson', created_at: '2025-06-02T08:00:00Z' },
  { id: 'd6', name: 'Linda Baker', created_at: '2025-06-03T08:00:00Z' },
  { id: 'd7', name: 'Kevin Wright', created_at: '2025-06-03T08:00:00Z' },
  { id: 'd8', name: 'Angela Davis', created_at: '2025-06-04T08:00:00Z' },
  { id: 'd9', name: 'Mike Patterson', created_at: '2025-06-04T08:00:00Z' },
  { id: 'd10', name: 'Teresa Gonzalez', created_at: '2025-06-05T08:00:00Z' },
]

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
  ...DEMO_DRIVERS.map((d, i) => ({
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
