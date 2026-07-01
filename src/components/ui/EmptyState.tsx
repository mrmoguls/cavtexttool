import type { ReactNode } from 'react'

export function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-8 text-center">
      <div className="text-[#D9D2CA] text-5xl">{icon}</div>
      <p className="font-semibold text-[#5C4A3E]">{title}</p>
      {body && <p className="text-sm text-[#8C7B72] max-w-xs">{body}</p>}
    </div>
  )
}
