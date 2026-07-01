import { useState } from 'react'
import { useData } from '../lib/data-context'
import { subscribeToPush, isPushSupported, isStandaloneMode } from '../lib/push'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { TopBar } from '../components/ui/TopBar'
import { TabBar } from '../components/ui/TabBar'
import { EmptyState } from '../components/ui/EmptyState'
import { DriverMessages } from './DriverMessages'
import type { Driver } from '../types'
import { Bell, MessageSquare, Megaphone, CheckCircle, Play } from 'lucide-react'

interface DriverHomeProps {
  driver: Driver
  onSignOut: () => void
}

export function DriverHome({ driver, onSignOut }: DriverHomeProps) {
  const [tab, setTab] = useState<'feed' | 'messages'>('feed')
  const [pushEnabled, setPushEnabled] = useState(false)
  const [acknowledging, setAcknowledging] = useState<string | null>(null)

  const data = useData()
  const { announcements, views } = data
  const driverViews = views.filter(v => v.driver_id === driver.id)
  const unreadMessages = data.getUnreadForDriver(driver.id)

  const getView = (id: string) => driverViews.find(v => v.announcement_id === id)

  async function handleAcknowledge(annId: string) {
    setAcknowledging(annId)
    await data.acknowledge(annId, driver.id)
    setAcknowledging(null)
  }

  async function enablePush() {
    const ok = await subscribeToPush(driver.id)
    setPushEnabled(ok)
  }

  const pendingAcks = announcements.filter(a => {
    if (!a.requires_ack) return false
    const v = getView(a.id)
    return !v?.acknowledged_at
  })

  const tabs = [
    { key: 'feed', label: 'Announcements', icon: <Megaphone size={20} /> },
    { key: 'messages', label: 'Messages', icon: <MessageSquare size={20} />, badge: unreadMessages },
  ]

  return (
    <div className="min-h-svh bg-[#EEF1F8] flex flex-col">
      <TopBar
        greeting={`Good to see you, ${driver.name.split(' ')[0]}`}
        right={
          <button onClick={onSignOut} className="text-xs text-white/60 underline underline-offset-2">
            Not you?
          </button>
        }
      />

      <div className="flex-1 overflow-hidden flex flex-col">
        {tab === 'feed' ? (
          <div className="flex-1 overflow-y-auto scroll-area scrollbar-hide px-4 py-4 space-y-3">
            {!pushEnabled && isPushSupported() && isStandaloneMode() && (
              <div className="bg-[#FCE9E9] border border-[#E03A3A]/30 rounded-2xl p-4 flex items-start gap-3">
                <Bell size={18} className="text-[#CC2A2A] flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-[#0B1A5C]">Enable notifications</p>
                  <p className="text-xs text-[#6B7A99] mt-0.5">Get alerted for new messages even when the app is closed.</p>
                  <Button size="sm" className="mt-2" onClick={enablePush}>Enable</Button>
                </div>
              </div>
            )}

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

      <TabBar tabs={tabs} active={tab} onChange={k => setTab(k as typeof tab)} />
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
