import type { ReactNode } from 'react'

interface BadgeProps {
  children: ReactNode
  variant?: 'amber' | 'sage' | 'muted'
}

const variants = {
  amber: 'bg-[#F0E4D4] text-[#C17F4A] border border-[#D4985E]/30',
  sage: 'bg-[#EBF3EE] text-[#5A8A6A] border border-[#5A8A6A]/20',
  muted: 'bg-[#EAE5E0] text-[#8C7B72] border border-[#D9D2CA]',
}

export function Badge({ children, variant = 'amber' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${variants[variant]}`}>
      {children}
    </span>
  )
}
