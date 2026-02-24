import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Vite env vars (preferred)
const url = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;

export const hasSupabaseEnv = Boolean(url && anonKey);

export function getSupabaseClient(): SupabaseClient | null {
  if (!hasSupabaseEnv) return null;
  return createClient(url!, anonKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}
