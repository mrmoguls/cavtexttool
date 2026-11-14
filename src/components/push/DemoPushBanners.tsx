import { useEffect, useState } from 'react'
import { isDemoMode } from '../../lib/supabase'
import { onDemoPush, type DemoPush } from '../../lib/push'
import logo from '../../assets/logo.png'
import { X } from 'lucide-react'

const SHOW_MS = 7000

/**
 * Demo only: shows each phone notification the live app would send as a banner at the top of the
 * screen. Your own notifications open the matching screen when tapped; ones sent to other people
 * say whose phone they went to, so one person can see the whole flow.
 */
export function DemoPushBanners({ meId }: { meId: string | null }) {
  const [items, setItems] = useState<DemoPush[]>([])

  useEffect(() => {
    if (!isDemoMode) return
    return onDemoPush(p => {
      setItems(list => {
        // The same notification to several people (e.g. an open shift) shows as one banner.
        const same = list.find(x => x.title === p.title && x.body === p.body)
        if (same) return list.map(x => x === same ? { ...x, to: [...x.to, ...p.to.filter(t => !x.to.some(y => y.id === t.id))] } : x)
        setTimeout(() => setItems(l => l.filter(x => x.id !== p.id)), SHOW_MS)
        return [p, ...list].slice(0, 3)
      })
      // A real browser notification too, for your own, where the browser allows it.
      try {
        if (meId && p.to.some(t => t.id === meId) && 'Notification' in window && Notification.permission === 'granted') {
          new Notification(p.title, { body: p.body, icon: logo, tag: p.id })
        }
      } catch { /* banners only */ }
    })
  }, [meId])

  if (!isDemoMode || items.length === 0) return null

  return (
    <div className="no-print fixed top-0 inset-x-0 z-50 pointer-events-none flex flex-col items-center gap-2 px-2 pt-[max(8px,env(safe-area-inset-top))]">
      {items.map(p => {
        const mine = !!meId && p.to.some(t => t.id === meId)
        const others = p.to.filter(t => t.id !== meId)
        const toLabel = mine
          ? (others.length ? `You and ${others.length} other${others.length === 1 ? '' : 's'}` : null)
          : others.length === 1 ? `Sent to ${others[0].name}'s phone`
            : others.length <= 3 ? `Sent to ${others.map(o => o.name.split(' ')[0]).join(', ')}` : `Sent to ${others.length} phones`
        return (
          <div key={p.id} role="status"
            className="pointer-events-auto w-full max-w-md bg-white/95 backdrop-blur rounded-2xl shadow-[0_8px_30px_rgba(11,26,92,0.25)] border border-[#D8DFEF] px-3 py-2.5 flex gap-3 items-start animate-[slidein_.25s_ease-out]">
            <img src={logo} alt="" className="w-9 h-9 rounded-lg object-contain bg-[#0B1A5C] p-0.5 flex-shrink-0" />
            <button className="flex-1 min-w-0 text-left" onClick={() => {
              if (mine) window.dispatchEvent(new CustomEvent('cav-open', { detail: p.open }))
              setItems(list => list.filter(x => x.id !== p.id))
            }}>
              <p className="text-[11px] text-[#6B7A99]">CAV Hub · now{toLabel ? <> · <span className="font-semibold text-[#1B2E6B]">{toLabel}</span></> : null}</p>
              <p className="text-sm font-semibold text-[#0B1A5C] leading-snug">{p.title}</p>
              {p.body && <p className="text-sm text-[#1B2E6B] leading-snug line-clamp-2">{p.body}</p>}
            </button>
            <button aria-label="Dismiss notification" className="p-1 text-[#6B7A99]" onClick={() => setItems(list => list.filter(x => x.id !== p.id))}><X size={14} /></button>
          </div>
        )
      })}
    </div>
  )
}
