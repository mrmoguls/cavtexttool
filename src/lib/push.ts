// Phone push notifications. The phone signs up here; the database + "send-push" edge function
// deliver (migration 009). In demo mode nothing is sent, but the screens behave the same.
import { useEffect, useState } from 'react'
import { isDemoMode, supabase } from './supabase'

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? ''

export type PushStatus =
  | 'unsupported'    // this browser can't do push at all
  | 'needs-install'  // iPhone/iPad: only works after "Add to Home Screen"
  | 'not-configured' // live app without a VAPID key yet
  | 'denied'         // the person (or phone settings) blocked notifications
  | 'off'            // can be turned on
  | 'on'

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return new Uint8Array([...rawData].map(c => c.charCodeAt(0))).buffer as ArrayBuffer
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function isStandaloneMode(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (window.navigator as { standalone?: boolean }).standalone === true
}

export function isIOS(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

let demoOn = false

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

export async function getPushStatus(): Promise<PushStatus> {
  if (isDemoMode) return demoOn ? 'on' : 'off'
  if (isIOS() && !isStandaloneMode()) return 'needs-install'
  if (!isPushSupported()) return 'unsupported'
  if (!VAPID_PUBLIC_KEY) return 'not-configured'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'off'
  return (await currentSubscription()) ? 'on' : 'off'
}

async function save(sub: PushSubscription) {
  const j = sub.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth, p_user_agent: navigator.userAgent,
  })
  if (error) throw new Error(error.message)
}

/** Ask permission and sign this phone up. Returns the new status. */
export async function turnOnPush(): Promise<PushStatus> {
  if (isDemoMode) { demoOn = true; return 'on' }
  const status = await getPushStatus()
  if (status !== 'off' && status !== 'on') return status
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription())
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) })
  await save(sub)
  return 'on'
}

/** Stop notifications on this phone. */
export async function turnOffPush(): Promise<void> {
  if (isDemoMode) { demoOn = false; return }
  const sub = await currentSubscription()
  if (!sub) return
  await supabase.rpc('remove_push_subscription', { p_endpoint: sub.endpoint })
  await sub.unsubscribe()
}

/** On sign-in: if this phone already allows notifications, make sure it's saved for whoever just signed in. */
export async function syncPushSubscription(): Promise<void> {
  if (isDemoMode || !VAPID_PUBLIC_KEY || !isPushSupported() || Notification.permission !== 'granted') return
  try { const sub = await currentSubscription(); if (sub) await save(sub) } catch { /* try again next time */ }
}

/** On sign-out: stop sending this person's notifications to this phone (it may be shared). */
export async function forgetThisPhone(): Promise<void> {
  if (isDemoMode || !isPushSupported()) return
  try {
    const sub = await currentSubscription()
    if (sub) await supabase.rpc('remove_push_subscription', { p_endpoint: sub.endpoint })
  } catch { /* signing out anyway */ }
}

export function usePushStatus() {
  const [status, setStatus] = useState<PushStatus | null>(null)
  useEffect(() => {
    let alive = true
    getPushStatus().then(s => { if (alive) setStatus(s) }).catch(() => alive && setStatus('unsupported'))
    return () => { alive = false }
  }, [])
  return [status, setStatus] as const
}

/** The red number on the app icon on the home screen (where the phone supports it). */
export function setAppBadge(count: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
  try {
    if (count > 0) nav.setAppBadge?.(count)?.catch(() => {})
    else nav.clearAppBadge?.()?.catch(() => {})
  } catch { /* not supported */ }
}

/**
 * Tapping a notification opens the app on the right screen: "?open=messages" on a fresh start,
 * or a message from the service worker when the app is already open.
 */
export function useOpenFromNotification(onOpen: (target: string) => void) {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const target = params.get('open')
      if (target) {
        onOpen(target)
        params.delete('open')
        const q = params.toString()
        window.history.replaceState(null, '', window.location.pathname + (q ? `?${q}` : '') + window.location.hash)
      }
    } catch { /* ignore */ }
    if (!('serviceWorker' in navigator)) return
    const handler = (e: MessageEvent) => { if (e.data?.type === 'cav-open' && typeof e.data.open === 'string') onOpen(e.data.open) }
    navigator.serviceWorker.addEventListener('message', handler)
    return () => navigator.serviceWorker.removeEventListener('message', handler)
    // Run once per screen; onOpen only switches tabs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
