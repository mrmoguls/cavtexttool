export type UserRole = 'driver' | 'dispatch'

export interface Driver {
  id: string
  name: string
  created_at: string
  push_subscription?: string | null
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

export interface AppUser {
  type: 'driver'
  driver: Driver
}
