import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { Button } from './Button'

interface ConfirmOptions {
  title: string
  body?: ReactNode
  confirmLabel?: string
  danger?: boolean
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn>(async () => false)

/** In-app replacement for window.confirm (native dialogs look out of place in the installed app). */
export function useConfirm() { return useContext(ConfirmContext) }

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>(o => new Promise<boolean>(resolve => {
    resolver.current = resolve
    setOpts(o)
  }), [])

  function close(ok: boolean) {
    resolver.current?.(ok)
    resolver.current = null
    setOpts(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <div
          className="fixed inset-0 z-50 bg-[#0B1A5C]/40 flex items-end sm:items-center justify-center p-4"
          onClick={() => close(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-3 shadow-xl safe-bottom"
            onClick={e => e.stopPropagation()}
          >
            <p id="confirm-title" className="font-semibold text-[#0B1A5C]">{opts.title}</p>
            {opts.body && <div className="text-sm text-[#1B2E6B] space-y-1">{opts.body}</div>}
            <div className="flex gap-2 pt-1">
              <Button variant="secondary" className="flex-1" onClick={() => close(false)}>Cancel</Button>
              <Button variant={opts.danger ? 'danger' : 'primary'} className="flex-1" onClick={() => close(true)} autoFocus>
                {opts.confirmLabel ?? 'OK'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
