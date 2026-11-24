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

// DEMO_TENANT_ID removed (TD-20): the app never falls back to a workspace the user isn't in.

export { supabaseAnonKey };
