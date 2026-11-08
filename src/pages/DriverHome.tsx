import { useEffect, useState } from 'react'
import { useData } from '../lib/data-context'
import { setAppBadge, useOpenFromNotification } from '../lib/push'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { TopBar } from '../components/ui/TopBar'
import { TabBar } from '../components/ui/TabBar'
import { EmptyState } from '../components/ui/EmptyState'
import { DriverMessages } from './DriverMessages'
import { DriverSchedule } from './driver/DriverSchedule'
import { DriverToday } from './driver/DriverToday'
import { DriverBoard, useTradeOffers } from './driver/DriverBoard'
import { Notifications, BellButton, bellCount, type AttentionItem } from './Notifications'
import { useStartsToConfirm } from '../components/schedule/ConfirmStart'
import type { Employee } from '../types'
import { MessageSquare, Megaphone, CheckCircle, Play, CalendarDays, Repeat, House } from 'lucide-react'

interface DriverHomeProps {
  driver: Employee
  onSignOut: () => void
  /** Shown for drivers who also dispatch. */
  onSwitch?: () => void
}

export function DriverHome({ driver, onSignOut, onSwitch }: DriverHomeProps) {
  const [tab, setTab] = useState<'home' | 'schedule' | 'board' | 'feed' | 'messages'>('home')
  const [showNotifications, setShowNotifications] = useState(false)
  const [acknowledging, setAcknowledging] = useState<string | null>(null)

  const data = useData()
  const { announcements, views } = data
  const driverViews = views.filter(v => v.driver_id === driver.id)
  const unreadMessages = data.getUnreadForDriver(driver.id)
  const tradeOffers = useTradeOffers(driver.id)
  const toConfirm = useStartsToConfirm(driver.id)

  // Tapping a phone notification opens the matching screen.
  useOpenFromNotification(target => {
    if (target === 'notifications') { setShowNotifications(true); return }
    setShowNotifications(false)
    if (target === 'messages' || target === 'feed' || target === 'board' || target === 'schedule' || target === 'home') setTab(target)
  })

  const getView = (id: string) => driverViews.find(v => v.announcement_id === id)

  async function handleAcknowledge(annId: string) {
    setAcknowledging(annId)
    await data.acknowledge(annId, driver.id)
    setAcknowledging(null)
  }

  const pendingAcks = announcements.filter(a => {
    if (!a.requires_ack) return false
    const v = getView(a.id)
    return !v?.acknowledged_at
  })

  const go = (t: typeof tab) => () => { setShowNotifications(false); setTab(t) }
  const attention: AttentionItem[] = [
    { key: 'confirm', label: toConfirm.length === 1 ? 'Start time to confirm' : 'Start times to confirm', count: toConfirm.length, onOpen: go('home') },
    { key: 'board', label: tradeOffers.length === 1 ? 'Shift trade offer for you' : 'Shift trade offers for you', count: tradeOffers.length, onOpen: go('board') },
    { key: 'feed', label: 'Announcements to acknowledge', count: pendingAcks.length, onOpen: go('feed') },
    { key: 'messages', label: unreadMessages === 1 ? 'Unread message' : 'Unread messages', count: unreadMessages, onOpen: go('messages') },
  ]

  const bell = bellCount(data.unreadNotifications, attention)
  useEffect(() => { setAppBadge(bell) }, [bell])

  const tabs = [
    { key: 'home', label: 'Home', icon: <House size={20} />, badge: toConfirm.length },
    { key: 'schedule', label: 'Schedule', icon: <CalendarDays size={20} /> },
    { key: 'board', label: 'Board', icon: <Repeat size={20} />, badge: tradeOffers.length },
    { key: 'feed', label: 'News', icon: <Megaphone size={20} />, badge: pendingAcks.length },
    { key: 'messages', label: 'Messages', icon: <MessageSquare size={20} />, badge: unreadMessages },
  ]

  return (
    <div className="app-shell bg-[#EEF1F8] flex flex-col overflow-hidden">
      <TopBar
        greeting={`Good to see you, ${driver.name.split(' ')[0]}`}
        right={
          <div className="flex items-center gap-3">
            <BellButton count={bell} onClick={() => setShowNotifications(true)} />
            {onSwitch && (
              <button onClick={onSwitch} className="text-xs font-semibold text-white bg-white/15 rounded-lg px-2 py-1">Dispatch</button>
            )}
            <button onClick={onSignOut} className="text-xs text-white/60 underline underline-offset-2">
              Not you?
            </button>
          </div>
        }
      />

      <div className="app-main flex-1 min-h-0 overflow-hidden flex flex-col">
        {showNotifications ? (
          <Notifications onBack={() => setShowNotifications(false)} attention={attention} />
        ) : tab === 'home' ? (
          <DriverToday driver={driver} onOpenBoard={() => setTab('board')} onMessageDispatch={() => setTab('messages')} />
        ) : tab === 'schedule' ? (
          <DriverSchedule driver={driver} onMessageDispatch={() => setTab('messages')} />
        ) : tab === 'board' ? (
          <DriverBoard driver={driver} />
        ) : tab === 'feed' ? (
          <div className="flex-1 overflow-y-auto scroll-area scrollbar-hide px-4 py-4 space-y-3">
            {pendingAcks.length > 0 && (
              <div className="bg-[#FCE9E9] border border-[#CC2A2A]/20 rounded-2xl p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#CC2A2A] flex items-center justify-center text-white text-sm font-bold">
                  {pendingAcks.length}
                </div>
                <p className="text-sm text-[#1B2E6B] font-medium">
                  {pendingAcks.length === 1
                    ? '1 item needs your acknowledgment'
                    : `${pendingAcks.length} items need your acknowledgment`}
                </p>
              </div>
            )}

            {announcements.length === 0 ? (
              <EmptyState icon={<Megaphone />} title="No announcements yet" body="Check back soon. Dispatch will post updates here." />
            ) : (
              announcements.map(ann => {
                const view = getView(ann.id)
                const seen = !!view
                const acked = !!view?.acknowledged_at
                const needsAck = ann.requires_ack && !acked

                // Mark as viewed
                if (!seen) setTimeout(() => data.markViewed(ann.id, driver.id), 100)

                return (
                  <Card key={ann.id} className={needsAck ? 'border-2 border-[#CC2A2A]/40' : ''}>
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {needsAck && <Badge variant="amber">⚠ Acknowledge required</Badge>}
                          {acked && <Badge variant="sage"><CheckCircle size={11} /> Acknowledged</Badge>}
                          {!ann.requires_ack && seen && <Badge variant="muted">Seen ✓</Badge>}
                        </div>
                        <span className="text-[10px] text-[#6B7A99] whitespace-nowrap flex-shrink-0">
                          {formatRelative(ann.created_at)}
                        </span>
                      </div>

                      <div>
                        <h3 className="font-semibold text-[#0B1A5C] text-base leading-snug">{ann.title}</h3>
                        <p className="text-sm text-[#1B2E6B] mt-1 leading-relaxed whitespace-pre-wrap">{ann.body}</p>
                      </div>

                      {ann.image_url && (
                        <img src={ann.image_url} alt="" className="w-full rounded-xl object-cover max-h-48" />
                      )}

                      {ann.video_url && (
                        <a href={ann.video_url} target="_blank" rel="noreferrer"
                          className="flex items-center gap-3 bg-[#EEF1F8] rounded-xl p-3 group">
                          <div className="w-10 h-10 rounded-full bg-[#CC2A2A] flex items-center justify-center flex-shrink-0">
                            <Play size={16} className="text-white ml-0.5" fill="white" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-[#0B1A5C]">Watch training video</p>
                            <p className="text-xs text-[#6B7A99]">Opens in browser</p>
                          </div>
                        </a>
                      )}

                      {needsAck && (
                        <Button fullWidth size="lg" onClick={() => handleAcknowledge(ann.id)}
                          disabled={acknowledging === ann.id}>
                          {acknowledging === ann.id ? 'Confirming…' : ann.video_url ? "I've Watched This" : 'I Acknowledge This'}
                        </Button>
                      )}
                    </div>
                  </Card>
                )
              })
            )}
          </div>
        ) : (
          <DriverMessages driver={driver} />
        )}
      </div>

      <TabBar tabs={tabs} active={tab} onChange={k => { setShowNotifications(false); setTab(k as typeof tab) }} />
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
