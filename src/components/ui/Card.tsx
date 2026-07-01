import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  onClick?: () => void
}

export function Card({ children, className = '', onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`
        bg-[#F5F1ED] rounded-2xl p-4
        shadow-[0_1px_3px_rgba(61,46,38,0.08),0_4px_12px_rgba(61,46,38,0.06)]
        ${onClick ? 'cursor-pointer active:scale-[0.99] transition-transform duration-100' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  )
}
