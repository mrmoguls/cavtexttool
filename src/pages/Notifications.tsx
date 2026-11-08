import { useEffect, useRef } from 'react'
import { useData } from '../lib/data-context'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { ScrollBody, SubHeader } from '../components/ui/Form'
import { Bell, ChevronRight } from 'lucide-react'
import { PushCard } from '../components/push/PushCard'

/** Something waiting on you elsewhere in the app (the same things that put a red bubble on a tab). */
export interface AttentionItem { key: string; label: string; count: number; onOpen: () => void }

export function Notifications({ onBack, attention = [] }: { onBack: () => void; attention?: AttentionItem[] }) {
  const data = useData()
  const { notifications, markNotificationsRead } = data
  const unreadIds = notifications.filter(n => !n.read_at).map(n => n.id)
  const key = unreadIds.join(',')
  const waiting = attention.filter(a => a.count > 0)
  const markRef = useRef(markNotificationsRead)
  markRef.current = markNotificationsRead

  // Opening the list marks everything as read.
  useEffect(() => {
    if (key) markRef.current(key.split(','))
  }, [key])

  return (
    <>
      <SubHeader title="Notifications" onBack={onBack} />
      <ScrollBody>
        <PushCard variant="settings" />
        {waiting.length > 0 && (
          <Card className="space-y-1 border-2 border-[#CC2A2A]/30">
            <p className="font-semibold text-[#0B1A5C]">Needs your attention</p>
            {waiting.map(a => (
              <button key={a.key} onClick={a.onOpen} className="w-full flex items-center gap-3 py-2 border-t border-[#D8DFEF] first-of-type:border-t-0 text-left">
                <span className="bg-[#CC2A2A] text-white text-xs font-bold rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center">{a.count}</span>
                <span className="flex-1 text-sm font-medium text-[#1B2E6B]">{a.label}</span>
                <ChevronRight size={16} className="text-[#6B7A99]" />
              </button>
            ))}
          </Card>
        )}
        {notifications.length === 0 && waiting.length === 0 && (
          <EmptyState icon={<Bell />} title="Nothing yet" body="Start times, schedule changes and shift updates will show up here." />
        )}
        {notifications.length > 0 && waiting.length > 0 && <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7A99] px-1 pt-1">Notifications</p>}
        {notifications.map(n => (
          <Card key={n.id}>
            <div className="flex items-start gap-3">
              <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${n.read_at ? 'bg-transparent' : 'bg-[#CC2A2A]'}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[#0B1A5C]">{n.title}</p>
                {n.body && <p className="text-sm text-[#1B2E6B] mt-0.5">{n.body}</p>}
                <p className="text-xs text-[#6B7A99] mt-1">
                  {new Date(n.created_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </ScrollBody>
    </>
  )
}

export function BellButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="relative p-1.5 rounded-lg text-white/80 hover:text-white" aria-label={count ? `Notifications, ${count} need attention` : 'Notifications'}>
      <Bell size={20} />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 bg-[#CC2A2A] text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  )
}

/** Bell total: unread notifications plus everything waiting elsewhere, so the top red dot matches the tab bubbles. */
export function bellCount(unread: number, attention: AttentionItem[]) {
  return unread + attention.reduce((n, a) => n + Math.max(0, a.count), 0)
}
