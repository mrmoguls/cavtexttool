import { useState, useEffect } from 'react'
import { getStoredIdentity, isDispatchAuthed, clearIdentity, clearDispatchAuth } from './lib/storage'
import { Onboarding } from './pages/Onboarding'
import { DriverHome } from './pages/DriverHome'
import { DispatchHome } from './pages/DispatchHome'
import type { AppUser } from './types'

type AppMode = 'loading' | 'onboarding' | 'driver' | 'dispatch'

export default function App() {
  const [mode, setMode] = useState<AppMode>('loading')
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null)

  useEffect(() => {
    if (isDispatchAuthed()) {
      setMode('dispatch')
      return
    }
    const stored = getStoredIdentity()
    if (stored) {
      setCurrentUser(stored)
      setMode('driver')
    } else {
      setMode('onboarding')
    }
  }, [])

  function handleOnboardingComplete(user: AppUser) {
    setCurrentUser(user)
    setMode('driver')
  }

  function handleDispatchMode() {
    setMode('dispatch')
  }

  function handleDriverSignOut() {
    clearIdentity()
    setCurrentUser(null)
    setMode('onboarding')
  }

  function handleDispatchSignOut() {
    clearDispatchAuth()
    setMode('onboarding')
  }

  if (mode === 'loading') {
    return (
      <div className="min-h-svh bg-[#EAE5E0] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#C17F4A]/30 border-t-[#C17F4A] rounded-full animate-spin" />
      </div>
    )
  }

  if (mode === 'onboarding') {
    return <Onboarding onComplete={handleOnboardingComplete} onDispatchMode={handleDispatchMode} />
  }

  if (mode === 'driver' && currentUser) {
    return <DriverHome driver={currentUser.driver} onSignOut={handleDriverSignOut} />
  }

  if (mode === 'dispatch') {
    return <DispatchHome onSignOut={handleDispatchSignOut} />
  }

  return null
}
