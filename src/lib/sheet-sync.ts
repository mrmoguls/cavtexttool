// Reads the "Master Contact and Schedule" Google Sheet (Roster + Schedule tabs) and works out
// what to change in the app. The sheet is the source of truth for seniority, role, FT/PT,
// active status, phone and availability. Gurney qualification stays in the app.
import type { Availability, Employee, EmployeeContact, EmployeeRole, EmploymentType } from '../types'

export interface SheetValues {
  roster: string[][]
  schedule: string[][]
}

export interface SheetPerson {
  name: string
  key: string
  roleText: string
  role: EmployeeRole
  employment_type: EmploymentType
  can_dispatch: boolean
  bids_on_lines: boolean
  seniority_date: string | null
  hire_seq: number
  active: boolean
  phone: string | null
  availability: Availability | null
  availability_notes: string | null
  issues: string[]
}

export interface SkippedRow {
  name: string
  reason: string
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** "Jeremiah Town*" → "jeremiah town" (stars mark notes in the sheet). */
export function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z\s'-]/g, '').replace(/\s+/g, ' ').trim()
}

function cleanName(name: string): string {
  return name.replace(/\*/g, '').replace(/\s+/g, ' ').trim()
}

/** "10/17/2019" → "2019-10-17". */
export function parseUsDate(v: string | undefined): string | null {
  const m = (v ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
}

/** Map the sheet's role wording to the app. null = can't tell (row is skipped). */
export function mapRole(text: string): Pick<SheetPerson, 'role' | 'employment_type' | 'can_dispatch' | 'bids_on_lines'> & { issue?: string } | null {
  const t = text.toLowerCase()
  const dispatches = /dispatch|dipatch/.test(t)
  if (/owner|exec|director/.test(t)) {
    return {
      role: 'admin', employment_type: 'FT', can_dispatch: false, bids_on_lines: false,
      issue: /driver/.test(t) ? 'Owner/exec who also drives: set up as admin, so not scheduled on lines.' : undefined,
    }
  }
  if (/gurney/.test(t)) {
    const ft = /\bft\b/.test(t)
    return {
      role: 'attendant', employment_type: ft ? 'FT' : 'PT', can_dispatch: false, bids_on_lines: true,
      issue: !ft && !/\bpt\b/.test(t) ? `Role "${text}" doesn't say FT or PT; set up as part-time. Change the sheet to "FT Gurney tech" or "PT Gurney tech".` : undefined,
    }
  }
  if (/driver/.test(t)) {
    const backup = /backup|back-up/.test(t)
    const ft = /\bft\b/.test(t)
    const pt = /\bpt\b/.test(t)
    return {
      role: 'driver', employment_type: ft && !backup ? 'FT' : 'PT', can_dispatch: dispatches, bids_on_lines: !backup,
      issue: !ft && !pt && !backup ? `Role "${text}" doesn't say FT or PT; set up as part-time. Change the sheet to "FT Driver" or "PT Driver".` : undefined,
    }
  }
  if (dispatches || /billing/.test(t)) {
    return { role: 'dispatcher', employment_type: 'FT', can_dispatch: false, bids_on_lines: false }
  }
  return null
}

function headerIndex(header: string[], name: string): number {
  return header.findIndex(h => (h ?? '').trim().toLowerCase() === name.toLowerCase())
}

function parseAvailability(row: string[], cols: number[]): Availability | null {
  const out: Availability = {}
  let any = false
  cols.forEach((c, dow) => {
    const raw = (row[c] ?? '').trim()
    const n = raw === '' ? 0 : Number(raw)
    const v = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0
    if (raw !== '') any = true
    out[String(dow)] = v
  })
  return any ? out : null
}

export function parseSheet(values: SheetValues): { people: SheetPerson[]; skipped: SkippedRow[] } {
  const skipped: SkippedRow[] = []
  const [rHead = [], ...rRows] = values.roster
  const [sHead = [], ...sRows] = values.schedule
  const r = {
    name: headerIndex(rHead, 'Name'), role: headerIndex(rHead, 'Role'), start: headerIndex(rHead, 'Start date'),
    status: headerIndex(rHead, 'Status'),
  }
  const s = {
    name: headerIndex(sHead, 'Name'), phone: headerIndex(sHead, 'Phone'), role: headerIndex(sHead, 'Role'),
    notes: headerIndex(sHead, 'Notes'), days: DAYS.map(d => headerIndex(sHead, d)),
  }
  if (r.name < 0 || r.start < 0 || r.status < 0) throw new Error('The Roster tab needs Name, Role, Start date and Status columns.')
  if (s.name < 0 || s.days.some(c => c < 0)) throw new Error('The Schedule tab needs Name and Sunday–Saturday columns.')

  // Schedule tab rows by name (stop at the Totals row).
  const schedule = new Map<string, string[]>()
  for (const row of sRows) {
    const name = cleanName(row[s.name] ?? '')
    if (!name) continue
    if (/^totals?$/i.test(name)) break
    schedule.set(nameKey(name), row)
  }

  const people: SheetPerson[] = []
  const seen = new Set<string>()
  rRows.forEach((row, i) => {
    const name = cleanName(row[r.name] ?? '')
    if (!name) return
    const key = nameKey(name)
    seen.add(key)
    const status = (row[r.status] ?? '').trim().toLowerCase()
    if (status !== 'active' && status !== 'former') {
      skipped.push({ name, reason: `Status is "${row[r.status] ?? ''}" on the Roster tab, so not imported until it's Active or Former.` })
      return
    }
    const sched = schedule.get(key)
    const roleText = (row[r.role] ?? '').trim() || (sched && s.role >= 0 ? (sched[s.role] ?? '').trim() : '')
    const mapped = mapRole(roleText)
    if (!mapped) {
      skipped.push({ name, reason: roleText ? `Can't tell what role "${roleText}" is.` : 'No role on the Roster or Schedule tab.' })
      return
    }
    const issues: string[] = []
    if (mapped.issue) issues.push(mapped.issue)
    const seniority = parseUsDate(row[r.start])
    if (!seniority && status === 'active') issues.push('No start date on the Roster tab, so they sort last in seniority.')
    const phone = sched && s.phone >= 0 ? (sched[s.phone] ?? '').trim() || null : null
    const crew = mapped.role === 'driver' || mapped.role === 'attendant'
    if (status === 'active' && crew && !sched) issues.push('Not on the Schedule tab, so no phone or availability.')
    people.push({
      name, key, roleText,
      role: mapped.role, employment_type: mapped.employment_type, can_dispatch: mapped.can_dispatch, bids_on_lines: mapped.bids_on_lines,
      seniority_date: seniority,
      hire_seq: i + 1, // Roster row order breaks ties between people with the same start date
      active: status === 'active',
      phone,
      availability: sched ? parseAvailability(sched, s.days) : null,
      availability_notes: sched && s.notes >= 0 ? (sched[s.notes] ?? '').trim() || null : null,
      issues,
    })
  })

  for (const [key, row] of schedule) {
    if (seen.has(key)) continue
    skipped.push({ name: cleanName(row[s.name] ?? ''), reason: 'On the Schedule tab but not the Roster tab.' })
  }
  return { people, skipped }
}

// ─── Plan ─────────────────────────────────────────────────────────────────────

export interface SyncUpdate {
  employee: Employee
  person: SheetPerson
  changes: string[]
}

export interface SyncPlan {
  creates: SheetPerson[]
  updates: SyncUpdate[]
  unchanged: SheetPerson[]
  /** Active people in the app the sheet doesn't list. Left alone; shown for review. */
  notInSheet: Employee[]
  skipped: SkippedRow[]
}

const digits = (p: string | null | undefined) => (p ?? '').replace(/\D/g, '')
const ROLE_LABEL: Record<EmployeeRole, string> = { driver: 'Driver', attendant: 'Attendant', dispatcher: 'Dispatcher', admin: 'Admin' }

function sameAvailability(a: Availability | null | undefined, b: Availability | null | undefined) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

export function planSync(parsed: { people: SheetPerson[]; skipped: SkippedRow[] }, employees: Employee[], contacts: EmployeeContact[]): SyncPlan {
  const byKey = new Map(employees.map(e => [nameKey(e.name), e]))
  const contactOf = new Map(contacts.map(c => [c.employee_id, c]))
  const plan: SyncPlan = { creates: [], updates: [], unchanged: [], notInSheet: [], skipped: parsed.skipped }
  const matched = new Set<string>()

  for (const p of parsed.people) {
    const e = byKey.get(p.key)
    if (!e) {
      if (p.active) plan.creates.push(p)
      continue
    }
    matched.add(e.id)
    const c = contactOf.get(e.id)
    const ch: string[] = []
    if (e.role !== p.role) ch.push(`Role: ${ROLE_LABEL[e.role]} → ${ROLE_LABEL[p.role]}`)
    if (e.employment_type !== p.employment_type) ch.push(`${e.employment_type} → ${p.employment_type}`)
    if (!!e.can_dispatch !== p.can_dispatch) ch.push(p.can_dispatch ? 'Gets dispatch access' : 'Loses dispatch access')
    if ((e.bids_on_lines !== false) !== p.bids_on_lines) ch.push(p.bids_on_lines ? 'Bids on lines' : 'Backup: open shifts only, no line bidding')
    if ((e.seniority_date ?? null) !== p.seniority_date) ch.push(`Seniority date: ${e.seniority_date ?? 'none'} → ${p.seniority_date ?? 'none'}`)
    if ((e.hire_seq ?? null) !== p.hire_seq) ch.push('Hire order updated')
    if (e.active !== p.active) ch.push(p.active ? 'Reactivated' : 'Made inactive (Former)')
    // A blank phone in the sheet never erases one already on file (it would lock them out).
    if (p.phone && digits(p.phone) !== digits(c?.phone)) ch.push('Phone updated')
    if (!sameAvailability(c?.availability, p.availability)) ch.push('Availability updated')
    if ((c?.availability_notes ?? null) !== p.availability_notes) ch.push('Availability notes updated')
    if (!e.sheet_managed) ch.push('Now managed by the sheet')
    if (ch.length) plan.updates.push({ employee: e, person: p, changes: ch })
    else plan.unchanged.push(p)
  }
  plan.notInSheet = employees.filter(e => e.active && !matched.has(e.id))
  return plan
}
