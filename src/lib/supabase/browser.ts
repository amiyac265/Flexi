import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../backend/database.types.ts'
import { supabaseConfig } from './config.ts'
let client: SupabaseClient<Database> | undefined
/** Browser sessions persist via Supabase Auth. Never call this from a Server Component. */
export function browserSupabase() {
  if (typeof window === 'undefined') throw new Error('Use browserSupabase only in browser event handlers or effects.')
  if (!client) {
    const { url, key } = supabaseConfig()
    client = createClient<Database>(url, key)
  }
  return client
}
