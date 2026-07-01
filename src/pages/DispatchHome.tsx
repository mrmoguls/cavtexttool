import { useState } from 'react'
import { clearDispatchAuth } from '../lib/storage'
import { useData } from '../lib/data-context'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { TopBar } from '../components/ui/TopBar'
import { TabBar } from '../components/ui/TabBar'
import { EmptyState } from '../components/ui/EmptyState'
import { DispatchCompose } from './DispatchCompose'
import { DispatchThread } from './DispatchThread'
import { DispatchRoster } from './DispatchRoster'
import type { Announcement, Driver } from '../types'
import { Megaphone, MessageSquare, Users, Plus, ChevronRight, CheckCircle, Clock } from 'lucide-react'

interface DispatchHomeProps {
  onSignOut: () => void
}

export function DispatchHome({ onSignOut }: DispatchHomeProps) {
  const [tab, setTab] = useState<'announcements' | 'inbox' | 'roster'>('announcements')
  const [composing, setComposing] = useState(false)
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null)
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null)

  const data = useData()
  const { announcements, views, drivers, latestMessages, unreadDispatch } = data

  function handleSignOut() {
    clearDispatchAuth()
    onSignOut()
  }

  if (composing) {
    return <DispatchCompose onDone={() => setComposing(false)} onCancel={() => setComposing(false)} />
  }

  if (selectedAnnouncement) {
    return (
      <AckDetail
        announcement={selectedAnnouncement}
        drivers={drivers}
        views={views.filter(v => v.announcement_id === selectedAnnouncement.id)}
        onBack={() => setSelectedAnnouncement(null)}
      />
    )
  }

  if (selectedDriver) {
    return <DispatchThread driver={selectedDriver} onBack={() => setSelectedDriver(null)} />
  }

  const tabs = [
    { key: 'announcements', label: 'Posts', icon: <Megaphone size={20} /> },
    { key: 'inbox', label: 'Inbox', icon: <MessageSquare size={20} />, badge: unreadDispatch },
    { key: 'roster', label: 'Roster', icon: <Users size={20} /> },
  ]

  return (
    <div className="min-h-svh bg-[#EEF1F8] flex flex-col">
      <TopBar
        title="Dispatch"
        right={
          <button onClick={handleSignOut} className="text-xs text-white/60 underline underline-offset-2">
            Sign out
          </button>
        }
      />

      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === 'announcements' && (
          <div className="flex-1 overflow-y-auto scroll-area scrollbar-hide px-4 py-4 space-y-3">
            <Button fullWidth size="lg" onClick={() => setComposing(true)}>
              <Plus size={18} /> New Announcement
            </Button>

            {announcements.length === 0 ? (
              <EmptyState icon={<Megaphone />} title="No announcements yet" body="Post your first announcement above." />
            ) : (
              announcements.map(ann => {
                const annViews = views.filter(v => v.announcement_id === ann.id)
                const viewedCount = annViews.length
                const ackedCount = annViews.filter(v => v.acknowledged_at).length
                const total = drivers.length

                return (
                  <Card key={ann.id} onClick={() => setSelectedAnnouncement(ann)}>
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap gap-1">
                          {ann.requires_ack && <Badge variant="amber">Ack required</Badge>}
                        </div>
                        <ChevronRight size={16} className="text-[#6B7A99] flex-shrink-0 mt-0.5" />
                      </div>

                      <div>
                        <h3 className="font-semibold text-[#0B1A5C]">{ann.title}</h3>
                        <p className="text-sm text-[#6B7A99] mt-0.5 line-clamp-2">{ann.body}</p>
                      </div>

                      <div className="flex items-center gap-3 pt-1">
                        <div className="flex items-center gap-1.5 text-xs text-[#6B7A99]">
                          <CheckCircle size={12} className="text-[#2E7D52]" />
                          {viewedCount}/{total} seen
                        </div>
                        {ann.requires_ack && (
                          <div className="flex items-center gap-1.5 text-xs text-[#6B7A99]">
                            <Clock size={12} className="text-[#CC2A2A]" />
                            {ackedCount}/{total} acknowledged
                          </div>
                        )}
                        <span className="text-xs text-[#6B7A99] ml-auto">
                          {formatRelative(ann.created_at)}
                        </span>
                      </div>

                      {ann.requires_ack && (
                        <div className="h-1.5 bg-[#EEF1F8] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#2E7D52] rounded-full transition-all duration-500"
                            style={{ width: total > 0 ? `${(ackedCount / total) * 100}%` : '0%' }}
                          />
                        </div>
                      )}
                    </div>
                  </Card>
                )
              })
            )}
          </div>
        )}

        {tab === 'inbox' && (
          <div className="flex-1 overflow-y-auto scroll-area scrollbar-hide px-4 py-4 space-y-2">
            {drivers.length === 0 ? (
              <EmptyState icon={<MessageSquare />} title="No drivers yet" body="Add drivers in the Roster tab." />
            ) : (
              drivers.map(driver => {
                const latest = latestMessages.find(m => m.driver_id === driver.id)
                const hasUnread = latestMessages.some(m => m.driver_id === driver.id && m.sender === 'driver' && !m.read_at)

                return (
                  <Card key={driver.id} onClick={() => setSelectedDriver(driver)}>
                    <div className="flex items-center gap-3">
                      <div className="relative flex-shrink-0">
                        <div className="w-10 h-10 rounded-full bg-[#FCE9E9] flex items-center justify-center text-[#CC2A2A] font-semibold">
                          {driver.name.charAt(0).toUpperCase()}
                        </div>
                        {hasUnread && (
                          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-[#CC2A2A] rounded-full border-2 border-[#FFFFFF]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className={`text-sm ${hasUnread ? 'font-semibold text-[#0B1A5C]' : 'font-medium text-[#1B2E6B]'}`}>
                            {driver.name}
                          </p>
                          {latest && (
                            <span className="text-[10px] text-[#6B7A99] flex-shrink-0">{formatRelative(latest.created_at)}</span>
                          )}
                        </div>
                        <p className="text-xs text-[#6B7A99] truncate mt-0.5">
                          {latest
                            ? `${latest.sender === 'driver' ? '' : 'You: '}${latest.body}`
                            : 'No messages yet'}
                        </p>
                      </div>
                    </div>
                  </Card>
                )
              })
            )}
          </div>
        )}

        {tab === 'roster' && <DispatchRoster />}
      </div>

      <TabBar tabs={tabs} active={tab} onChange={k => setTab(k as typeof tab)} />
    </div>
  )
}

function AckDetail({
  announcement, drivers, views, onBack,
}: {
  announcement: Announcement
  drivers: Driver[]
  views: { driver_id: string; viewed_at: string; acknowledged_at?: string | null }[]
  onBack: () => void
}) {
  const ackedIds = new Set(views.filter(v => v.acknowledged_at).map(v => v.driver_id))
  const viewedIds = new Set(views.map(v => v.driver_id))

  const pending = drivers.filter(d => !ackedIds.has(d.id))
  const done = drivers.filter(d => ackedIds.has(d.id))

  return (
    <div className="min-h-svh bg-[#EEF1F8] flex flex-col">
      <div className="bg-[#FFFFFF] border-b border-[#D8DFEF] px-4 py-3 safe-top">
        <button onClick={onBack} className="text-sm text-[#CC2A2A] font-medium">← Back</button>
        <h2 className="font-semibold text-[#0B1A5C] mt-1">{announcement.title}</h2>
        <p className="text-xs text-[#6B7A99]">{announcement.requires_ack ? 'Acknowledgment required' : 'View tracking'}</p>
      </div>

      <div className="flex-1 overflow-y-auto scroll-area scrollbar-hide px-4 py-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <p className="text-2xl font-bold text-[#2E7D52]">{done.length}/{drivers.length}</p>
            <p className="text-xs text-[#6B7A99] mt-0.5">{announcement.requires_ack ? 'Acknowledged' : 'Seen'}</p>
          </Card>
          <Card>
            <p className="text-2xl font-bold text-[#CC2A2A]">{pending.length}</p>
            <p className="text-xs text-[#6B7A99] mt-0.5">Outstanding</p>
          </Card>
        </div>

        <div className="h-2 bg-[#D8DFEF] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#2E7D52] rounded-full transition-all duration-500"
            style={{ width: drivers.length > 0 ? `${(done.length / drivers.length) * 100}%` : '0%' }}
          />
        </div>

        {pending.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[#CC2A2A] uppercase tracking-wide mb-2">Outstanding ({pending.length})</p>
            <div className="space-y-2">
              {pending.map(d => (
                <Card key={d.id}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#FCE9E9] flex items-center justify-center text-[#CC2A2A] font-semibold text-sm">
                      {d.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#0B1A5C]">{d.name}</p>
                      <p className="text-xs text-[#6B7A99]">
                        {viewedIds.has(d.id) ? 'Viewed, not acknowledged' : 'Not yet opened'}
                      </p>
                    </div>
                    <Clock size={14} className="text-[#CC2A2A]" />
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {done.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[#2E7D52] uppercase tracking-wide mb-2">Completed ({done.length})</p>
            <div className="space-y-2">
              {done.map(d => {
                const view = views.find(v => v.driver_id === d.id)
                return (
                  <Card key={d.id}>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#E8F5EE] flex items-center justify-center text-[#2E7D52] font-semibold text-sm">
                        {d.name.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-[#0B1A5C]">{d.name}</p>
                        <p className="text-xs text-[#6B7A99]">
                          {view?.acknowledged_at ? `Acknowledged ${formatRelative(view.acknowledged_at)}` : ''}
                        </p>
                      </div>
                      <CheckCircle size={16} className="text-[#2E7D52]" />
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function formatRelative(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}
