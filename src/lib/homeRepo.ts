import { assetUrl, getTeamAssets } from './teamAssets';
import { resolveSeasonId as resolveAppSeasonId } from './seasonResolver';
import { requireSupabaseClient } from './supabaseClient';
import { fetchTeamsByIds } from './teamsRepo';

const supabase = requireSupabaseClient();
const TTL_MS = 60_000;

export type HomeAnnouncement = {
  id: string;
  title: string;
  body: string;
};

export type HomeCoach = {
  user_id: string;
  display_name: string;
  psn: string | null;
  team_id: string | null;
  team_name: string | null;
  team_logo_url: string | null;
};

const cache = new Map<string, { at: number; value: unknown }>();

function text(value: unknown): string {
  return String(value || '').trim();
}

function isFresh(at: number) {
  return Date.now() - at < TTL_MS;
}

function getCached<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit || !isFresh(hit.at)) return null;
  return hit.value as T;
}

function setCached<T>(key: string, value: T): T {
  cache.set(key, { at: Date.now(), value });
  return value;
}

export async function fetchHomeAnnouncements(seasonSlug: string): Promise<HomeAnnouncement[]> {
  const cacheKey = `announcements:${text(seasonSlug).toLowerCase()}`;
  const cached = getCached<HomeAnnouncement[]>(cacheKey);
  if (cached) return cached;

  const filtered = await supabase
    .from('eg_announcements')
    .select('id,title,body')
    .eq('is_active', true)
    .or(`season_slug.is.null,season_slug.eq.${seasonSlug}`)
    .order('created_at', { ascending: false })
    .limit(3);

  const fallback = async () => {
    const res = await supabase
      .from('eg_announcements')
      .select('id,title,body')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(3);

    return ((res.data || []) as Array<Record<string, unknown>>)
      .map((row) => ({
        id: text(row.id),
        title: text(row.title),
        body: text(row.body),
      }))
      .filter((row) => row.id && row.title);
  };

  const rows =
    !filtered.error && Array.isArray(filtered.data) && filtered.data.length > 0
      ? (filtered.data as Array<Record<string, unknown>>)
          .map((row) => ({
            id: text(row.id),
            title: text(row.title),
            body: text(row.body),
          }))
          .filter((row) => row.id && row.title)
      : await fallback();

  return setCached(cacheKey, rows);
}

export async function fetchResolvedSeasonId(seasonSlug: string): Promise<string | null> {
  const cacheKey = `resolved-season:${text(seasonSlug).toLowerCase()}`;
  const cached = getCached<string | null>(cacheKey);
  if (cached !== null) return cached;

  try {
    const seasonId = await resolveAppSeasonId(supabase, seasonSlug, { preferFixtureRows: true });
    return setCached(cacheKey, seasonId);
  } catch {
    return setCached(cacheKey, null);
  }
}

export async function fetchProfileTeamId(userId: string): Promise<string | null> {
  const cacheKey = `profile-team:${text(userId)}`;
  const cached = getCached<string | null>(cacheKey);
  if (cached !== null) return cached;

  const primary = await supabase.from('eg_profiles').select('team_id').eq('user_id', userId).maybeSingle();
  if (!primary.error && primary.data?.team_id) return setCached(cacheKey, text(primary.data.team_id));

  const fallback = await supabase.from('profiles').select('team_id').eq('user_id', userId).maybeSingle();
  return setCached(cacheKey, text(fallback.data?.team_id) || null);
}

export async function fetchCurrentCoaches(): Promise<HomeCoach[]> {
  const cacheKey = 'current-coaches';
  const cached = getCached<HomeCoach[]>(cacheKey);
  if (cached) return cached;

  const fetchFromProfileTable = async (table: 'eg_profiles' | 'profiles'): Promise<HomeCoach[]> => {
    const profileRes = await supabase
      .from(table)
      .select('user_id,display_name,psn,team_id')
      .not('team_id', 'is', null);

    if (profileRes.error || !Array.isArray(profileRes.data) || !profileRes.data.length) {
      return [];
    }

    const profiles = profileRes.data as Array<Record<string, unknown>>;
    const teamIds = Array.from(new Set(profiles.map((row) => text(row.team_id)).filter(Boolean)));
    const teamsById = await fetchTeamsByIds(teamIds);

    return profiles
      .map((row) => {
        const teamId = text(row.team_id);
        if (!teamId) return null;
        const team = teamsById.get(teamId);
        const teamName = team?.name || 'Team assigned';
        return {
          user_id: text(row.user_id),
          display_name: text(row.display_name) || text(row.psn) || 'Coach',
          psn: text(row.psn) || null,
          team_id: teamId,
          team_name: teamName,
          team_logo_url: team?.logoUrl || getTeamAssets(teamName).logo || null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => text(a?.team_name).localeCompare(text(b?.team_name)) || text(a?.display_name).localeCompare(text(b?.display_name))) as HomeCoach[];
  };

  const rows = (await fetchFromProfileTable('eg_profiles')) || (await fetchFromProfileTable('profiles'));
  return setCached(cacheKey, rows);
}
