import type { ReactNode } from 'react'
import { Logo } from './Logo'

interface TopBarProps {
  greeting?: string
  right?: ReactNode
  title?: string
}

export function TopBar({ greeting, right, title }: TopBarProps) {
  return (
    <div className="bg-[#0B1A5C] safe-top">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <Logo size="sm" onDark />
          {greeting && (
            <p className="text-xs text-white/60 pl-0.5 mt-0.5">{greeting}</p>
          )}
          {title && (
            <p className="text-sm font-semibold text-white pl-0.5">{title}</p>
          )}
        </div>
        {right && <div>{right}</div>}
      </div>
    </div>
  )
}
