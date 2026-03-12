import { resolveTeamKey, resolveTeamLogoUrl, resolveTeamName } from './entityResolvers';
import { getCanonicalSeasonSlug, resolveSeasonRecord } from './seasonResolver';
import { requireSupabaseClient } from './supabaseClient';

const supabase = requireSupabaseClient();
const FIXTURE_CACHE_TTL_MS = 60_000;

export type FixtureStatus = 'SCHEDULED' | 'LIVE' | 'FINAL';

type SeasonRecord = {
  id: string;
  slug: string;
};

type RawFixtureRow = Record<string, unknown>;

type TeamRow = {
  id?: string | null;
  slug?: string | null;
  team_key?: string | null;
  name?: string | null;
  short_name?: string | null;
  abbreviation?: string | null;
  logo_url?: string | null;
  logo_path?: string | null;
  primary_color?: string | null;
  colour?: string | null;
};

export type FixtureRow = {
  id: string;
  season_id: string;
  round: number;
  round_label: string;
  stage_name: string | null;
  stage_index: number | null;
  bracket_slot: string | null;
  week_index: number | null;
  is_preseason: boolean;
  next_fixture_id: string | null;
  status: FixtureStatus;
  raw_status: string | null;
  start_time: string | null;
  venue: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_slug: string | null;
  away_team_slug: string | null;
  home_team_key: string | null;
  away_team_key: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  home_team_short_name: string | null;
  away_team_short_name: string | null;
  home_team_logo_url: string | null;
  away_team_logo_url: string | null;
  home_team_colour: string | null;
  away_team_colour: string | null;
  home_total: number | null;
  away_total: number | null;
  home_goals: number | null;
  home_behinds: number | null;
  away_goals: number | null;
  away_behinds: number | null;
  submitted_at: string | null;
  verified_at: string | null;
  disputed_at: string | null;
  corrected_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  has_scores: boolean;
  is_final: boolean;
  is_scheduled: boolean;
  winner: 'HOME' | 'AWAY' | 'DRAW' | 'NONE';
};

const FINAL_STATUSES = new Set(['FINAL', 'COMPLETED', 'COMPLETE', 'FULL_TIME', 'FULLTIME']);
const LIVE_STATUSES = new Set(['LIVE', 'IN_PROGRESS', 'INPROGRESS']);
const SCHEDULED_STATUSES = new Set(['SCHEDULED', 'UPCOMING', 'PENDING', 'TBD', '']);
const teamCache = new Map<string, TeamRow>();
const seasonFixturesCache = new Map<string, { at: number; season: SeasonRecord; fixtures: FixtureRow[] }>();
const seasonFixtureCountCache = new Map<string, { at: number; count: number }>();
const fixtureByIdCache = new Map<string, { at: number; fixture: FixtureRow | null }>();

function text(value: unknown): string {
  return String(value || '').trim();
}

function nullableText(value: unknown): string | null {
  const normalized = text(value);
  return normalized || null;
}

function toNullableNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toPositiveInt(value: unknown): number | null {
  const n = toNullableNumber(value);
  if (n == null) return null;
  const rounded = Math.trunc(n);
  return rounded > 0 ? rounded : null;
}

function hasAnyScoreValue(fixture: Partial<RawFixtureRow>): boolean {
  return [
    fixture.home_total,
    fixture.away_total,
    fixture.home_goals,
    fixture.home_behinds,
    fixture.away_goals,
    fixture.away_behinds,
  ].some((value) => toNullableNumber(value) != null);
}

export function deriveFixtureRound(
  fixture: Pick<FixtureRow, 'round' | 'week_index' | 'stage_index' | 'stage_name'> | Partial<RawFixtureRow>,
): number {
  const explicitWeek = toPositiveInt((fixture as Partial<RawFixtureRow>).week_index);
  if (explicitWeek) return explicitWeek;

  const round = toPositiveInt((fixture as Partial<RawFixtureRow>).round);
  if (round) return round;

  const stageIndex = toPositiveInt((fixture as Partial<RawFixtureRow>).stage_index);
  if (stageIndex) return stageIndex;

  const stageName = text((fixture as Partial<RawFixtureRow>).stage_name).toLowerCase();
  if (stageName.includes('grand')) return 4;
  if (stageName.includes('semi')) return 3;
  return 1;
}

export function normalizeFixtureStatus(
  status: unknown,
  fixture?: Partial<RawFixtureRow> | Partial<FixtureRow>,
): FixtureStatus {
  const normalized = text(status).toUpperCase();

  if (FINAL_STATUSES.has(normalized)) return 'FINAL';
  if (LIVE_STATUSES.has(normalized)) return 'LIVE';
  if (SCHEDULED_STATUSES.has(normalized)) {
    if (normalized) return 'SCHEDULED';
  }

  const hasResultTimestamp = Boolean(
    text(fixture?.submitted_at) || text(fixture?.verified_at) || text(fixture?.disputed_at) || text(fixture?.corrected_at),
  );

  if (hasResultTimestamp && hasAnyScoreValue((fixture || {}) as Partial<RawFixtureRow>)) {
    return 'FINAL';
  }

  if (hasResultTimestamp && normalized !== 'LIVE') {
    return 'FINAL';
  }

  if (hasAnyScoreValue((fixture || {}) as Partial<RawFixtureRow>) && normalized !== 'LIVE') {
    const homeTotal = toNullableNumber(fixture?.home_total);
    const awayTotal = toNullableNumber(fixture?.away_total);
    if (homeTotal != null || awayTotal != null) return 'FINAL';
  }

  return 'SCHEDULED';
}

function computeScoreTotal(goals: number | null, behinds: number | null, total: number | null): number | null {
  if (total != null) return total;
  if (goals != null && behinds != null) return goals * 6 + behinds;
  return null;
}

function computeWinner(status: FixtureStatus, homeTotal: number | null, awayTotal: number | null): FixtureRow['winner'] {
  if (status !== 'FINAL' || homeTotal == null || awayTotal == null) return 'NONE';
  if (homeTotal === awayTotal) return 'DRAW';
  return homeTotal > awayTotal ? 'HOME' : 'AWAY';
}

async function fetchTeamsByIds(teamIds: string[]): Promise<Map<string, TeamRow>> {
  const ids = Array.from(new Set(teamIds.map((value) => text(value)).filter(Boolean)));
  const missingIds = ids.filter((id) => !teamCache.has(id));

  if (missingIds.length > 0) {
    const { data, error } = await supabase.from('eg_teams').select('*').in('id', missingIds);
    if (error) throw new Error(error.message);

    for (const row of (data || []) as TeamRow[]) {
      const id = text(row.id);
      if (!id) continue;
      teamCache.set(id, row);
    }
  }

  const out = new Map<string, TeamRow>();
  for (const id of ids) {
    const row = teamCache.get(id);
    if (row) out.set(id, row);
  }
  return out;
}

function normalizeTeamSide(team: TeamRow | undefined, fallbackTeamId: string | null) {
  const slug = nullableText(team?.slug);
  const teamKey = nullableText(team?.team_key);
  const resolvedName = nullableText(
    resolveTeamName({
      name: nullableText(team?.name),
      shortName: nullableText(team?.short_name) || nullableText(team?.abbreviation),
      slug,
      teamKey,
    }),
  );
  const name = resolvedName && resolvedName !== 'Unassigned' ? resolvedName : 'unknown';
  const shortName = nullableText(team?.short_name) || nullableText(team?.abbreviation) || name;
  const colour = nullableText(team?.primary_color) || nullableText(team?.colour);
  const logoUrl =
    team != null
      ? resolveTeamLogoUrl({
          logoUrl: nullableText(team.logo_url) || nullableText(team.logo_path),
          slug,
          teamKey,
          name,
        })
      : null;

  return {
    id: fallbackTeamId,
    slug,
    key: nullableText(resolveTeamKey({ slug, teamKey, name })),
    name,
    shortName,
    logoUrl,
    colour,
  };
}

function normalizeFixtureRow(raw: RawFixtureRow, teamsById: Map<string, TeamRow>): FixtureRow {
  const id = text(raw.id);
  const seasonId = text(raw.season_id);
  const homeTeamId = nullableText(raw.home_team_id);
  const awayTeamId = nullableText(raw.away_team_id);
  const homeTeam = homeTeamId ? teamsById.get(homeTeamId) : undefined;
  const awayTeam = awayTeamId ? teamsById.get(awayTeamId) : undefined;
  const normalizedHome = normalizeTeamSide(homeTeam, homeTeamId);
  const normalizedAway = normalizeTeamSide(awayTeam, awayTeamId);

  const homeGoals = toNullableNumber(raw.home_goals);
  const homeBehinds = toNullableNumber(raw.home_behinds);
  const awayGoals = toNullableNumber(raw.away_goals);
  const awayBehinds = toNullableNumber(raw.away_behinds);
  const homeTotal = computeScoreTotal(homeGoals, homeBehinds, toNullableNumber(raw.home_total));
  const awayTotal = computeScoreTotal(awayGoals, awayBehinds, toNullableNumber(raw.away_total));
  const normalizedStatus = normalizeFixtureStatus(raw.status, {
    ...raw,
    home_total: homeTotal,
    away_total: awayTotal,
  });
  const round = deriveFixtureRound(raw);
  const stageName = nullableText(raw.stage_name);

  return {
    id,
    season_id: seasonId,
    round,
    round_label: stageName || `Round ${round}`,
    stage_name: stageName,
    stage_index: toPositiveInt(raw.stage_index),
    bracket_slot: nullableText(raw.bracket_slot),
    week_index: toPositiveInt(raw.week_index),
    is_preseason: Boolean(raw.is_preseason),
    next_fixture_id: nullableText(raw.next_fixture_id),
    status: normalizedStatus,
    raw_status: nullableText(raw.status),
    start_time: nullableText(raw.start_time),
    venue: nullableText(raw.venue),
    home_team_id: homeTeamId,
    away_team_id: awayTeamId,
    home_team_slug: normalizedHome.slug,
    away_team_slug: normalizedAway.slug,
    home_team_key: normalizedHome.key,
    away_team_key: normalizedAway.key,
    home_team_name: normalizedHome.name,
    away_team_name: normalizedAway.name,
    home_team_short_name: normalizedHome.shortName,
    away_team_short_name: normalizedAway.shortName,
    home_team_logo_url: normalizedHome.logoUrl,
    away_team_logo_url: normalizedAway.logoUrl,
    home_team_colour: normalizedHome.colour,
    away_team_colour: normalizedAway.colour,
    home_total: homeTotal,
    away_total: awayTotal,
    home_goals: homeGoals,
    home_behinds: homeBehinds,
    away_goals: awayGoals,
    away_behinds: awayBehinds,
    submitted_at: nullableText(raw.submitted_at),
    verified_at: nullableText(raw.verified_at),
    disputed_at: nullableText(raw.disputed_at),
    corrected_at: nullableText(raw.corrected_at),
    created_at: nullableText(raw.created_at),
    updated_at: nullableText(raw.updated_at),
    has_scores: homeTotal != null && awayTotal != null,
    is_final: normalizedStatus === 'FINAL',
    is_scheduled: normalizedStatus === 'SCHEDULED',
    winner: computeWinner(normalizedStatus, homeTotal, awayTotal),
  };
}

function sortFixtures(fixtures: FixtureRow[]): FixtureRow[] {
  return [...fixtures].sort((a, b) => {
    const roundDiff = deriveFixtureRound(a) - deriveFixtureRound(b);
    if (roundDiff !== 0) return roundDiff;

    const stageIndexDiff = (a.stage_index || 0) - (b.stage_index || 0);
    if (stageIndexDiff !== 0) return stageIndexDiff;

    const aTime = a.start_time ? new Date(a.start_time).getTime() : Number.MAX_SAFE_INTEGER;
    const bTime = b.start_time ? new Date(b.start_time).getTime() : Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) return aTime - bTime;

    return a.id.localeCompare(b.id);
  });
}

async function normalizeFixtures(rows: RawFixtureRow[]): Promise<FixtureRow[]> {
  const teamIds = rows.flatMap((row) => [nullableText(row.home_team_id), nullableText(row.away_team_id)]).filter(Boolean) as string[];

  try {
    const teamsById = await fetchTeamsByIds(teamIds);
    return sortFixtures(rows.map((row) => normalizeFixtureRow(row, teamsById)));
  } catch (error) {
    console.warn('[fixturesRepo] team hydration failed; normalizing fixtures without eg_teams join data', {
      rowCount: rows.length,
      error: error instanceof Error ? error.message : String(error),
    });
    return sortFixtures(rows.map((row) => normalizeFixtureRow(row, new Map<string, TeamRow>())));
  }
}

type FetchSeasonFixturesOptions = {
  limit?: number;
  offset?: number;
};

function debugFixtureLog(message: string, payload: Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  console.info(`[fixturesRepo] ${message}`, payload);
}

async function getFixtureRowCountForSeason(seasonId: string): Promise<number> {
  const normalizedSeasonId = text(seasonId);
  if (!normalizedSeasonId) return 0;

  const cached = seasonFixtureCountCache.get(normalizedSeasonId);
  if (cached && Date.now() - cached.at < FIXTURE_CACHE_TTL_MS) {
    return cached.count;
  }

  const { count, error } = await supabase
    .from('eg_fixtures')
    .select('id', { count: 'exact', head: true })
    .eq('season_id', normalizedSeasonId);

  if (error) throw new Error(error.message);

  const resolvedCount = Number(count || 0);
  seasonFixtureCountCache.set(normalizedSeasonId, { at: Date.now(), count: resolvedCount });
  return resolvedCount;
}

export async function fetchAllFixtures(
  options: FetchSeasonFixturesOptions = {},
): Promise<FixtureRow[]> {
  const from = Math.max(0, Number(options.offset) || 0);
  const limit = Math.max(1, Number(options.limit) || 1000);
  const cacheKey = `all:${from}:${limit}`;
  const cached = seasonFixturesCache.get(cacheKey);
  if (cached && Date.now() - cached.at < FIXTURE_CACHE_TTL_MS) {
    return cached.fixtures;
  }

  const to = from + limit - 1;
  const { data, error } = await supabase
    .from('eg_fixtures')
    .select('*')
    .order('round', { ascending: true })
    .order('start_time', { ascending: true })
    .range(from, to);

  if (error) throw new Error(error.message);

  const fixtures = await normalizeFixtures((data || []) as RawFixtureRow[]);
  seasonFixturesCache.set(cacheKey, { at: Date.now(), season: { id: 'all', slug: 'all' }, fixtures });
  return fixtures;
}

export function invalidateFixturesCache(args?: { fixtureId?: string | null; seasonId?: string | null }) {
  const fixtureId = text(args?.fixtureId);
  const seasonId = text(args?.seasonId);

  if (fixtureId) {
    fixtureByIdCache.delete(fixtureId);
  } else {
    fixtureByIdCache.clear();
  }

  if (!seasonId) {
    seasonFixturesCache.clear();
    seasonFixtureCountCache.clear();
    return;
  }

  for (const [key, value] of seasonFixturesCache.entries()) {
    if (value.season.id === seasonId) {
      seasonFixturesCache.delete(key);
    }
  }
  seasonFixtureCountCache.delete(seasonId);
}

async function fetchSeasonFixturesByRecord(
  season: SeasonRecord,
  cacheSeed: string,
  options: FetchSeasonFixturesOptions = {},
): Promise<{ season: SeasonRecord; fixtures: FixtureRow[] }> {
  const from = Math.max(0, Number(options.offset) || 0);
  const limit = Math.max(1, Number(options.limit) || 1000);
  const cacheKey = `${cacheSeed}:${from}:${limit}`;
  const cached = seasonFixturesCache.get(cacheKey);
  if (cached && Date.now() - cached.at < FIXTURE_CACHE_TTL_MS) {
    return { season: cached.season, fixtures: cached.fixtures };
  }

  const to = from + limit - 1;
  const rowCountPromise = getFixtureRowCountForSeason(season.id);

  const { data, error } = await supabase
    .from('eg_fixtures')
    .select('*')
    .eq('season_id', season.id)
    .order('round', { ascending: true })
    .order('start_time', { ascending: true })
    .range(from, to);

  if (error) throw new Error(error.message);

  const sourceRows = (data || []) as RawFixtureRow[];
  let fixtures = await normalizeFixtures(sourceRows);
  const rowCount = await rowCountPromise;

  if (sourceRows.length > 0 && fixtures.length === 0) {
    console.warn('[fixturesRepo] normalized fixtures came back empty; retrying with bare team fallback', {
      resolvedSeasonId: season.id,
      resolvedSeasonSlug: season.slug,
      egFixturesRowCount: rowCount,
      selectedRowCount: sourceRows.length,
    });
    fixtures = sortFixtures(sourceRows.map((row) => normalizeFixtureRow(row, new Map<string, TeamRow>())));
  }

  debugFixtureLog('loaded eg_fixtures rows for resolved season', {
    cacheSeed,
    resolvedSeasonId: season.id,
    resolvedSeasonSlug: season.slug,
    egFixturesRowCount: rowCount,
    selectedRowCount: sourceRows.length,
    normalizedFixtureCount: fixtures.length,
    limit,
    offset: from,
  });

  if (rowCount > 0 && fixtures.length === 0) {
    console.warn('[fixturesRepo] resolved season has rows but normalized query returned 0 fixtures', {
      resolvedSeasonId: season.id,
      resolvedSeasonSlug: season.slug,
      egFixturesRowCount: rowCount,
      limit,
      offset: from,
    });
  }

  seasonFixturesCache.set(cacheKey, { at: Date.now(), season, fixtures });
  return { season, fixtures };
}

export async function fetchSeasonFixtures(
  seasonSlug: string,
  options: FetchSeasonFixturesOptions = {},
): Promise<{ season: SeasonRecord; fixtures: FixtureRow[] }> {
  if (!seasonSlug) throw new Error('seasonSlug required');

  const requestedSlug = text(seasonSlug).toLowerCase();
  const canonicalSlug = getCanonicalSeasonSlug(requestedSlug);
  const season = await resolveSeasonRecord(supabase, canonicalSlug, { preferFixtureRows: true });
  debugFixtureLog('resolved season for fixtures query', {
    requestedSlug,
    canonicalSlug,
    resolvedSeasonId: season.id,
    resolvedSeasonSlug: season.slug,
    limit: Number(options.limit) || 1000,
    offset: Number(options.offset) || 0,
  });
  return fetchSeasonFixturesByRecord(season, `slug:${canonicalSlug}`, options);
}

export async function fetchSeasonFixturesBySeasonId(
  seasonId: string,
  options: FetchSeasonFixturesOptions = {},
): Promise<{ season: SeasonRecord; fixtures: FixtureRow[] }> {
  const normalizedSeasonId = text(seasonId);
  if (!normalizedSeasonId) throw new Error('seasonId required');

  const season: SeasonRecord = { id: normalizedSeasonId, slug: normalizedSeasonId };
  return fetchSeasonFixturesByRecord(season, `id:${normalizedSeasonId}`, options);
}

export async function fetchFixtureById(fixtureId: string): Promise<FixtureRow | null> {
  if (!fixtureId) throw new Error('fixtureId required');

  const cached = fixtureByIdCache.get(fixtureId);
  if (cached && Date.now() - cached.at < FIXTURE_CACHE_TTL_MS) {
    return cached.fixture;
  }

  const { data, error } = await supabase.from('eg_fixtures').select('*').eq('id', fixtureId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    fixtureByIdCache.set(fixtureId, { at: Date.now(), fixture: null });
    return null;
  }

  const fixtures = await normalizeFixtures([data as RawFixtureRow]);
  const fixture = fixtures[0] || null;
  fixtureByIdCache.set(fixtureId, { at: Date.now(), fixture });
  return fixture;
}
