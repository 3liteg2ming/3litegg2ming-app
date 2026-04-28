import { resolveTeamLogoUrl } from './entityResolvers';
import { getTeamAssets } from './teamAssets';
import { resolveSeasonId as resolveAppSeasonId } from './seasonResolver';
import { requireSupabaseClient } from './supabaseClient';

const supabase = requireSupabaseClient();
const TTL_MS = 60_000;

export type HomeAnnouncement = {
  id: string;
  title: string;
  body: string;
};

export type Coach = {
  user_id: string;
  display_name: string;
  psn?: string;
  team_id?: string;
  team_name?: string;
  team_logo_url?: string;
  team_key?: string;
};

type CoachProfileRow = {
  user_id?: string | null;
  display_name?: string | null;
  psn?: string | null;
  team_id?: string | null;
};

type CurrentCoachRpcRow = CoachProfileRow & {
  team_name?: string | null;
  team_logo_url?: string | null;
};

type TeamCoachRow = {
  id?: string | null;
  name?: string | null;
  short_name?: string | null;
  slug?: string | null;
  team_key?: string | null;
  logo_url?: string | null;
  logo_path?: string | null;
  coach_name?: string | null;
  coach_psn?: string | null;
};

export type HomeNewsItem = {
  id: string;
  title: string;
  category: string;
  image_url: string;
  caption: string;
  display_order: number;
  published_at: string;
};

const cache = new Map<string, { at: number; value: unknown }>();

export function invalidateCurrentCoachesCache() {
  cache.delete('current-coaches');
}

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

export async function fetchCurrentCoaches(): Promise<Coach[]> {
  const cacheKey = 'current-coaches';
  const cached = getCached<Coach[]>(cacheKey);
  if (cached) return cached;

  const fetchFromProfileTable = async (table: 'eg_profiles' | 'profiles'): Promise<CoachProfileRow[]> => {
    const profileRes = await supabase
      .from(table)
      .select('user_id,display_name,psn,team_id')
      .not('team_id', 'is', null);

    if (profileRes.error) {
      console.error(`[fetchCurrentCoaches] ${table} select error`, {
        code: profileRes.error.code,
        message: profileRes.error.message,
        details: profileRes.error.details,
        hint: profileRes.error.hint,
      });
      return [];
    }
    const rows = Array.isArray(profileRes.data) ? profileRes.data : [];
    console.log(`[fetchCurrentCoaches] ${table} returned ${rows.length} rows${rows.length > 0 ? `, first row keys: ${Object.keys(rows[0]).join(',')}` : ''}`);
    return rows as CoachProfileRow[];
  };

  const fetchFromCurrentCoachesRpc = async (): Promise<CurrentCoachRpcRow[]> => {
    try {
      const { data, error } = await supabase.rpc('eg_list_current_coaches');
      if (error) {
        console.error('[fetchCurrentCoaches] eg_list_current_coaches RPC error', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        });
        return [];
      }
      const rows = Array.isArray(data) ? data : [];
      console.log(`[fetchCurrentCoaches] RPC returned ${rows.length} rows${rows.length > 0 ? `, first row keys: ${Object.keys(rows[0]).join(',')}` : ''}`);
      return rows as CurrentCoachRpcRow[];
    } catch (err) {
      console.error('[fetchCurrentCoaches] RPC threw', err);
      return [];
    }
  };

  const fetchTeamCoachRows = async (teamIds: string[]): Promise<Map<string, TeamCoachRow>> => {
    const ids = Array.from(new Set(teamIds.map((value) => text(value)).filter(Boolean)));
    const query = supabase
      .from('eg_teams')
      .select('id,name,short_name,slug,team_key,logo_url,logo_path,coach_name,coach_psn');

    const { data, error } = ids.length
      ? await query.in('id', ids)
      : await query;

    if (error || !Array.isArray(data)) return new Map();

    const map = new Map<string, TeamCoachRow>();
    for (const row of data as TeamCoachRow[]) {
      const teamId = text(row.id);
      if (!teamId) continue;
      map.set(teamId, row);
    }
    return map;
  };

  const rpcRows = await fetchFromCurrentCoachesRpc();
  const profileRows = rpcRows.length > 0 ? rpcRows : await fetchFromProfileTable('eg_profiles');
  const fallbackRows = profileRows.length > 0 ? profileRows : await fetchFromProfileTable('profiles');
  const rows = profileRows.length > 0 ? profileRows : fallbackRows;

  const teamIds = Array.from(new Set(rows.map((row) => text(row.team_id)).filter(Boolean)));
  const teamsById = await fetchTeamCoachRows(teamIds);
  const mergedByTeam = new Map<string, Coach>();

  for (const row of rows) {
    const teamId = text(row.team_id);
    if (!teamId) continue;

    const team = teamsById.get(teamId);
    const teamName = text(team?.name || (row as CurrentCoachRpcRow).team_name);
    const lockedCoachName = text(team?.coach_name);
    const lockedCoachPsn = text(team?.coach_psn);
    const displayName = lockedCoachName || text(row.display_name) || text(row.psn) || 'Coach';
    const psn = lockedCoachPsn || text(row.psn) || undefined;
    const logoUrl = resolveTeamLogoUrl({
      logoUrl: text(team?.logo_url || team?.logo_path || (row as CurrentCoachRpcRow).team_logo_url) || null,
      slug: text(team?.slug) || null,
      teamKey: text(team?.team_key) || null,
      name: teamName || null,
      fallbackPath: getTeamAssets(teamName || '').logo || 'elite-gaming-logo.png',
    });

    mergedByTeam.set(teamId, {
      user_id: text(row.user_id) || `team:${teamId}`,
      display_name: displayName,
      psn: psn || undefined,
      team_id: teamId,
      team_name: teamName || undefined,
      team_logo_url: logoUrl || undefined,
      team_key: text(team?.team_key) || undefined,
    });
  }

  for (const [teamId, team] of teamsById.entries()) {
    if (mergedByTeam.has(teamId)) continue;
    const lockedCoachName = text(team.coach_name);
    const lockedCoachPsn = text(team.coach_psn);
    if (!lockedCoachName && !lockedCoachPsn) continue;

    const teamName = text(team.name);
    mergedByTeam.set(teamId, {
      user_id: `team:${teamId}`,
      display_name: lockedCoachName || lockedCoachPsn || 'Coach',
      psn: lockedCoachPsn || undefined,
      team_id: teamId,
      team_name: teamName || undefined,
      team_logo_url: resolveTeamLogoUrl({
        logoUrl: text(team.logo_url || team.logo_path) || null,
        slug: text(team.slug) || null,
        teamKey: text(team.team_key) || null,
        name: teamName || null,
        fallbackPath: getTeamAssets(teamName || '').logo || 'elite-gaming-logo.png',
      }) || undefined,
      team_key: text(team.team_key) || undefined,
    });
  }

  const resolved = Array.from(mergedByTeam.values()).sort(
    (a, b) => text(a.team_name).localeCompare(text(b.team_name)) || text(a.display_name).localeCompare(text(b.display_name)),
  );

  // Don't cache an empty result — allow the next render to retry
  if (resolved.length === 0) return resolved;

  return setCached(cacheKey, resolved);
}

export async function fetchHomepageNews(limit = 2): Promise<HomeNewsItem[]> {
  const cacheKey = `homepage-news:${limit}`;
  const cached = getCached<HomeNewsItem[]>(cacheKey);
  if (cached) return cached;

  const { data, error } = await supabase
    .from('eg_homepage_news')
    .select('id,title,category,image_url,caption,display_order,published_at')
    .eq('is_published', true)
    .order('display_order', { ascending: true })
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[homeRepo] fetchHomepageNews query error:', error.message, error.code, error.details);
    return setCached(cacheKey, []);
  }
  if (!Array.isArray(data)) {
    console.warn('[homeRepo] fetchHomepageNews returned non-array data:', data);
    return setCached(cacheKey, []);
  }

  const rows: HomeNewsItem[] = (data as Array<Record<string, unknown>>)
    .map((row) => ({
      id: text(row.id),
      title: text(row.title),
      category: text(row.category),
      image_url: text(row.image_url),
      caption: text(row.caption),
      display_order: Number(row.display_order) || 0,
      published_at: text(row.published_at),
    }))
    .filter((row) => row.id && row.title && row.image_url);

  return setCached(cacheKey, rows);
}

export async function fetchAllHomepageNews(): Promise<HomeNewsItem[]> {
  const { data, error } = await supabase
    .from('eg_homepage_news')
    .select('id,title,category,image_url,caption,display_order,is_published,published_at')
    .order('display_order', { ascending: true })
    .order('published_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[homeRepo] fetchAllHomepageNews query error:', error.message, error.code, error.details);
    return [];
  }
  if (!Array.isArray(data)) {
    console.warn('[homeRepo] fetchAllHomepageNews returned non-array data:', data);
    return [];
  }

  return (data as Array<Record<string, unknown>>).map((row) => ({
    id: text(row.id),
    title: text(row.title),
    category: text(row.category),
    image_url: text(row.image_url),
    caption: text(row.caption),
    display_order: Number(row.display_order) || 0,
    published_at: text(row.published_at),
    is_published: row.is_published !== false,
  })) as any[];
}

export async function upsertHomepageNews(item: {
  id?: string;
  title: string;
  category?: string;
  image_url: string;
  caption?: string;
  display_order?: number;
  is_published?: boolean;
}): Promise<{ id: string; error?: string } | null> {
  const payload: Record<string, unknown> = {
    title: item.title,
    image_url: item.image_url,
    category: item.category || null,
    caption: item.caption || null,
    display_order: item.display_order ?? 0,
    is_published: item.is_published !== false,
    updated_at: new Date().toISOString(),
  };
  if (item.id) payload.id = item.id;

  const { data, error } = await supabase
    .from('eg_homepage_news')
    .upsert(payload, { onConflict: 'id' })
    .select('id')
    .single();

  if (error) {
    console.error('[homeRepo] upsertHomepageNews error:', error.message, error.code, error.details);
    return null;
  }
  if (!data) {
    console.warn('[homeRepo] upsertHomepageNews returned no data');
    return null;
  }
  cache.delete('homepage-news:2');
  return { id: text((data as any).id) };
}

export async function deleteHomepageNews(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('eg_homepage_news').delete().eq('id', id);
  if (error) {
    console.error('[homeRepo] deleteHomepageNews error:', error.message, error.code, error.details);
    return { ok: false, error: error.message };
  }
  cache.delete('homepage-news:2');
  return { ok: true };
}

const ALLOWED_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg']);

export async function uploadNewsImage(file: File): Promise<{ url: string | null; error?: string }> {
  const rawExt = (file.name.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ext = ALLOWED_IMAGE_EXTENSIONS.has(rawExt) ? rawExt : 'jpg';
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const path = `news/${yyyy}/${mm}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage.from('Assets').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });

  if (error) {
    console.error('[homeRepo] uploadNewsImage storage error:', error.message, (error as any).statusCode);
    return { url: null, error: error.message };
  }

  const { data: urlData } = supabase.storage.from('Assets').getPublicUrl(path);
  const publicUrl = urlData?.publicUrl || null;
  if (!publicUrl) {
    console.warn('[homeRepo] uploadNewsImage: upload succeeded but getPublicUrl returned empty');
  }
  return { url: publicUrl };
}
