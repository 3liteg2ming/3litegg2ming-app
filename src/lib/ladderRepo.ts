import { resolveTeamLogoUrl, resolveTeamName } from './entityResolvers';
import { fetchSeasonFixtures, fetchSeasonFixturesBySeasonId, type FixtureRow as NormalizedFixtureRow } from './fixturesRepo';
import { fetchSeasonBaseline } from './seasonParticipantsRepo';
import { resolveSeasonRecord } from './seasonResolver';
import { requireSupabaseClient } from './supabaseClient';

const supabase = requireSupabaseClient();
const TTL_MS = 60_000;

export type LadderRowRecord = {
  season_id: string;
  team_id: string;
  team_name: string;
  team_slug: string;
  team_logo_url: string | null;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  pf: number;
  pa: number;
  points: number;
  percentage: number;
  last5_results: string[];
};

export type LadderSnapshotRow = {
  team_name: string;
  points: number;
};

type CachedValue<T> = {
  at: number;
  value: T;
};

const ladderCache = new Map<string, CachedValue<LadderRowRecord[]>>();
const snapshotCache = new Map<string, CachedValue<LadderSnapshotRow[]>>();

function text(value: unknown): string {
  return String(value || '').trim();
}

function isFresh(at: number) {
  return Date.now() - at < TTL_MS;
}

type TeamRow = {
  id?: string | null;
  name?: string | null;
  slug?: string | null;
  short_name?: string | null;
  team_key?: string | null;
  logo_url?: string | null;
};

function mapTeamRow(team: TeamRow, seasonId: string): LadderRowRecord {
  const teamSlug = text(team.slug) || text(team.team_key);
  const teamName = resolveTeamName({
    name: text(team.name) || null,
    shortName: text(team.short_name) || null,
    slug: teamSlug || null,
  });

  return {
    season_id: seasonId,
    team_id: text(team.id),
    team_name: teamName || 'Unknown',
    team_slug: teamSlug,
    team_logo_url: resolveTeamLogoUrl({
      logoUrl: text(team.logo_url) || null,
      slug: teamSlug || null,
      name: teamName,
    }),
    played: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    pf: 0,
    pa: 0,
    points: 0,
    percentage: 0,
    last5_results: [],
  };
}

function ensureRow(
  rowsByTeamId: Map<string, LadderRowRecord>,
  seasonId: string,
  args: { teamId: string; teamName?: string | null; teamSlug?: string | null },
): LadderRowRecord | null {
  const teamId = text(args.teamId);
  if (!teamId) return null;

  const existing = rowsByTeamId.get(teamId);
  if (existing) return existing;

  const teamSlug = text(args.teamSlug);
  const teamName = resolveTeamName({
    name: text(args.teamName) || null,
    slug: teamSlug || null,
  });

  const row: LadderRowRecord = {
    season_id: seasonId,
    team_id: teamId,
    team_name: teamName || 'Unknown',
    team_slug: teamSlug,
    team_logo_url: resolveTeamLogoUrl({
      slug: teamSlug || null,
      name: teamName || null,
    }),
    played: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    pf: 0,
    pa: 0,
    points: 0,
    percentage: 0,
    last5_results: [],
  };

  rowsByTeamId.set(teamId, row);
  return row;
}

async function fetchLadderRowsForSeason(args: { seasonId: string; seasonSlug?: string | null }): Promise<LadderRowRecord[]> {
  const seasonId = text(args.seasonId);
  const baseline = await fetchSeasonBaseline({ seasonId, seasonSlug: args.seasonSlug });
  const teams = baseline.teams.length > 0
    ? baseline.teams.map((team) => ({
        id: team.id,
        name: team.name,
        slug: team.slug,
        short_name: team.shortName,
        team_key: team.teamKey,
        logo_url: team.logoUrl,
      } satisfies TeamRow))
    : [];
  const rowsByTeamId = new Map<string, LadderRowRecord>();
  for (const team of teams) {
    const row = mapTeamRow(team, seasonId);
    rowsByTeamId.set(row.team_id, row);
  }

  let fixtures: NormalizedFixtureRow[] = baseline.fixtures;
  if (fixtures.length === 0) {
    try {
      if (text(args.seasonSlug)) {
        const result = await fetchSeasonFixtures(text(args.seasonSlug), { limit: 2000, offset: 0 });
        fixtures = result.fixtures;
      }
    } catch {
      fixtures = [];
    }
  }

  if (fixtures.length === 0) {
    try {
      const result = await fetchSeasonFixturesBySeasonId(seasonId, { limit: 2000, offset: 0 });
      fixtures = result.fixtures;
    } catch {
      return Array.from(rowsByTeamId.values()).sort((a, b) => a.team_name.localeCompare(b.team_name));
    }
  }

  const finalFixtures = fixtures
    .filter((fixture) => text(fixture.home_team_id) && text(fixture.away_team_id))
    .filter((fixture) => fixture.is_final && fixture.home_total != null && fixture.away_total != null);

  for (const fixture of finalFixtures) {
    const homeTeamId = text(fixture.home_team_id);
    const awayTeamId = text(fixture.away_team_id);
    const home = ensureRow(rowsByTeamId, seasonId, {
      teamId: homeTeamId,
      teamName: fixture.home_team_name,
      teamSlug: fixture.home_team_slug,
    });
    const away = ensureRow(rowsByTeamId, seasonId, {
      teamId: awayTeamId,
      teamName: fixture.away_team_name,
      teamSlug: fixture.away_team_slug,
    });
    if (!home || !away) continue;

    const homeTotal = Number(fixture.home_total || 0);
    const awayTotal = Number(fixture.away_total || 0);

    home.played += 1;
    away.played += 1;
    home.pf += homeTotal;
    home.pa += awayTotal;
    away.pf += awayTotal;
    away.pa += homeTotal;

    if (homeTotal > awayTotal) {
      home.wins += 1;
      home.points += 4;
      away.losses += 1;
    } else if (homeTotal < awayTotal) {
      away.wins += 1;
      away.points += 4;
      home.losses += 1;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 2;
      away.points += 2;
    }
  }

  const fixturesNewestFirst = [...finalFixtures].sort((a, b) => {
    const aTime = a.start_time ? new Date(a.start_time).getTime() : 0;
    const bTime = b.start_time ? new Date(b.start_time).getTime() : 0;
    if (aTime !== bTime) return bTime - aTime;
    return text(b.id).localeCompare(text(a.id));
  });

  for (const fixture of fixturesNewestFirst) {
    const home = rowsByTeamId.get(text(fixture.home_team_id));
    const away = rowsByTeamId.get(text(fixture.away_team_id));
    if (!home || !away) continue;

    const homeTotal = Number(fixture.home_total || 0);
    const awayTotal = Number(fixture.away_total || 0);
    const homeResult = homeTotal > awayTotal ? 'W' : homeTotal < awayTotal ? 'L' : 'D';
    const awayResult = homeTotal > awayTotal ? 'L' : homeTotal < awayTotal ? 'W' : 'D';

    if (home.last5_results.length < 5) home.last5_results.push(homeResult);
    if (away.last5_results.length < 5) away.last5_results.push(awayResult);
  }

  const rows = Array.from(rowsByTeamId.values()).map((row) => ({
    ...row,
    percentage: row.pa === 0 ? 0 : Number(((row.pf / row.pa) * 100).toFixed(1)),
  }));

  rows.sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points;
    if (a.percentage !== b.percentage) return b.percentage - a.percentage;
    if (a.pf !== b.pf) return b.pf - a.pf;
    return a.team_name.localeCompare(b.team_name);
  });

  return rows;
}

export function invalidateLadderCache(args?: { seasonSlug?: string | null; seasonId?: string | null }) {
  const seasonSlug = text(args?.seasonSlug).toLowerCase();
  const seasonId = text(args?.seasonId);

  if (!seasonSlug && !seasonId) {
    ladderCache.clear();
    snapshotCache.clear();
    return;
  }

  if (seasonSlug) {
    ladderCache.delete(seasonSlug);
  }
  if (seasonId) {
    snapshotCache.delete(seasonId);
  }
}

export async function fetchLadderRows(seasonSlug: string): Promise<LadderRowRecord[]> {
  const cacheKey = text(seasonSlug).toLowerCase() || 'latest';
  const cached = ladderCache.get(cacheKey);
  if (cached && isFresh(cached.at)) return cached.value;

  const season = await resolveSeasonRecord(supabase, seasonSlug, { preferFixtureRows: true });
  const rows = await fetchLadderRowsForSeason({ seasonId: season.id, seasonSlug: season.slug || seasonSlug });

  ladderCache.set(cacheKey, { at: Date.now(), value: rows });
  return rows;
}

export async function fetchLadderSnapshotBySeasonId(seasonId: string): Promise<LadderSnapshotRow[]> {
  const cacheKey = text(seasonId) || 'latest';
  const cached = snapshotCache.get(cacheKey);
  if (cached && isFresh(cached.at)) return cached.value;

  const rows = (await fetchLadderRowsForSeason({ seasonId }))
    .slice(0, 5)
    .map((row) => ({
      team_name: resolveTeamName({ name: text(row.team_name) || null, slug: text(row.team_slug) || null }) || 'Unknown',
      points: Number(row.points || 0),
    }))
    .filter((row) => row.team_name);

  snapshotCache.set(cacheKey, { at: Date.now(), value: rows });
  return rows;
}
