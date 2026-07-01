import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

type TableName = 'announcements' | 'announcement_views' | 'messages' | 'drivers'

export function useRealtimeTable(table: TableName, onUpdate: () => void) {
  const cbRef = useRef(onUpdate)
  cbRef.current = onUpdate

  useEffect(() => {
    const channel = supabase
      .channel(`realtime:${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        cbRef.current()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [table])
}
