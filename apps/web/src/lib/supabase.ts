import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    detectSessionInUrl: false,
    persistSession: true,
    flowType: 'pkce',
  },
});

export const DEMO_TENANT_ID = import.meta.env.VITE_DEMO_TENANT_ID ?? '00000000-0000-0000-0000-000000000001';

export { supabaseAnonKey };
