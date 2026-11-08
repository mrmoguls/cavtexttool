import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { AlertTriangle, ChevronLeft } from 'lucide-react'

const inputClass =
  'w-full bg-[#EEF1F8] rounded-xl px-3.5 py-2.5 text-sm text-[#0B1A5C] outline-none border-2 border-transparent focus:border-[#CC2A2A] placeholder:text-[#6B7A99] transition-colors disabled:opacity-50'

/**
 * Labeled form field. Use `group` when the children are buttons/toggles rather than a single
 * input — a <label> around buttons would hijack their names and clicks.
 */
export function Field({ label, hint, group, children }: { label: string; hint?: ReactNode; group?: boolean; children: ReactNode }) {
  const inner = (
    <>
      <span className="block text-xs font-semibold text-[#6B7A99] uppercase tracking-wide">{label}</span>
      {children}
      {hint && <span className="block text-xs text-[#6B7A99]">{hint}</span>}
    </>
  )
  return group
    ? <div role="group" aria-label={label} className="block space-y-1.5">{inner}</div>
    : <label className="block space-y-1.5">{inner}</label>
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={2} {...props} className={`${inputClass} resize-none ${props.className ?? ''}`} />
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${inputClass} appearance-none ${props.className ?? ''}`}>
      {children}
    </select>
  )
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-3 py-1 text-left"
    >
      <span>
        <span className="block text-sm font-medium text-[#0B1A5C]">{label}</span>
        {hint && <span className="block text-xs text-[#6B7A99]">{hint}</span>}
      </span>
      <span className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors ${checked ? 'bg-[#2E7D52]' : 'bg-[#D8DFEF]'}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex bg-[#EEF1F8] rounded-xl p-1 gap-1">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${value === o.value ? 'bg-white text-[#0B1A5C] shadow-sm' : 'text-[#6B7A99]'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Header row for a screen nested inside a tab (keeps the bottom tab bar visible). */
export function SubHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: ReactNode }) {
  return (
    <div className="bg-white border-b border-[#D8DFEF] px-2 py-2 flex items-center gap-1">
      <button onClick={onBack} className="p-2 rounded-lg text-[#0B1A5C] hover:bg-[#EEF1F8]" aria-label="Back">
        <ChevronLeft size={20} />
      </button>
      <p className="flex-1 font-semibold text-[#0B1A5C] truncate">{title}</p>
      {right}
    </div>
  )
}

export function Warning({ children, tone = 'red' }: { children: ReactNode; tone?: 'red' | 'amber' }) {
  const cls = tone === 'red'
    ? 'bg-[#FCE9E9] text-[#A82020] border-[#E03A3A]/30'
    : 'bg-amber-50 text-amber-800 border-amber-200'
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${cls}`}>
      <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
      <div className="space-y-0.5">{children}</div>
    </div>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide px-1 pt-2">{children}</p>
}

/** Scrollable body for tab content. */
export function ScrollBody({ children }: { children: ReactNode }) {
  return <div className="flex-1 overflow-y-auto scroll-area scrollbar-hide px-4 py-4 space-y-3">{children}</div>
}
