// One small data-access layer used everywhere. Talks to Supabase, or to the in-memory
// demo store when no Supabase keys are configured.
import { isDemoMode, supabase } from './supabase'
import { demoStore } from './demo-store'
import { PRIMARY_KEYS, type RowFilter, type TableName } from './tables'

export type { TableName, RowFilter } from './tables'

const PAGE = 1000

type Row = Record<string, unknown>

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

export const db = {
  /** All matching rows (pages past Supabase's 1000-row response limit). */
  async select<T>(table: TableName, filter?: RowFilter): Promise<T[]> {
    if (isDemoMode) return demoStore.select(table, filter) as T[]
    const out: T[] = []
    for (let from = 0; ; from += PAGE) {
      let q = supabase.from(table).select('*').order(PRIMARY_KEYS[table]).range(from, from + PAGE - 1)
      for (const [k, v] of Object.entries(filter?.eq ?? {})) q = q.eq(k, v as string)
      for (const [k, v] of Object.entries(filter?.gte ?? {})) q = q.gte(k, v)
      for (const [k, v] of Object.entries(filter?.lte ?? {})) q = q.lte(k, v)
      const { data, error } = await q
      fail(error)
      out.push(...((data ?? []) as T[]))
      if (!data || data.length < PAGE) return out
    }
  },

  async insert<T>(table: TableName, rows: Row | Row[]): Promise<T[]> {
    const list = Array.isArray(rows) ? rows : [rows]
    if (list.length === 0) return []
    if (isDemoMode) return demoStore.insert(table, list) as T[]
    const out: T[] = []
    for (let i = 0; i < list.length; i += 500) {
      const { data, error } = await supabase.from(table).insert(list.slice(i, i + 500)).select('*')
      fail(error)
      out.push(...((data ?? []) as T[]))
    }
    return out
  },

  async update(table: TableName, match: Row, patch: Row): Promise<void> {
    if (isDemoMode) { demoStore.update(table, match, patch); return }
    const { error } = await supabase.from(table).update(patch).match(match)
    fail(error)
  },

  async upsert(table: TableName, rows: Row | Row[]): Promise<void> {
    const list = Array.isArray(rows) ? rows : [rows]
    if (isDemoMode) { demoStore.upsert(table, list); return }
    const { error } = await supabase.from(table).upsert(list, { onConflict: PRIMARY_KEYS[table] })
    fail(error)
  },

  async remove(table: TableName, match: Row): Promise<void> {
    if (isDemoMode) { demoStore.remove(table, match); return }
    const { error } = await supabase.from(table).delete().match(match)
    fail(error)
  },

  /** Delete rows by primary key (in chunks). */
  async removeIds(table: TableName, ids: string[]): Promise<void> {
    if (ids.length === 0) return
    if (isDemoMode) { demoStore.removeIds(table, ids); return }
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await supabase.from(table).delete().in(PRIMARY_KEYS[table], ids.slice(i, i + 200))
      fail(error)
    }
  },

  /** Calls `fn` whenever rows in `table` change. Returns an unsubscribe function. */
  subscribe(table: TableName, fn: () => void): () => void {
    if (isDemoMode) return demoStore.subscribe(table, fn)
    const channel = supabase
      .channel(`rt:${table}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, fn)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  },
}
