import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { isDemoMode, supabase } from './supabase'
import { demoStore } from './demo-store'
import type { Driver, Announcement, AnnouncementView, Message } from '../types'

interface DataAPI {
  drivers: Driver[]
  announcements: Announcement[]
  views: AnnouncementView[]
  messages: Message[]
  latestMessages: Message[]
  unreadDispatch: number

  reload: () => Promise<void>
  addDriver: (name: string) => Promise<void>
  removeDriver: (id: string) => Promise<void>
  addAnnouncement: (ann: { title: string; body: string; image_url?: string | null; video_url?: string | null; requires_ack: boolean }) => Promise<void>
  markViewed: (announcementId: string, driverId: string) => Promise<void>
  acknowledge: (announcementId: string, driverId: string) => Promise<void>
  sendMessage: (driverId: string, sender: 'driver' | 'dispatch', body: string) => Promise<void>
  markMessagesRead: (driverId: string, senderToMark: 'driver' | 'dispatch') => Promise<void>
  getDriverMessages: (driverId: string) => Message[]
  getUnreadForDriver: (driverId: string) => number
}

const DataContext = createContext<DataAPI>(null!)

export function useData() { return useContext(DataContext) }

export function DataProvider({ children }: { children: ReactNode }) {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [views, setViews] = useState<AnnouncementView[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [tick, setTick] = useState(0)

  const syncFromDemo = useCallback(() => {
    setDrivers([...demoStore.drivers])
    setAnnouncements([...demoStore.announcements])
    setViews([...demoStore.views])
    setMessages([...demoStore.messages])
  }, [])

  const reload = useCallback(async () => {
    if (isDemoMode) {
      syncFromDemo()
      return
    }
    const [annRes, viewRes, driverRes, msgRes] = await Promise.all([
      supabase.from('announcements').select('*').order('created_at', { ascending: false }),
      supabase.from('announcement_views').select('*'),
      supabase.from('drivers').select('*').order('name'),
      supabase.from('messages').select('*').order('created_at', { ascending: false }),
    ])
    if (annRes.data) setAnnouncements(annRes.data as Announcement[])
    if (viewRes.data) setViews(viewRes.data as AnnouncementView[])
    if (driverRes.data) setDrivers(driverRes.data as Driver[])
    if (msgRes.data) setMessages(msgRes.data as Message[])
  }, [syncFromDemo])

  // Initial load
  useEffect(() => { reload() }, [reload])

  // Demo mode reactivity
  useEffect(() => {
    if (!isDemoMode) return
    return demoStore.subscribe(() => setTick(t => t + 1))
  }, [])

  // Sync demo state on tick
  useEffect(() => {
    if (isDemoMode && tick > 0) syncFromDemo()
  }, [tick, syncFromDemo])

  // Supabase realtime
  useEffect(() => {
    if (isDemoMode) return
    const tables = ['announcements', 'announcement_views', 'messages', 'drivers'] as const
    const channels = tables.map(table =>
      supabase
        .channel(`realtime:${table}`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, () => reload())
        .subscribe()
    )
    return () => { channels.forEach(ch => supabase.removeChannel(ch)) }
  }, [reload])

  const latestMessages = (() => {
    const sorted = [...messages].sort((a, b) => b.created_at.localeCompare(a.created_at))
    const seen = new Set<string>()
    const result: Message[] = []
    for (const m of sorted) {
      if (!seen.has(m.driver_id)) { seen.add(m.driver_id); result.push(m) }
    }
    return result
  })()

  const unreadDispatch = messages.filter(m => m.sender === 'driver' && !m.read_at).length

  const api: DataAPI = {
    drivers,
    announcements,
    views,
    messages,
    latestMessages,
    unreadDispatch,
    reload,

    addDriver: async (name) => {
      if (isDemoMode) { demoStore.addDriver(name); return }
      await supabase.from('drivers').insert({ name })
      await reload()
    },

    removeDriver: async (id) => {
      if (isDemoMode) { demoStore.removeDriver(id); return }
      await supabase.from('drivers').delete().eq('id', id)
      await reload()
    },

    addAnnouncement: async (ann) => {
      if (isDemoMode) { demoStore.addAnnouncement(ann); return }
      await supabase.from('announcements').insert({ ...ann, created_by: 'dispatch' })
      await reload()
    },

    markViewed: async (announcementId, driverId) => {
      if (isDemoMode) { demoStore.markViewed(announcementId, driverId); return }
      const existing = views.find(v => v.announcement_id === announcementId && v.driver_id === driverId)
      if (existing) return
      await supabase.from('announcement_views').insert({ announcement_id: announcementId, driver_id: driverId })
      await reload()
    },

    acknowledge: async (announcementId, driverId) => {
      if (isDemoMode) { demoStore.acknowledge(announcementId, driverId); return }
      const existing = views.find(v => v.announcement_id === announcementId && v.driver_id === driverId)
      if (existing) {
        await supabase.from('announcement_views').update({ acknowledged_at: new Date().toISOString() }).eq('id', existing.id)
      } else {
        await supabase.from('announcement_views').insert({ announcement_id: announcementId, driver_id: driverId, acknowledged_at: new Date().toISOString() })
      }
      await reload()
    },

    sendMessage: async (driverId, sender, body) => {
      if (isDemoMode) { demoStore.sendMessage(driverId, sender, body); return }
      await supabase.from('messages').insert({ driver_id: driverId, sender, body })
      await reload()
    },

    markMessagesRead: async (driverId, senderToMark) => {
      if (isDemoMode) { demoStore.markMessagesRead(driverId, senderToMark); return }
      await supabase.from('messages').update({ read_at: new Date().toISOString() })
        .eq('driver_id', driverId).eq('sender', senderToMark).is('read_at', null)
      await reload()
    },

    getDriverMessages: (driverId) => {
      return messages.filter(m => m.driver_id === driverId).sort((a, b) => a.created_at.localeCompare(b.created_at))
    },

    getUnreadForDriver: (driverId) => {
      return messages.filter(m => m.driver_id === driverId && m.sender === 'dispatch' && !m.read_at).length
    },
  }

  return <DataContext.Provider value={api}>{children}</DataContext.Provider>
}
