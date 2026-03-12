import { getDataSeasonSlugForCompetition, getStoredCompetitionKey } from './competitionRegistry';
import { resolveTeamLogoUrl, resolveTeamName } from './entityResolvers';
import { fetchSeasonFixtures, fetchSeasonFixturesBySeasonId, type FixtureRow } from './fixturesRepo';
import { resolveSeasonRecord } from './seasonResolver';
import { requireSupabaseClient } from './supabaseClient';

const supabase = requireSupabaseClient();
const TTL_MS = 60_000;

type SeasonRecord = {
  id: string;
  slug: string;
};

type TeamRow = {
  id?: string | null;
  name?: string | null;
  slug?: string | null;
  short_name?: string | null;
  team_key?: string | null;
  logo_url?: string | null;
  logo_path?: string | null;
};

export type BaselineTeam = {
  id: string;
  name: string;
  slug: string;
  shortName: string;
  teamKey: string;
  logoUrl: string | null;
};

type BaselineResult = {
  season: SeasonRecord;
  fixtures: FixtureRow[];
  teams: BaselineTeam[];
};

const cache = new Map<string, { at: number; value: BaselineResult }>();

function text(value: unknown): string {
  return String(value || '').trim();
}

function cacheKey(args: { seasonSlug?: string | null; seasonId?: string | null }) {
  return `${text(args.seasonSlug).toLowerCase()}::${text(args.seasonId)}`;
}

function isFresh(at: number) {
  return Date.now() - at < TTL_MS;
}

function mapTeamRow(row: TeamRow): BaselineTeam | null {
  const id = text(row.id);
  if (!id) return null;

  const slug = text(row.slug) || text(row.team_key);
  const name =
    resolveTeamName({
      name: text(row.name) || null,
      shortName: text(row.short_name) || null,
      slug: slug || null,
      teamKey: text(row.team_key) || null,
    }) || 'Unknown';

  return {
    id,
    name,
    slug,
    shortName: text(row.short_name) || name,
    teamKey: text(row.team_key) || slug,
    logoUrl: resolveTeamLogoUrl({
      logoUrl: text(row.logo_url) || text(row.logo_path) || null,
      slug: slug || null,
      teamKey: text(row.team_key) || null,
      name,
    }),
  };
}

async function fetchTeamsByIds(teamIds: string[]): Promise<BaselineTeam[]> {
  const ids = Array.from(new Set(teamIds.map(text).filter(Boolean)));
  if (!ids.length) return [];

  const attempts = [
    'id,name,slug,short_name,team_key,logo_url,logo_path',
    'id,name,slug,team_key,logo_url,logo_path',
    'id,name,slug,short_name,team_key,logo_url',
    'id,name,slug,team_key,logo_url',
    'id,name,slug,team_key',
    'id,name,slug',
    'id,name',
  ] as const;

  for (const selectCols of attempts) {
    const { data, error } = await supabase.from('eg_teams').select(selectCols).in('id', ids);
    if (error) continue;

    const mapped = ((data || []) as TeamRow[])
      .map(mapTeamRow)
      .filter((team): team is BaselineTeam => team !== null);

    if (mapped.length > 0) {
      const order = new Map(ids.map((id, index) => [id, index]));
      return mapped.sort((a, b) => (order.get(a.id) ?? 9999) - (order.get(b.id) ?? 9999));
    }
  }

  return [];
}

async function fetchAllTeamsFallback(): Promise<BaselineTeam[]> {
  const attempts = [
    'id,name,slug,short_name,team_key,logo_url,logo_path',
    'id,name,slug,team_key,logo_url',
    'id,name,slug,team_key',
    'id,name,slug',
    'id,name',
  ] as const;

  for (const selectCols of attempts) {
    const { data, error } = await supabase.from('eg_teams').select(selectCols).limit(100);
    if (error) continue;
    return ((data || []) as TeamRow[])
      .map(mapTeamRow)
      .filter((team): team is BaselineTeam => team !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return [];
}

async function fetchFixturesBaseline(args: { seasonSlug?: string | null; seasonId?: string | null; season: SeasonRecord }) {
  const slug = text(args.seasonSlug || args.season.slug);
  if (slug) {
    try {
      const bySlug = await fetchSeasonFixtures(slug, { limit: 2000, offset: 0 });
      if (bySlug.fixtures.length > 0) {
        return {
          season: {
            id: text(bySlug.season.id) || args.season.id,
            slug: text(bySlug.season.slug) || args.season.slug,
          },
          fixtures: bySlug.fixtures,
        };
      }
    } catch {
      // fall through to season id path
    }
  }

  const seasonId = text(args.seasonId || args.season.id);
  if (seasonId) {
    const bySeasonId = await fetchSeasonFixturesBySeasonId(seasonId, { limit: 2000, offset: 0 });
    return {
      season: {
        id: seasonId,
        slug: text(args.season.slug) || seasonId,
      },
      fixtures: bySeasonId.fixtures,
    };
  }

  return { season: args.season, fixtures: [] as FixtureRow[] };
}

export async function fetchSeasonBaseline(args: { seasonSlug?: string | null; seasonId?: string | null }): Promise<BaselineResult> {
  const key = cacheKey(args);
  const cached = cache.get(key);
  if (cached && isFresh(cached.at)) return cached.value;

  const requestedSeasonSlug = text(args.seasonSlug).toLowerCase() || getDataSeasonSlugForCompetition(getStoredCompetitionKey());
  const resolvedSeason = await resolveSeasonRecord(supabase, requestedSeasonSlug, { preferFixtureRows: false });
  const fixtureBaseline = await fetchFixturesBaseline({
    seasonSlug: requestedSeasonSlug,
    seasonId: args.seasonId,
    season: resolvedSeason,
  });

  const teamIds = Array.from(
    new Set(
      fixtureBaseline.fixtures
        .flatMap((fixture) => [text(fixture.home_team_id), text(fixture.away_team_id)])
        .filter(Boolean),
    ),
  );

  const teams = teamIds.length > 0 ? await fetchTeamsByIds(teamIds) : await fetchAllTeamsFallback();
  const value = {
    season: fixtureBaseline.season,
    fixtures: fixtureBaseline.fixtures,
    teams,
  };

  cache.set(key, { at: Date.now(), value });
  return value;
}

export async function fetchActiveCompetitionBaseline(): Promise<BaselineResult> {
  const seasonSlug = getDataSeasonSlugForCompetition(getStoredCompetitionKey());
  return fetchSeasonBaseline({ seasonSlug });
}

export function clearSeasonParticipantsCache() {
  cache.clear();
}
