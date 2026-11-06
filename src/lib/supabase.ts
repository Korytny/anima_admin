import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !key) {
  throw new Error('Не заданы VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY в .env.local')
}

// Только publishable/anon-ключ! service_role во фронтенд не попадает никогда.
export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
})
