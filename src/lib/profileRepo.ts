import { requireSupabaseClient } from './supabaseClient';

const supabase = requireSupabaseClient();

export type CoachProfile = {
  user_id: string;
  display_name: string | null;
  psn: string | null;
  email: string | null;
  team_id: string | null;
  role: string | null;
  is_admin: boolean;
  is_banned: boolean;
  source_table: 'eg_profiles' | 'profiles';
};

function normalizeBool(value: unknown): boolean {
  if (value === true) return true;
  if (value === false) return false;
  const s = String(value || '').trim().toLowerCase();
  if (s === 'true' || s === 't' || s === '1' || s === 'yes' || s === 'y') return true;
  return false;
}

function normalizeRole(value: unknown): string | null {
  const raw = String(value || '').trim();
  return raw ? raw : null;
}

function computeIsAdmin(row: any): boolean {
  if (!row) return false;
  if (normalizeBool(row.is_admin)) return true;
  const role = normalizeRole(row.role);
  if (!role) return false;
  const r = role.toLowerCase();
  return r === 'admin' || r === 'super_admin' || r === 'superadmin';
}

function normalizeProfile(row: any, source_table: CoachProfile['source_table']): CoachProfile {
  const user_id = String(row?.user_id || row?.id || '').trim();
  return {
    user_id,
    display_name: row?.display_name ? String(row.display_name) : null,
    psn: row?.psn ? String(row.psn) : null,
    email: row?.email ? String(row.email) : null,
    team_id: row?.team_id ? String(row.team_id) : null,
    role: normalizeRole(row?.role),
    is_admin: computeIsAdmin(row),
    is_banned: normalizeBool(row?.is_banned),
    source_table,
  };
}

async function fetchFromTable(table: CoachProfile['source_table'], userId: string): Promise<CoachProfile | null> {
  const uid = String(userId || '').trim();
  if (!uid) return null;

  // Using '*' avoids brittle column selection when schemas differ.
  const { data, error } = await supabase.from(table).select('*').eq('user_id', uid).maybeSingle();
  if (error || !data) return null;

  const profile = normalizeProfile(data, table);
  if (!profile.user_id) return null;
  return profile;
}

/**
 * Fetches the signed-in coach profile.
 * - Prefers profiles (live source of truth)
 * - Falls back to eg_profiles (legacy mirror)
 */
export async function fetchCoachProfile(userId: string): Promise<CoachProfile | null> {
  const uid = String(userId || '').trim();
  if (!uid) return null;

  const primary = await fetchFromTable('profiles', uid);
  if (import.meta.env.DEV) {
    console.log('[profileRepo] profiles row', primary);
  }
  if (primary) return primary;

  const legacy = await fetchFromTable('eg_profiles', uid);
  if (import.meta.env.DEV) {
    console.log('[profileRepo] eg_profiles fallback row', legacy);
  }
  if (legacy) return legacy;

  // Some older builds used eg_profiles.id = auth.users.id.
  // Try that shape as a last resort (no crash, just best effort).
  const { data, error } = await supabase.from('eg_profiles').select('*').eq('id', uid).maybeSingle();
  if (!error && data) {
    const row = { ...data, user_id: (data as any).user_id || (data as any).id || uid };
    const profile = normalizeProfile(row, 'eg_profiles');
    if (profile.user_id) return profile;
  }

  return null;
}

export async function isUserAdmin(userId: string): Promise<boolean> {
  const profile = await fetchCoachProfile(userId);
  return profile?.is_admin === true;
}

export async function updateCoachProfile(userId: string, patch: Record<string, any>): Promise<void> {
  const uid = String(userId || '').trim();
  if (!uid) throw new Error('Missing user id');

  // Prefer updating the new schema, but fall back to legacy.
  const attempt = await supabase.from('eg_profiles').update(patch).eq('user_id', uid);
  if (!attempt.error) return;

  const legacy = await supabase.from('profiles').update(patch).eq('user_id', uid);
  if (!legacy.error) return;

  throw new Error(legacy.error?.message || attempt.error?.message || 'Failed to update profile');
}
