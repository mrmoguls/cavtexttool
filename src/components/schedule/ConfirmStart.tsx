import { useState } from 'react'
import { useData } from '../../lib/data-context'
import { addDays, formatDate, formatTime, startMessage, todayISO } from '../../lib/scheduling'
import { Button } from '../ui/Button'
import { Warning } from '../ui/Form'
import type { Shift } from '../../types'
import { CheckCircle } from 'lucide-react'
import { dispatchPhone } from '../../lib/dispatch-phone'

/** Start times dispatch posted (variable starts like AM) that this driver still needs to confirm. Fixed-time shifts don't need it. */
export function useStartsToConfirm(employeeId: string) {
  const data = useData()
  const today = todayISO()
  return data.shifts
    .filter(s => s.employee_id === employeeId && s.status === 'scheduled' && s.start_time && s.start_posted_at && !s.start_confirmed_at && s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** "Tomorrow: start 7:30 am for an 8:00 am pickup" with a big Confirm button. */
export function ConfirmStartCard({ shift }: { shift: Shift }) {
  const data = useData()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const today = todayISO()
  const day = shift.date === today ? 'Today' : shift.date === addDays(today, 1) ? 'Tomorrow' : formatDate(shift.date)
  const msg = startMessage(shift.start_time!, shift.first_pickup_time)

  async function confirm() {
    setBusy(true); setError(null)
    try { await data.confirmStart(shift.id) }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not confirm. Check your connection and try again.') }
    finally { setBusy(false) }
  }

  return (
    <div className="bg-white rounded-2xl p-4 space-y-3 border-2 border-[#CC2A2A]/50 shadow-[0_1px_3px_rgba(61,46,38,0.08),0_4px_12px_rgba(61,46,38,0.06)]">
      <p className="text-xs font-semibold text-[#CC2A2A] uppercase tracking-wide">Please confirm your start time</p>
      <p className="text-lg font-bold text-[#0B1A5C] leading-snug">{day}: {msg.charAt(0).toUpperCase() + msg.slice(1)}</p>
      <Button fullWidth size="lg" onClick={confirm} disabled={busy}>
        <CheckCircle size={18} /> {busy ? 'Confirming…' : `Confirm — I'll be there at ${formatTime(shift.start_time)}`}
      </Button>
      <p className="text-xs text-[#6B7A99]">Can't make it? Call or text dispatch at {dispatchPhone(data.settings).display}.</p>
      {error && <Warning>{error}</Warning>}
    </div>
  )
}

export function ConfirmedNote({ shift }: { shift: Shift }) {
  if (!shift.start_confirmed_at) return null
  return (
    <p className="text-xs font-medium text-[#2E7D52] flex items-center gap-1">
      <CheckCircle size={13} /> You confirmed {new Date(shift.start_confirmed_at).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', hour: 'numeric', minute: '2-digit' })}
    </p>
  )
}
