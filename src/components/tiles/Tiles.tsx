import { useState, type ReactNode } from 'react'
import { useData } from '../../lib/data-context'
import { useAuth } from '../../lib/auth'
import type { LinkTile } from '../../types'
import {
  BookOpen, Car, ClipboardCheck, Clock, FileText, Fuel, Globe, GraduationCap, HeartPulse, Link as LinkIcon,
  MessageSquare, Phone, ShieldCheck, TriangleAlert, Wrench, ExternalLink,
} from 'lucide-react'

/** Built-in icons admins can pick from (or they can give a real app-icon image URL). */
export const TILE_ICONS: Record<string, { label: string; icon: (size: number) => ReactNode }> = {
  car: { label: 'Van / rides', icon: s => <Car size={s} /> },
  'clipboard-check': { label: 'Checklist', icon: s => <ClipboardCheck size={s} /> },
  clock: { label: 'Clock', icon: s => <Clock size={s} /> },
  'graduation-cap': { label: 'Training', icon: s => <GraduationCap size={s} /> },
  'book-open': { label: 'Handbook', icon: s => <BookOpen size={s} /> },
  phone: { label: 'Phone', icon: s => <Phone size={s} /> },
  'triangle-alert': { label: 'Emergency', icon: s => <TriangleAlert size={s} /> },
  wrench: { label: 'Repairs', icon: s => <Wrench size={s} /> },
  'file-text': { label: 'Document', icon: s => <FileText size={s} /> },
  fuel: { label: 'Fuel', icon: s => <Fuel size={s} /> },
  'heart-pulse': { label: 'Health', icon: s => <HeartPulse size={s} /> },
  'shield-check': { label: 'Safety', icon: s => <ShieldCheck size={s} /> },
  message: { label: 'Message', icon: s => <MessageSquare size={s} /> },
  globe: { label: 'Website', icon: s => <Globe size={s} /> },
  link: { label: 'Link', icon: s => <LinkIcon size={s} /> },
}

export function TileIcon({ tile, size = 22 }: { tile: Pick<LinkTile, 'icon' | 'icon_url' | 'name'>; size?: number }) {
  const [broken, setBroken] = useState(false)
  if (tile.icon_url && !broken) {
    return <img src={tile.icon_url} alt="" onError={() => setBroken(true)} className="rounded-xl object-cover" style={{ width: size + 18, height: size + 18 }} />
  }
  return <>{(TILE_ICONS[tile.icon] ?? TILE_ICONS.link).icon(size)}</>
}

/** Links we allow: web, phone, text, email and app links. Never javascript: or data:. */
export function isAllowedUrl(url: string): boolean {
  const u = url.trim()
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) return false
  return !/^(javascript|data|vbscript|file):/i.test(u)
}

export const isSetUp = (t: Pick<LinkTile, 'url'>) => !!t.url && isAllowedUrl(t.url)

/** Web links open in a new tab; phone / text / app links open directly. */
function linkProps(url: string) {
  return /^https?:/i.test(url) ? { href: url, target: '_blank', rel: 'noreferrer' } : { href: url }
}

/** Tiles this person should see (the database also filters these). */
export function useMyTiles() {
  const data = useData()
  const { me, isStaff } = useAuth()
  if (!me) return []
  return data.tiles.filter(t => t.active && (t.roles_visible.includes(me.role) || (isStaff && t.roles_visible.includes('dispatcher'))))
}

function NotSetUp({ onClose }: { onClose: () => void }) {
  return (
    <div role="status" className="rounded-xl bg-amber-50 text-amber-900 border border-amber-200 px-3 py-2 text-sm flex items-start gap-2">
      <span className="flex-1">This link isn't set up yet. Ask the office.</span>
      <button onClick={onClose} className="text-xs underline underline-offset-2">OK</button>
    </div>
  )
}

/** The big tile on the home screen. */
export function TileCard({ tile }: { tile: LinkTile }) {
  const data = useData()
  const [missing, setMissing] = useState(false)
  const ready = isSetUp(tile)
  const body = (
    <>
      <div className="w-11 h-11 rounded-xl bg-[#EEF1F8] text-[#0B1A5C] flex items-center justify-center flex-shrink-0"><TileIcon tile={tile} /></div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[#0B1A5C] leading-snug">{tile.name}</p>
        {tile.help_text && <p className="text-xs text-[#6B7A99] mt-0.5">{tile.help_text}</p>}
      </div>
      {ready && <ExternalLink size={16} className="text-[#6B7A99] flex-shrink-0" />}
    </>
  )
  const cls = 'w-full text-left bg-white rounded-2xl p-3.5 flex items-center gap-3 shadow-[0_1px_3px_rgba(61,46,38,0.08),0_4px_12px_rgba(61,46,38,0.06)] active:scale-[0.99] transition-transform'
  return (
    <div className="space-y-1.5">
      {ready
        ? <a {...linkProps(tile.url!)} onClick={() => data.recordTap(tile.id, 'home')} className={cls}>{body}</a>
        : <button onClick={() => { setMissing(true); data.recordTap(tile.id, 'home') }} className={`${cls} opacity-80`}>{body}</button>}
      {missing && <NotSetUp onClose={() => setMissing(false)} />}
      {ready && tile.fallback_url && isAllowedUrl(tile.fallback_url) && (
        <a {...linkProps(tile.fallback_url)} onClick={() => data.recordTap(tile.id, 'home')} className="block text-xs text-[#6B7A99] underline underline-offset-2 pl-1">
          Didn't open? Try the website or app store
        </a>
      )}
    </div>
  )
}

/** Buttons on today's shift card for tiles with a shift label ("Clock in", "Today's rides" …). */
export function ShiftLinks() {
  const data = useData()
  const tiles = useMyTiles().filter(t => t.shift_label)
  const [missing, setMissing] = useState<string | null>(null)
  if (!tiles.length) return null
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {tiles.map(t => {
          const inner = (
            <>
              <span className="text-[#0B1A5C]"><TileIcon tile={t} size={20} /></span>
              <span className="text-xs font-semibold text-[#0B1A5C] leading-tight text-center">{t.shift_label}</span>
            </>
          )
          const cls = 'flex flex-col items-center justify-center gap-1 rounded-xl bg-[#EEF1F8] px-2 py-3 min-h-16 active:scale-[0.98] transition-transform'
          return isSetUp(t)
            ? <a key={t.id} {...linkProps(t.url!)} onClick={() => data.recordTap(t.id, 'shift')} className={cls}>{inner}</a>
            : <button key={t.id} onClick={() => { setMissing(t.id); data.recordTap(t.id, 'shift') }} className={cls}>{inner}</button>
        })}
      </div>
      {missing && <NotSetUp onClose={() => setMissing(null)} />}
    </div>
  )
}
