import type { ReactNode } from 'react'
import { Logo } from './Logo'

interface TopBarProps {
  greeting?: string
  right?: ReactNode
  title?: string
}

export function TopBar({ greeting, right, title }: TopBarProps) {
  return (
    <div className="bg-[#F5F1ED] border-b border-[#D9D2CA] safe-top">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <Logo size="sm" />
          {greeting && (
            <p className="text-xs text-[#8C7B72] pl-0.5">{greeting}</p>
          )}
          {title && (
            <p className="text-sm font-semibold text-[#3D2E26] pl-0.5">{title}</p>
          )}
        </div>
        {right && <div>{right}</div>}
      </div>
    </div>
  )
}
