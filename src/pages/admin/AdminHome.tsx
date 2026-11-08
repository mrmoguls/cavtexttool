import { useMemo, useState, type ReactNode } from 'react'
import { useData } from '../../lib/data-context'
import { computeCoverage, dueStatus, formatDate, todayISO } from '../../lib/scheduling'
import { Card } from '../../components/ui/Card'
import { ScrollBody } from '../../components/ui/Form'
import { AdminEmployees } from './AdminEmployees'
import { AdminBlocks } from './AdminBlocks'
import { AdminLines } from './AdminLines'
import { AdminCoverage } from './AdminCoverage'
import { AdminSchedule } from './AdminSchedule'
import { AdminBidding } from './AdminBidding'
import { AdminCertifications } from './AdminCertifications'
import { Users, Clock, Rows3, CalendarCheck, ChevronRight, CalendarRange, Gavel, BadgeCheck } from 'lucide-react'

type Section = 'menu' | 'employees' | 'blocks' | 'lines' | 'coverage' | 'schedule' | 'bidding' | 'certs'

export function AdminHome() {
  const [section, setSection] = useState<Section>('menu')
  const data = useData()

  const shortSlots = useMemo(() => computeCoverage({
    blocks: data.blocks, lines: data.lines, lineDays: data.lineDays, requirements: data.coverage,
    assignments: data.assignments, employees: data.employees, asOf: todayISO(),
  }).reduce((n, d) => n + d.cells.filter(c => c.status === 'short').length, 0),
  [data.blocks, data.lines, data.lineDays, data.coverage, data.assignments, data.employees])

  const back = () => setSection('menu')
  if (section === 'employees') return <AdminEmployees onBack={back} />
  if (section === 'blocks') return <AdminBlocks onBack={back} />
  if (section === 'coverage') return <AdminCoverage onBack={back} />
  if (section === 'schedule') return <AdminSchedule onBack={back} />
  if (section === 'bidding') return <AdminBidding onBack={back} />
  if (section === 'certs') return <AdminCertifications onBack={back} />
  if (section === 'lines') return <AdminLines onBack={back} onOffer={() => setSection('bidding')} />

  const activeEmployees = data.employees.filter(e => e.active)
  const missingPhone = activeEmployees.filter(e => !data.contacts.find(c => c.employee_id === e.id)?.phone.replace(/\D/g, '').slice(-4).match(/^\d{4}$/)).length
  const openLines = data.lines.filter(l => l.active && !data.assignments.some(a => a.line_id === l.id && a.effective_from <= todayISO() && (!a.effective_to || a.effective_to >= todayISO()))).length

  return (
    <ScrollBody>
      {(() => {
        const t = todayISO()
        const activeIds = new Set(data.employees.filter(e => e.active).map(e => e.id))
        const its = data.complianceItems.filter(i => activeIds.has(i.employee_id))
        const overdue = its.filter(i => dueStatus(i, t).level === 'overdue').length
        const soon = its.filter(i => ['due7', 'due30'].includes(dueStatus(i, t).level)).length
        return (
          <MenuCard
            icon={<BadgeCheck size={20} />}
            title="Certifications"
            subtitle={its.length === 0 ? 'Sync the Due Dates tab from the sheet' : overdue || soon ? `${overdue} overdue · ${soon} due within 30 days` : 'Everything current'}
            alert={overdue > 0}
            onClick={() => setSection('certs')}
          />
        )
      })()}
      <MenuCard
        icon={<CalendarCheck size={20} />}
        title="Coverage"
        subtitle={shortSlots === 0 ? 'Every required block is covered' : `${shortSlots} uncovered block${shortSlots === 1 ? '' : 's'} in a typical week`}
        alert={shortSlots > 0}
        onClick={() => setSection('coverage')}
      />
      <MenuCard
        icon={<CalendarRange size={20} />}
        title="Schedule"
        subtitle={data.generatedThrough
          ? `Shifts generated through ${formatDate(data.generatedThrough)}`
          : 'No shifts generated yet'}
        alert={!data.generatedThrough || data.generatedThrough < todayISO()}
        onClick={() => setSection('schedule')}
      />
      <MenuCard
        icon={<Gavel size={20} />}
        title="Line bidding"
        subtitle={(() => {
          const open = data.bidPeriods.find(p => p.status === 'open')
          const review = data.bidPeriods.find(p => p.status === 'closed')
          if (review) return `${review.name}: results ready to review`
          if (open) return `${open.name}: bidding open`
          return 'Set up a bid for the next quarter or a growth line'
        })()}
        alert={data.bidPeriods.some(p => p.status === 'closed')}
        onClick={() => setSection('bidding')}
      />
      <MenuCard
        icon={<Users size={20} />}
        title="Employees"
        subtitle={`${activeEmployees.length} active${missingPhone ? ` · ${missingPhone} can't sign in (no phone)` : ''}`}
        alert={missingPhone > 0}
        onClick={() => setSection('employees')}
      />
      <MenuCard
        icon={<Rows3 size={20} />}
        title="Lines"
        subtitle={`${data.lines.filter(l => l.active).length} active · ${openLines} without a holder`}
        onClick={() => setSection('lines')}
      />
      <MenuCard
        icon={<Clock size={20} />}
        title="Blocks"
        subtitle={`${data.blocks.filter(b => b.active).length} shift types`}
        onClick={() => setSection('blocks')}
      />
    </ScrollBody>
  )
}

function MenuCard({ icon, title, subtitle, alert, onClick }: {
  icon: ReactNode; title: string; subtitle: string; alert?: boolean; onClick: () => void
}) {
  return (
    <Card onClick={onClick}>
      <div className="flex items-center gap-3">
        <div className={`rounded-xl p-2.5 ${alert ? 'bg-[#FCE9E9] text-[#CC2A2A]' : 'bg-[#EEF1F8] text-[#1B2E6B]'}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[#0B1A5C]">{title}</p>
          <p className={`text-sm ${alert ? 'text-[#CC2A2A]' : 'text-[#6B7A99]'}`}>{subtitle}</p>
        </div>
        <ChevronRight size={18} className="text-[#6B7A99]" />
      </div>
    </Card>
  )
}
