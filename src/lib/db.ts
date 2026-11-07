// One small data-access layer used everywhere. Talks to Supabase, or to the in-memory
// demo store when no Supabase keys are configured.
import { isDemoMode, supabase } from './supabase'
import { demoStore } from './demo-store'
import { PRIMARY_KEYS, type TableName } from './tables'

export type { TableName } from './tables'

type Row = Record<string, unknown>

function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message)
}

export const db = {
  async select<T>(table: TableName): Promise<T[]> {
    if (isDemoMode) return demoStore.select(table) as T[]
    const { data, error } = await supabase.from(table).select('*')
    fail(error)
    return (data ?? []) as T[]
  },

  async insert<T>(table: TableName, rows: Row | Row[]): Promise<T[]> {
    const list = Array.isArray(rows) ? rows : [rows]
    if (isDemoMode) return demoStore.insert(table, list) as T[]
    const { data, error } = await supabase.from(table).insert(list).select('*')
    fail(error)
    return (data ?? []) as T[]
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
