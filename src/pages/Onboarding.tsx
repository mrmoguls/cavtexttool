import { useState } from 'react'
import { useData } from '../lib/data-context'
import { storeIdentity, authDispatch } from '../lib/storage'
import { isStandaloneMode } from '../lib/push'
import { Button } from '../components/ui/Button'
import { Logo } from '../components/ui/Logo'
import type { Driver, AppUser } from '../types'
import { Smartphone, Download, Shield } from 'lucide-react'

interface OnboardingProps {
  onComplete: (user: AppUser) => void
  onDispatchMode: () => void
}

type Step = 'install-prompt' | 'pick-name' | 'dispatch-pin'

export function Onboarding({ onComplete, onDispatchMode }: OnboardingProps) {
  const [step, setStep] = useState<Step>(() => {
    // Skip install prompt if already standalone
    if (isStandaloneMode()) return 'pick-name'
    return 'install-prompt'
  })
  const { drivers } = useData()
  const [loading, setLoading] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [isIOS] = useState(() => /iphone|ipad|ipod/i.test(navigator.userAgent))

  async function selectDriver(driver: Driver) {
    setLoading(true)
    const user: AppUser = { type: 'driver', driver }
    storeIdentity(user)
    onComplete(user)
  }

  function tryDispatchPin() {
    if (authDispatch(pin)) {
      onDispatchMode()
    } else {
      setPinError(true)
      setPin('')
      setTimeout(() => setPinError(false), 1500)
    }
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
                'Open Care-A-Van Connect from your Home Screen',
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

        <Button
          variant="ghost"
          onClick={() => setStep('pick-name')}
          className="text-[#6B7A99]"
        >
          Skip for now, continue in browser
        </Button>
      </div>
    )
  }

  if (step === 'dispatch-pin') {
    return (
      <div className="min-h-svh bg-[#EEF1F8] flex flex-col items-center justify-center px-6 gap-6">
        <Logo size="lg" />
        <div className="bg-[#FFFFFF] rounded-2xl p-6 shadow-sm w-full max-w-sm space-y-4">
          <div className="flex items-center gap-3">
            <Shield size={20} className="text-[#CC2A2A]" />
            <p className="font-semibold text-[#0B1A5C]">Dispatch Access</p>
          </div>
          <p className="text-sm text-[#6B7A99]">Enter the dispatch PIN to continue.</p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={8}
            value={pin}
            onChange={e => setPin(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && tryDispatchPin()}
            placeholder="PIN"
            className={`w-full bg-[#EEF1F8] rounded-xl px-4 py-3 text-2xl tracking-widest text-center outline-none border-2 transition-colors
              ${pinError ? 'border-red-400' : 'border-transparent focus:border-[#CC2A2A]'}
            `}
          />
          {pinError && <p className="text-xs text-red-500 text-center">Incorrect PIN</p>}
          <Button fullWidth onClick={tryDispatchPin}>Enter</Button>
          <Button variant="ghost" fullWidth onClick={() => setStep('pick-name')}>Back to driver list</Button>
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
          Tap your name to get started. This device will remember you.
        </p>
      </div>

      <div className="flex flex-col gap-2 w-full max-w-sm mx-auto">
        {drivers.length === 0 && (
          <p className="text-center text-[#6B7A99] py-8 text-sm">Loading roster…</p>
        )}
        {drivers.map(driver => (
          <button
            key={driver.id}
            onClick={() => selectDriver(driver)}
            disabled={loading}
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
              {driver.name.charAt(0).toUpperCase()}
            </div>
            <span className="font-medium text-[#0B1A5C]">{driver.name}</span>
          </button>
        ))}
      </div>

      <div className="mt-auto flex justify-center">
        <button
          onClick={() => setStep('dispatch-pin')}
          className="text-sm text-[#6B7A99] underline underline-offset-2"
        >
          I'm dispatch / admin
        </button>
      </div>
    </div>
  )
}
