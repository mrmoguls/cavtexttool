import { useAuth } from './lib/auth'
import { DataProvider } from './lib/data-context'
import { Onboarding } from './pages/Onboarding'
import { DriverHome } from './pages/DriverHome'
import { DispatchHome } from './pages/DispatchHome'

export default function App() {
  const { status, me, isStaff, signOut } = useAuth()

  if (status === 'loading') {
    return (
      <div className="min-h-svh bg-[#EEF1F8] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#CC2A2A]/30 border-t-[#CC2A2A] rounded-full animate-spin" />
      </div>
    )
  }

  if (status === 'signed-out' || !me) return <Onboarding />

  // Data loads only once someone is signed in (security rules need to know who's asking).
  return (
    <DataProvider key={me.id}>
      {isStaff
        ? <DispatchHome onSignOut={signOut} />
        : <DriverHome driver={me} onSignOut={signOut} />}
    </DataProvider>
  )
}
