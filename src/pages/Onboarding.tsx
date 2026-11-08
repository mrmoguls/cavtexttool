import { useEffect, useState } from 'react'
import { useAuth, DEMO_PIN } from '../lib/auth'
import { isStandaloneMode } from '../lib/push'
import { isDemoMode } from '../lib/supabase'
import { Button } from '../components/ui/Button'
import { Logo } from '../components/ui/Logo'
import type { DirectoryEntry } from '../types'
import { Smartphone, Download, Lock, ChevronLeft } from 'lucide-react'

type Step = 'install-prompt' | 'pick-name' | 'pin'

const ROLE_LABEL: Record<DirectoryEntry['role'], string> = {
  driver: 'Driver', attendant: 'Attendant', dispatcher: 'Dispatch', admin: 'Admin',
}

export function Onboarding() {
  const auth = useAuth()
  const [step, setStep] = useState<Step>(() => (isStandaloneMode() ? 'pick-name' : 'install-prompt'))
  const [directory, setDirectory] = useState<DirectoryEntry[] | null>(null)
  const [dirError, setDirError] = useState<string | null>(null)
  const [selected, setSelected] = useState<DirectoryEntry | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [isIOS] = useState(() => /iphone|ipad|ipod/i.test(navigator.userAgent))

  const { loadDirectory } = auth
  useEffect(() => {
    loadDirectory()
      .then(setDirectory)
      .catch(err => setDirError(err instanceof Error ? err.message : 'Could not load the team list.'))
  }, [loadDirectory])

  async function submitPin(value = pin) {
    if (!selected || busy) return
    setBusy(true)
    setError(null)
    const res = await auth.signIn(selected.id, value)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      setPin('')
    }
  }

  function onPinChange(v: string) {
    const digits = v.replace(/\D/g, '').slice(0, 4)
    setPin(digits)
    setError(null)
    if (digits.length === 4) submitPin(digits)
  }

  if (step === 'install-prompt') {
    return (
      <div className="min-h-svh bg-[#EEF1F8] flex flex-col items-center justify-center px-6 gap-8">
        <Logo size="lg" />

        <div className="bg-[#FFFFFF] rounded-2xl p-6 shadow-sm w-full max-w-sm space-y-5">
          <div className="flex items-start gap-3">
            <div className="bg-[#FCE9E9] rounded-xl p-2 mt-0.5">
              <Download size={20} className="text-[#CC2A2A]" />
            </div>
            <div>
              <p className="font-semibold text-[#0B1A5C]">Install the app first</p>
              <p className="text-sm text-[#6B7A99] mt-1">
                {isIOS
                  ? 'To receive notifications on iPhone, you need to add this to your Home Screen. Tap the Share button below, then "Add to Home Screen."'
                  : 'For the best experience and notifications, install this app. Tap the menu in your browser and select "Add to Home Screen" or "Install App."'}
              </p>
            </div>
          </div>

          {isIOS && (
            <div className="bg-[#EEF1F8] rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-[#1B2E6B] uppercase tracking-wide">iPhone steps</p>
              {[
                'Open this page in Safari (not Chrome)',
                'Tap the Share button (box with arrow at bottom)',
                '"Add to Home Screen" → Add',
                'Open CAV Hub from your Home Screen',
              ].map((s, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#CC2A2A] text-white text-xs flex items-center justify-center font-semibold">{i + 1}</span>
                  <p className="text-xs text-[#1B2E6B] leading-relaxed">{s}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="bg-amber-50 rounded-xl p-2">
              <Smartphone size={16} className="text-[#CC2A2A]" />
            </div>
            <p className="text-xs text-[#6B7A99]">
              Push notifications only work when the app is installed to your Home Screen.
            </p>
          </div>
        </div>

        <Button variant="ghost" onClick={() => setStep('pick-name')} className="text-[#6B7A99]">
          Skip for now, continue in browser
        </Button>
      </div>
    )
  }

  if (step === 'pin' && selected) {
    const demoPin = isDemoMode ? DEMO_PIN : null
    return (
      <div className="min-h-svh bg-[#EEF1F8] flex flex-col items-center justify-center px-6 gap-6">
        <Logo size="lg" />
        <div className="bg-[#FFFFFF] rounded-2xl p-6 shadow-sm w-full max-w-sm space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#FCE9E9] flex items-center justify-center text-[#CC2A2A] font-semibold flex-shrink-0">
              {selected.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-[#0B1A5C]">{selected.name}</p>
              <p className="text-xs text-[#6B7A99]">{ROLE_LABEL[selected.role]}</p>
            </div>
          </div>
          <div className="flex items-start gap-2 text-sm text-[#6B7A99]">
            <Lock size={16} className="mt-0.5 flex-shrink-0" />
            <p>Enter your PIN — the <span className="font-semibold text-[#1B2E6B]">last 4 digits of your phone number</span>.</p>
          </div>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={4}
            value={pin}
            disabled={busy}
            onChange={e => onPinChange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitPin()}
            placeholder="••••"
            aria-label="4-digit PIN"
            className={`w-full bg-[#EEF1F8] rounded-xl px-4 py-3 text-2xl tracking-[0.5em] text-center outline-none border-2 transition-colors
              ${error ? 'border-red-400' : 'border-transparent focus:border-[#CC2A2A]'}
            `}
          />
          {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          {demoPin && <p className="text-xs text-[#6B7A99] text-center">Demo mode — everyone's PIN is {demoPin}</p>}
          <Button fullWidth onClick={() => submitPin()} disabled={busy || pin.length !== 4}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
          <Button variant="ghost" fullWidth onClick={() => { setStep('pick-name'); setPin(''); setError(null) }}>
            <ChevronLeft size={16} /> Not you? Pick another name
          </Button>
        </div>
      </div>
    )
  }

  // pick-name
  return (
    <div className="min-h-svh bg-[#EEF1F8] flex flex-col px-4 pt-16 pb-8 gap-6">
      <div className="flex flex-col items-center gap-3">
        <Logo size="lg" />
        <p className="text-[#6B7A99] text-sm text-center max-w-xs">
          Tap your name, then enter your PIN. This device will keep you signed in.
        </p>
        {isDemoMode && (
          <p className="text-xs text-[#6B7A99] text-center max-w-xs bg-white rounded-xl px-3 py-2">
            Demo mode: everyone's PIN is <b>0000</b>. Try <b>Pat Morgan</b> (admin), <b>Dana Reyes</b> (dispatch) or any driver.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 w-full max-w-sm mx-auto">
        {dirError && <p className="text-center text-red-600 py-8 text-sm">{dirError}</p>}
        {!directory && !dirError && <p className="text-center text-[#6B7A99] py-8 text-sm">Loading team…</p>}
        {directory?.length === 0 && (
          <p className="text-center text-[#6B7A99] py-8 text-sm">No one is set up yet. See SETUP.md to add the first admin.</p>
        )}
        {directory?.map(person => (
          <button
            key={person.id}
            onClick={() => { setSelected(person); setStep('pin') }}
            className="
              w-full bg-[#FFFFFF] rounded-2xl px-4 py-4 text-left
              flex items-center gap-3
              border-2 border-transparent
              hover:border-[#E03A3A] hover:bg-white
              active:scale-[0.98]
              transition-all duration-150
              shadow-[0_1px_3px_rgba(61,46,38,0.08)]
            "
          >
            <div className="w-10 h-10 rounded-full bg-[#FCE9E9] flex items-center justify-center text-[#CC2A2A] font-semibold text-base flex-shrink-0">
              {person.name.charAt(0).toUpperCase()}
            </div>
            <span className="font-medium text-[#0B1A5C] flex-1">{person.name}</span>
            {person.role !== 'driver' && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[#6B7A99]">{ROLE_LABEL[person.role]}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
