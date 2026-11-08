import { useState } from 'react'
import { useData } from '../../lib/data-context'
import { addDays, formatDate, needsPostedStart, shiftTimeLabel, todayISO } from '../../lib/scheduling'
import { Card } from '../../components/ui/Card'
import { ScrollBody, SectionLabel } from '../../components/ui/Form'
import { ShiftLinks, TileCard, useMyTiles } from '../../components/tiles/Tiles'
import { BidBanner, DriverBid } from './DriverBid'
import { CertificationsCard, MyCertifications } from './MyCertifications'
import { ShiftDetail } from './DriverSchedule'
import { useTradeOffers } from './DriverBoard'
import type { BidPeriod, Employee, Shift } from '../../types'
import { ConfirmStartCard, ConfirmedNote, useStartsToConfirm } from '../../components/schedule/ConfirmStart'
import { ChevronRight, Repeat } from 'lucide-react'

/** The driver's starting point: today's shift with its links, anything that needs attention, and all the links. */
export function DriverToday({ driver, onOpenBoard, onMessageDispatch }: { driver: Employee; onOpenBoard: () => void; onMessageDispatch: () => void }) {
  const data = useData()
  const today = todayISO()
  const [sub, setSub] = useState<'certs' | null>(null)
  const [bidding, setBidding] = useState<BidPeriod | null>(null)
  const [openShift, setOpenShift] = useState<Shift | null>(null)
  const tiles = useMyTiles()
  const offers = useTradeOffers(driver.id)
  const toConfirm = useStartsToConfirm(driver.id)

  if (sub === 'certs') return <MyCertifications driver={driver} onBack={() => setSub(null)} />
  if (bidding) {
    const fresh = data.bidPeriods.find(p => p.id === bidding.id) ?? bidding
    return <DriverBid driver={driver} period={fresh} onBack={() => setBidding(null)} />
  }
  if (openShift) {
    const fresh = data.shifts.find(s => s.id === openShift.id) ?? openShift
    return <ShiftDetail shift={fresh} onBack={() => setOpenShift(null)} onMessageDispatch={onMessageDispatch} />
  }

  const mine = data.shifts
    .filter(s => s.employee_id === driver.id && s.status === 'scheduled' && s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start_time ?? '').localeCompare(b.start_time ?? ''))
  const todays = mine.filter(s => s.date === today)
  const next = mine.find(s => s.date > today)
  const offToday = data.timeOff.some(t => t.employee_id === driver.id && t.status === 'approved' && t.start_date <= today && t.end_date >= today)

  return (
    <ScrollBody>
      <p className="text-sm text-[#6B7A99] px-1">{formatDate(today)}</p>
      {toConfirm.map(s => <ConfirmStartCard key={`c-${s.id}`} shift={s} />)}

      {todays.length > 0 ? todays.map(s => <TodayCard key={s.id} shift={s} onOpen={() => setOpenShift(s)} />) : (
        <Card className="space-y-1">
          <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide">Today</p>
          <p className="font-semibold text-[#0B1A5C]">{offToday ? "You're off today (time off)." : "You're not scheduled today."}</p>
          {next && (
            <button onClick={() => setOpenShift(next)} className="text-sm text-[#1B2E6B] flex items-center gap-1">
              Next: {next.date === addDays(today, 1) ? 'Tomorrow' : formatDate(next.date)} · {data.blocksById.get(next.block_id)?.name} <ChevronRight size={14} />
            </button>
          )}
        </Card>
      )}

      <BidBanner driver={driver} onOpen={setBidding} />
      <CertificationsCard driver={driver} onOpen={() => setSub('certs')} />
      {offers.length > 0 && (
        <Card onClick={onOpenBoard} className="border-2 border-[#0B1A5C]/20">
          <div className="flex items-center gap-3">
            <div className="rounded-xl p-2 bg-[#EEF1F8] text-[#0B1A5C]"><Repeat size={18} /></div>
            <p className="flex-1 font-semibold text-[#0B1A5C]">{offers.length} trade offer{offers.length === 1 ? '' : 's'} waiting for you</p>
            <ChevronRight size={16} className="text-[#6B7A99]" />
          </div>
        </Card>
      )}

      {tiles.length > 0 && (
        <>
          <SectionLabel>Links</SectionLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {tiles.map(t => <TileCard key={t.id} tile={t} />)}
          </div>
        </>
      )}
    </ScrollBody>
  )
}

function TodayCard({ shift, onOpen }: { shift: Shift; onOpen: () => void }) {
  const data = useData()
  const block = data.blocksById.get(shift.block_id)
  if (!block) return null
  const waiting = needsPostedStart(shift, block)
  return (
    <Card className="space-y-3 border-2 border-[#0B1A5C]/20">
      <button onClick={onOpen} className="w-full text-left flex items-center gap-3">
        <span className="px-2 py-1 rounded-lg bg-[#0B1A5C] text-white text-xs font-bold">{block.code}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-[#6B7A99] uppercase tracking-wide">Today · {block.name}{shift.role === 'attendant' ? ' · Attendant' : ''}</p>
          <p className={`text-lg font-semibold ${waiting ? 'text-[#CC2A2A]' : 'text-[#0B1A5C]'}`}>{shiftTimeLabel(shift, block)}</p>
          <ConfirmedNote shift={shift} />
        </div>
        <ChevronRight size={18} className="text-[#6B7A99]" />
      </button>
      <ShiftLinks />
    </Card>
  )
}
