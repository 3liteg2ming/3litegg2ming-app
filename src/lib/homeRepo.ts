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
