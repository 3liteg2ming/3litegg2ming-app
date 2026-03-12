import { resolveTeamKey, resolveTeamLogoUrl, resolveTeamName } from './entityResolvers';
import { requireSupabaseClient } from './supabaseClient';

const supabase = requireSupabaseClient();
const TTL_MS = 60_000;

type CachedValue<T> = {
  at: number;
  value: T;
};

type RawTeamRow = {
  id?: string | null;
  name?: string | null;
  short_name?: string | null;
  slug?: string | null;
  team_key?: string | null;
  logo_url?: string | null;
  logo_path?: string | null;
  primary_color?: string | null;
};

export type TeamRecord = {
  id: string;
  name: string;
  shortName: string;
  slug: string | null;
  teamKey: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
};

export type TeamOption = {
  id: string;
  name: string;
};

const teamListCache = new Map<string, CachedValue<TeamRecord[]>>();
const teamByIdCache = new Map<string, CachedValue<Map<string, TeamRecord>>>();
const teamCountCache = new Map<string, CachedValue<number>>();

function text(value: unknown): string {
  return String(value || '').trim();
}

function isFresh(at: number) {
  return Date.now() - at < TTL_MS;
}

function normalizeTeam(row: RawTeamRow): TeamRecord | null {
  const id = text(row.id);
  if (!id) return null;

  const slug = text(row.slug) || null;
  const teamKey = text(row.team_key) || null;
  const name = resolveTeamName({
    name: text(row.name) || null,
    shortName: text(row.short_name) || null,
    slug,
    teamKey,
  });
  const shortName = text(row.short_name) || name || 'Unknown';
  const logoUrl = resolveTeamLogoUrl({
    logoUrl: text(row.logo_url) || text(row.logo_path) || null,
    slug,
    teamKey,
    name,
  });

  return {
    id,
    name: name || 'Unknown',
    shortName,
    slug,
    teamKey: text(resolveTeamKey({ slug, teamKey, name })) || null,
    logoUrl: logoUrl || null,
    primaryColor: text(row.primary_color) || null,
  };
}

export async function fetchTeams(): Promise<TeamRecord[]> {
  const cacheKey = 'all';
  const cached = teamListCache.get(cacheKey);
  if (cached && isFresh(cached.at)) return cached.value;

  const { data, error } = await supabase
    .from('eg_teams')
    .select('id,name,short_name,slug,team_key,logo_url,logo_path,primary_color')
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);

  const rows = ((data || []) as RawTeamRow[]).map(normalizeTeam).filter(Boolean) as TeamRecord[];
  teamListCache.set(cacheKey, { at: Date.now(), value: rows });
  return rows;
}

export async function fetchTeamOptions(): Promise<TeamOption[]> {
  const teams = await fetchTeams();
  return teams.map((team) => ({ id: team.id, name: team.name || 'Unknown' }));
}

export async function fetchTeamsByIds(teamIds: string[]): Promise<Map<string, TeamRecord>> {
  const normalizedIds = Array.from(new Set(teamIds.map((value) => text(value)).filter(Boolean)));
  const cacheKey = normalizedIds.slice().sort().join(',');
  const cached = teamByIdCache.get(cacheKey);
  if (cached && isFresh(cached.at)) return cached.value;

  if (!normalizedIds.length) return new Map();

  const { data, error } = await supabase
    .from('eg_teams')
    .select('id,name,short_name,slug,team_key,logo_url,logo_path,primary_color')
    .in('id', normalizedIds);

  if (error) throw new Error(error.message);

  const map = new Map<string, TeamRecord>();
  for (const row of ((data || []) as RawTeamRow[]).map(normalizeTeam).filter(Boolean) as TeamRecord[]) {
    map.set(row.id, row);
  }

  teamByIdCache.set(cacheKey, { at: Date.now(), value: map });
  return map;
}

export async function countTeamsMissingLogos(): Promise<number> {
  const cacheKey = 'missing-logos';
  const cached = teamCountCache.get(cacheKey);
  if (cached && isFresh(cached.at)) return cached.value;

  const { count, error } = await supabase
    .from('eg_teams')
    .select('id', { count: 'exact', head: true })
    .or('logo_url.is.null,logo_url.eq.');

  if (error) throw new Error(error.message);
  const value = Number(count || 0);
  teamCountCache.set(cacheKey, { at: Date.now(), value });
  return value;
}

export async function countTeams(): Promise<number> {
  const cacheKey = 'count';
  const cached = teamCountCache.get(cacheKey);
  if (cached && isFresh(cached.at)) return cached.value;

  const { count, error } = await supabase.from('eg_teams').select('id', { count: 'exact', head: true });
  if (error) throw new Error(error.message);

  const value = Number(count || 0);
  teamCountCache.set(cacheKey, { at: Date.now(), value });
  return value;
}
