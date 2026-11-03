import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../backend/database.types.ts'
import { supabaseConfig } from './config.ts'
/** Per-request client. The publishable key + user's JWT enforce database RLS. */
export function serverSupabase(accessToken?: string) {
  const { url, key } = supabaseConfig()
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {}),
  })
}
