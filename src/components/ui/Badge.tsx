import type { ReactNode } from 'react'

interface BadgeProps {
  children: ReactNode
  variant?: 'amber' | 'sage' | 'muted'
}

const variants = {
  amber: 'bg-[#FCE9E9] text-[#CC2A2A] border border-[#E03A3A]/30',
  sage: 'bg-[#E8F5EE] text-[#2E7D52] border border-[#2E7D52]/20',
  muted: 'bg-[#EEF1F8] text-[#6B7A99] border border-[#D8DFEF]',
}

export function Badge({ children, variant = 'amber' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${variants[variant]}`}>
      {children}
    </span>
  )
}
