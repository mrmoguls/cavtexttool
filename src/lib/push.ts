import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const arr = new Uint8Array([...rawData].map(c => c.charCodeAt(0)))
  return arr.buffer as ArrayBuffer
}

export async function subscribeToPush(driverId: string): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false
  if (!VAPID_PUBLIC_KEY) return false

  try {
    const registration = await navigator.serviceWorker.ready
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return false

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })

    await supabase
      .from('drivers')
      .update({ push_subscription: JSON.stringify(subscription) })
      .eq('id', driverId)

    return true
  } catch (err) {
    console.error('Push subscription failed:', err)
    return false
  }
}

export async function unsubscribeFromPush(driverId: string) {
  try {
    const registration = await navigator.serviceWorker.ready
    const sub = await registration.pushManager.getSubscription()
    if (sub) await sub.unsubscribe()
    await supabase.from('drivers').update({ push_subscription: null }).eq('id', driverId)
  } catch {
    // ignore
  }
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function isStandaloneMode(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
}
