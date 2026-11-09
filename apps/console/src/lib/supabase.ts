import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const configMissing = !url || !anonKey;

// Console sessions live in sessionStorage: closing the tab signs you out.
export const supabase = createClient(url || 'http://localhost', anonKey || 'missing', {
  auth: {
    persistSession: true,
    storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
    storageKey: 'marbee-console-auth',
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});
