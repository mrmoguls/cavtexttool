import { useState } from 'react'
import { isDemoMode } from '../../lib/supabase'
import { turnOffPush, turnOnPush, usePushStatus } from '../../lib/push'
import { Button } from '../ui/Button'
import { BellRing, Share } from 'lucide-react'

const DISMISS_KEY = 'cav-push-dismissed-at'
const DISMISS_DAYS = 7

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) || 0)
    return Date.now() - at < DISMISS_DAYS * 86_400_000
  } catch { return false }
}

/**
 * "Turn on notifications" for this phone.
 * - `prompt` (home screens): only shows while it can be turned on, and can be put off for a week.
 * - `settings` (Notifications screen): always shows what's going on with this phone.
 */
export function PushCard({ variant = 'prompt' }: { variant?: 'prompt' | 'settings' }) {
  const [status, setStatus] = usePushStatus()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState(() => variant === 'prompt' && dismissedRecently())
  const [justTurnedOn, setJustTurnedOn] = useState(false)

  if (!status || hidden) return null
  if (variant === 'prompt' && !(status === 'off' || status === 'needs-install' || justTurnedOn)) return null
  if (variant === 'settings' && (status === 'not-configured')) return null

  async function on() {
    setBusy(true); setError(null)
    try {
      const s = await turnOnPush()
      setStatus(s)
      if (s === 'on') setJustTurnedOn(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn on notifications.')
    } finally { setBusy(false) }
  }
  async function off() {
    setBusy(true)
    try { await turnOffPush(); setStatus('off'); setJustTurnedOn(false) } finally { setBusy(false) }
  }
  function later() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* fine */ }
    setHidden(true)
  }

  const shell = 'rounded-2xl p-4 flex items-start gap-3'
  const icon = <BellRing size={18} className="flex-shrink-0 mt-0.5 text-[#CC2A2A]" />

  if (status === 'on') {
    return (
      <div className={`${shell} bg-[#E7F4EC] border border-[#2E7D52]/30`}>
        <BellRing size={18} className="flex-shrink-0 mt-0.5 text-[#2E7D52]" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-[#0B1A5C]">Notifications are on for this phone</p>
          <p className="text-xs text-[#6B7A99] mt-0.5">
            {isDemoMode ? 'Demo: nothing is actually sent.' : "You'll get start times, shift changes and messages even when the app is closed."}
          </p>
          {variant === 'settings' && <Button size="sm" variant="ghost" className="mt-1 -ml-2" onClick={off} disabled={busy}>Turn off</Button>}
        </div>
      </div>
    )
  }

  if (status === 'needs-install') {
    return (
      <div className={`${shell} bg-[#FFFFFF] border border-[#D8DFEF]`}>
        {icon}
        <div className="flex-1">
          <p className="text-sm font-semibold text-[#0B1A5C]">Get notifications on your iPhone</p>
          <p className="text-xs text-[#1B2E6B] mt-1 leading-relaxed">
            iPhones only send notifications to apps on the Home Screen. Tap <Share size={12} className="inline -mt-0.5" /> <b>Share</b> at the bottom of Safari,
            then <b>Add to Home Screen</b>. Open CAV Hub from the new icon and turn notifications on there.
          </p>
          {variant === 'prompt' && <Button size="sm" variant="ghost" className="mt-1 -ml-2" onClick={later}>Not now</Button>}
        </div>
      </div>
    )
  }

  if (status === 'denied') {
    return (
      <div className={`${shell} bg-[#FFFFFF] border border-[#D8DFEF]`}>
        {icon}
        <div className="flex-1">
          <p className="text-sm font-semibold text-[#0B1A5C]">Notifications are blocked on this phone</p>
          <p className="text-xs text-[#1B2E6B] mt-1">Turn them on in your phone's Settings → Notifications → CAV Hub (or in the browser's site settings), then come back.</p>
        </div>
      </div>
    )
  }

  if (status === 'unsupported') {
    return <p className="text-xs text-[#6B7A99] px-1">This browser can't show notifications. Open CAV Hub in Chrome (Android) or from the Home Screen (iPhone).</p>
  }

  return (
    <div className={`${shell} bg-[#FCE9E9] border border-[#E03A3A]/30`}>
      {icon}
      <div className="flex-1">
        <p className="text-sm font-semibold text-[#0B1A5C]">Turn on notifications</p>
        <p className="text-xs text-[#6B7A99] mt-0.5">Get start times to confirm, shift changes and messages on your phone, even when the app is closed.</p>
        {error && <p className="text-xs text-[#CC2A2A] mt-1">{error}</p>}
        <div className="flex gap-2 mt-2">
          <Button size="sm" onClick={on} disabled={busy}>{busy ? 'Turning on…' : 'Turn on'}</Button>
          {variant === 'prompt' && <Button size="sm" variant="ghost" onClick={later}>Not now</Button>}
        </div>
      </div>
    </div>
  )
}
