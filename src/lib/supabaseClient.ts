import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  console.warn('[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Running in local mode.');
}

// Check if Supabase env is properly configured
export const hasSupabaseEnv = Boolean(url && anonKey);
let sharedClient: SupabaseClient | null = null;

// Safe factory function - returns null if env vars are missing
export function getSupabaseClient(): SupabaseClient | null {
  if (!hasSupabaseEnv) return null;
  if (!sharedClient) {
    sharedClient = createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return sharedClient;
}

// Legacy export for backwards compatibility
// For data fetching functions that already handle errors
export const supabase =
  getSupabaseClient() ??
  createClient(url ?? '', anonKey ?? '', {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
