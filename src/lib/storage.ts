// Local device identity storage — no passwords needed
import type { AppUser } from '../types'

const IDENTITY_KEY = 'cav_identity'
const DISPATCH_AUTH_KEY = 'cav_dispatch_auth'
const DISPATCH_PIN = import.meta.env.VITE_DISPATCH_PIN || '1234'

export function getStoredIdentity(): AppUser | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function storeIdentity(user: AppUser) {
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(user))
}

export function clearIdentity() {
  localStorage.removeItem(IDENTITY_KEY)
  localStorage.removeItem(DISPATCH_AUTH_KEY)
}

export function isDispatchAuthed(): boolean {
  return localStorage.getItem(DISPATCH_AUTH_KEY) === 'true'
}

export function authDispatch(pin: string): boolean {
  if (pin === DISPATCH_PIN) {
    localStorage.setItem(DISPATCH_AUTH_KEY, 'true')
    return true
  }
  return false
}

export function clearDispatchAuth() {
  localStorage.removeItem(DISPATCH_AUTH_KEY)
}
