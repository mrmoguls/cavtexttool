import { DEMO_DRIVERS, DEMO_ANNOUNCEMENTS, DEMO_VIEWS, DEMO_MESSAGES } from './demo-data'
import type { Driver, Announcement, AnnouncementView, Message } from '../types'

type Listener = () => void

class DemoStore {
  drivers: Driver[] = [...DEMO_DRIVERS]
  announcements: Announcement[] = [...DEMO_ANNOUNCEMENTS]
  views: AnnouncementView[] = [...DEMO_VIEWS]
  messages: Message[] = [...DEMO_MESSAGES]

  private listeners = new Set<Listener>()

  subscribe(fn: Listener) {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  private notify() {
    this.listeners.forEach(fn => fn())
  }

  addDriver(name: string): Driver {
    const d: Driver = { id: `d-${Date.now()}`, name, created_at: new Date().toISOString() }
    this.drivers.push(d)
    this.drivers.sort((a, b) => a.name.localeCompare(b.name))
    this.notify()
    return d
  }

  removeDriver(id: string) {
    this.drivers = this.drivers.filter(d => d.id !== id)
    this.messages = this.messages.filter(m => m.driver_id !== id)
    this.views = this.views.filter(v => v.driver_id !== id)
    this.notify()
  }

  addAnnouncement(ann: Omit<Announcement, 'id' | 'created_at' | 'created_by'>): Announcement {
    const a: Announcement = { ...ann, id: `a-${Date.now()}`, created_at: new Date().toISOString(), created_by: 'dispatch' }
    this.announcements.unshift(a)
    this.notify()
    return a
  }

  markViewed(announcementId: string, driverId: string) {
    if (this.views.find(v => v.announcement_id === announcementId && v.driver_id === driverId)) return
    this.views.push({
      id: `v-${Date.now()}`,
      announcement_id: announcementId,
      driver_id: driverId,
      viewed_at: new Date().toISOString(),
      acknowledged_at: null,
    })
    this.notify()
  }

  acknowledge(announcementId: string, driverId: string) {
    const existing = this.views.find(v => v.announcement_id === announcementId && v.driver_id === driverId)
    if (existing) {
      existing.acknowledged_at = new Date().toISOString()
    } else {
      this.views.push({
        id: `v-${Date.now()}`,
        announcement_id: announcementId,
        driver_id: driverId,
        viewed_at: new Date().toISOString(),
        acknowledged_at: new Date().toISOString(),
      })
    }
    this.notify()
  }

  sendMessage(driverId: string, sender: 'driver' | 'dispatch', body: string): Message {
    const m: Message = {
      id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      driver_id: driverId,
      sender,
      body,
      created_at: new Date().toISOString(),
      read_at: null,
    }
    this.messages.push(m)
    this.notify()
    return m
  }

  markMessagesRead(driverId: string, senderToMark: 'driver' | 'dispatch') {
    const now = new Date().toISOString()
    this.messages.forEach(m => {
      if (m.driver_id === driverId && m.sender === senderToMark && !m.read_at) {
        m.read_at = now
      }
    })
    this.notify()
  }

  getDriverMessages(driverId: string): Message[] {
    return this.messages.filter(m => m.driver_id === driverId).sort((a, b) => a.created_at.localeCompare(b.created_at))
  }

  getUnreadCountForDriver(driverId: string): number {
    return this.messages.filter(m => m.driver_id === driverId && m.sender === 'dispatch' && !m.read_at).length
  }

  getUnreadCountForDispatch(): number {
    return this.messages.filter(m => m.sender === 'driver' && !m.read_at).length
  }

  getLatestMessagePerDriver(): Message[] {
    const sorted = [...this.messages].sort((a, b) => b.created_at.localeCompare(a.created_at))
    const seen = new Set<string>()
    const result: Message[] = []
    for (const m of sorted) {
      if (!seen.has(m.driver_id)) { seen.add(m.driver_id); result.push(m) }
    }
    return result
  }
}

export const demoStore = new DemoStore()
