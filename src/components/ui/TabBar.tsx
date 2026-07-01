import type { ReactNode } from 'react'

interface Tab {
  key: string
  label: string
  icon: ReactNode
  badge?: number
}

interface TabBarProps {
  tabs: Tab[]
  active: string
  onChange: (key: string) => void
}

export function TabBar({ tabs, active, onChange }: TabBarProps) {
  return (
    <div className="flex bg-[#F5F1ED] border-t border-[#D9D2CA] safe-bottom">
      {tabs.map(tab => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`
            flex-1 flex flex-col items-center justify-center gap-1 py-3 px-2
            transition-colors duration-150
            ${active === tab.key ? 'text-[#C17F4A]' : 'text-[#8C7B72]'}
          `}
        >
          <div className="relative">
            {tab.icon}
            {tab.badge ? (
              <span className="absolute -top-1 -right-1.5 bg-[#C17F4A] text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {tab.badge > 9 ? '9+' : tab.badge}
              </span>
            ) : null}
          </div>
          <span className="text-[10px] font-medium tracking-wide">{tab.label}</span>
        </button>
      ))}
    </div>
  )
}
