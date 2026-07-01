import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const isDemoMode = !supabaseUrl || !supabaseAnonKey
  || supabaseUrl.includes('placeholder')
  || supabaseAnonKey.includes('placeholder')

export const supabase = isDemoMode
  ? null!
  : createClient(supabaseUrl, supabaseAnonKey, {
      realtime: { params: { eventsPerSecond: 10 } },
    })
