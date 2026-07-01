import type { ReactNode } from 'react'

export function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 px-8 text-center">
      <div className="text-[#D8DFEF] text-5xl">{icon}</div>
      <p className="font-semibold text-[#1B2E6B]">{title}</p>
      {body && <p className="text-sm text-[#6B7A99] max-w-xs">{body}</p>}
    </div>
  )
}
