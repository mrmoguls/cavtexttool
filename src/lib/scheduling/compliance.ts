// Certification / expiration status, computed from the next-due date synced from the sheet.
import type { ComplianceItem } from '../../types'

export type DueLevel = 'overdue' | 'due7' | 'due30' | 'due60' | 'ok' | 'done' | 'nodate'

export interface DueStatus {
  level: DueLevel
  /** Days until due (negative = overdue); null when there's no due date. */
  days: number | null
  label: string
}

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((new Date(`${toISO}T12:00:00Z`).getTime() - new Date(`${fromISO}T12:00:00Z`).getTime()) / 86_400_000)
}

/** Alert levels: 60 / 30 / 7 days before, then overdue. */
export function dueStatus(item: Pick<ComplianceItem, 'next_due' | 'sheet_status' | 'last_completed'>, today: string): DueStatus {
  if (!item.next_due) {
    if (/done/i.test(item.sheet_status ?? '') || item.last_completed) return { level: 'done', days: null, label: 'Done' }
    return { level: 'nodate', days: null, label: 'No date on file' }
  }
  const days = daysBetween(today, item.next_due)
  if (days < 0) return { level: 'overdue', days, label: `Overdue by ${-days} day${days === -1 ? '' : 's'}` }
  const label = days === 0 ? 'Due today' : `Due in ${days} day${days === 1 ? '' : 's'}`
  if (days <= 7) return { level: 'due7', days, label }
  if (days <= 30) return { level: 'due30', days, label }
  if (days <= 60) return { level: 'due60', days, label }
  return { level: 'ok', days, label }
}

export const NEEDS_ATTENTION: DueLevel[] = ['overdue', 'due7', 'due30', 'due60']

/** Requirements that make it unsafe or illegal to drive when lapsed. */
export function isDrivingCritical(requirement: string): boolean {
  return /licen[cs]e|mcsa|medical exam/i.test(requirement)
}

/** Overdue driving-critical items for one person (e.g. an expired license). */
export function drivingBlockers(items: ComplianceItem[], employeeId: string, today: string): ComplianceItem[] {
  return items.filter(i => i.employee_id === employeeId && isDrivingCritical(i.requirement) && dueStatus(i, today).level === 'overdue')
}

/** The alert level a daily run would send now (mirrors run_daily_alerts() in the database). */
export function alertLevel(item: Pick<ComplianceItem, 'next_due'>, today: string): ComplianceItem['last_alert_level'] {
  if (!item.next_due) return null
  const d = daysBetween(today, item.next_due)
  if (d < 0) return 'overdue'
  if (d <= 7) return '7'
  if (d <= 30) return '30'
  if (d <= 60) return '60'
  return null
}
