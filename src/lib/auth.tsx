import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { isDemoMode, supabase } from './supabase'
import { demoStore } from './demo-store'
import type { DirectoryEntry, Employee } from '../types'

const DEMO_SESSION_KEY = 'cav_demo_employee'
export const DEMO_PIN = '0000'
const LEGACY_KEYS = ['cav_identity', 'cav_dispatch_auth']

type Status = 'loading' | 'signed-out' | 'signed-in'
export type SignInResult = { ok: true } | { ok: false; error: string }

interface AuthAPI {
  status: Status
  me: Employee | null
  isStaff: boolean
  isAdmin: boolean
  loadDirectory: () => Promise<DirectoryEntry[]>
  signIn: (employeeId: string, pin: string) => Promise<SignInResult>
  signOut: () => Promise<void>
  /** Re-read my employee row (e.g. after an admin edits it). */
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<AuthAPI>(null!)
export function useAuth() { return useContext(AuthContext) }

// Browser storage can be blocked (private windows, embedded previews) — never let that crash sign-in.
const store = {
  get(k: string) { try { return localStorage.getItem(k) } catch { return null } },
  set(k: string, v: string) { try { localStorage.setItem(k, v) } catch { /* session-only */ } },
  remove(k: string) { try { localStorage.removeItem(k) } catch { /* ignore */ } },
}
let demoSessionFallback: string | null = null

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [me, setMe] = useState<Employee | null>(null)

  const loadMe = useCallback(async (): Promise<Employee | null> => {
    if (isDemoMode) {
      const id = store.get(DEMO_SESSION_KEY) ?? demoSessionFallback
      const emp = (demoStore.select('employees') as unknown as Employee[]).find(e => e.id === id && e.active) ?? null
      demoStore.actorId = emp?.id ?? null
      return emp
    }
    const { data: sess } = await supabase.auth.getSession()
    const uid = sess.session?.user.id
    if (!uid) return null
    const { data } = await supabase.from('employees').select('*').eq('auth_user_id', uid).maybeSingle()
    const emp = (data as Employee | null)
    if (!emp || !emp.active) {
      await supabase.auth.signOut()
      return null
    }
    return emp
  }, [])

  const refreshMe = useCallback(async () => {
    const emp = await loadMe()
    setMe(emp)
    setStatus(emp ? 'signed-in' : 'signed-out')
  }, [loadMe])

  useEffect(() => {
    LEGACY_KEYS.forEach(k => store.remove(k))
    refreshMe()
    if (isDemoMode) return
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { setMe(null); setStatus('signed-out') }
    })
    return () => data.subscription.unsubscribe()
  }, [refreshMe])

  const loadDirectory = useCallback(async (): Promise<DirectoryEntry[]> => {
    if (isDemoMode) {
      return (demoStore.select('employees') as unknown as Employee[])
        .filter(e => e.active)
        .map(e => ({ id: e.id, name: e.name, role: e.role }))
        .sort((a, b) => a.name.localeCompare(b.name))
    }
    const { data, error } = await supabase.rpc('login_directory')
    if (error) throw new Error(error.message)
    return (data ?? []) as DirectoryEntry[]
  }, [])

  const signIn = useCallback(async (employeeId: string, pin: string): Promise<SignInResult> => {
    if (!/^\d{4}$/.test(pin)) return { ok: false, error: 'Enter your 4-digit PIN.' }

    if (isDemoMode) {
      // Demo mode keeps it simple: everyone's PIN is 0000.
      if (pin !== DEMO_PIN) return { ok: false, error: `Wrong PIN. In demo mode everyone's PIN is ${DEMO_PIN}.` }
      demoSessionFallback = employeeId
      store.set(DEMO_SESSION_KEY, employeeId)
      await refreshMe()
      return { ok: true }
    }

    const { data, error } = await supabase.functions.invoke('pin-login', { body: { employee_id: employeeId, pin } })
    if (error) {
      let message = 'Could not sign in. Check your connection and try again.'
      if (error instanceof FunctionsHttpError) {
        try { message = (await error.context.json()).error ?? message } catch { /* keep default */ }
      }
      return { ok: false, error: message }
    }
    const { error: setErr } = await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token })
    if (setErr) return { ok: false, error: setErr.message }
    await refreshMe()
    return { ok: true }
  }, [refreshMe])

  const signOut = useCallback(async () => {
    if (isDemoMode) {
      demoSessionFallback = null
      store.remove(DEMO_SESSION_KEY)
      demoStore.actorId = null
    } else {
      await supabase.auth.signOut()
    }
    setMe(null)
    setStatus('signed-out')
  }, [])

  const isStaff = me?.role === 'dispatcher' || me?.role === 'admin' || !!me?.can_dispatch
  const isAdmin = me?.role === 'admin'

  return (
    <AuthContext.Provider value={{ status, me, isStaff, isAdmin, loadDirectory, signIn, signOut, refreshMe }}>
      {children}
    </AuthContext.Provider>
  )
}
