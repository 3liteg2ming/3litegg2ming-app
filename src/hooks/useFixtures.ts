import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '../lib/supabaseClient';

interface FixturesParams {
  seasonSlug: string;
  limit?: number;
  offset?: number;
  roundNumber?: number;
}

const SEASON_SLUG_ALIASES: Record<string, string> = {
  afl26: 'afl26-season-two',
  'afl-26': 'afl26-season-two',
};

const seasonIdCache = new Map<string, string>();
const seasonIdInFlight = new Map<string, Promise<string>>();

function normSlug(input: string) {
  return String(input || '').trim().toLowerCase();
}

function cacheSeasonResolution(requestedSlug: string, resolvedId: string, resolvedSlug?: string) {
  const requested = normSlug(requestedSlug);
  if (requested) seasonIdCache.set(requested, resolvedId);

  const alias = SEASON_SLUG_ALIASES[requested];
  if (alias) seasonIdCache.set(normSlug(alias), resolvedId);

  if (resolvedSlug) seasonIdCache.set(normSlug(resolvedSlug), resolvedId);
}

async function getSeasonId(seasonSlug: string): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const err = new Error('Supabase client is not configured (missing env vars).');
    console.error('Error resolving season id:', err);
    throw err;
  }

  const requested = normSlug(seasonSlug);
  if (!requested) {
    const err = new Error('seasonSlug is required');
    console.error('Error resolving season id:', err);
    throw err;
  }

  const cached = seasonIdCache.get(requested);
  if (cached) return cached;

  const inflight = seasonIdInFlight.get(requested);
  if (inflight) return inflight;

  const request = (async () => {
    let exactAttemptError: any = null;
    let aliasAttemptError: any = null;
    let fuzzyAttemptError: any = null;

    // 1) Exact match
    const exact = await supabase
      .from('eg_seasons')
      .select('id, slug')
      .eq('slug', requested)
      .maybeSingle();

    if (exact.data?.id) {
      const id = String(exact.data.id);
      cacheSeasonResolution(requested, id, (exact.data as any).slug);
      return id;
    }
    exactAttemptError = exact.error;

    // 2) Alias match
    const alias = SEASON_SLUG_ALIASES[requested];
    if (alias && alias !== requested) {
      const aliasRes = await supabase
        .from('eg_seasons')
        .select('id, slug')
        .eq('slug', alias)
        .maybeSingle();

      if (aliasRes.data?.id) {
        const id = String(aliasRes.data.id);
        cacheSeasonResolution(requested, id, (aliasRes.data as any).slug);
        return id;
      }
      aliasAttemptError = aliasRes.error;
    }

    // 3) Fuzzy fallback
    const fuzzy = await supabase
      .from('eg_seasons')
      .select('id, slug')
      .ilike('slug', `%${requested}%`)
      .limit(1);

    if (!fuzzy.error && Array.isArray(fuzzy.data) && fuzzy.data.length > 0 && fuzzy.data[0]?.id) {
      const row = fuzzy.data[0] as any;
      const id = String(row.id);
      cacheSeasonResolution(requested, id, row.slug);
      return id;
    }
    fuzzyAttemptError = fuzzy.error;

    const err = new Error(
      `Season not found for slug "${requested}". Attempts: exact="${requested}", alias="${alias || 'n/a'}", fuzzy="%${requested}%".`
    );
    console.error('Error resolving season id:', {
      message: err.message,
      requestedSlug: requested,
      aliasAttempt: alias || null,
      exactAttemptError,
      aliasAttemptError,
      fuzzyAttemptError,
    });
    throw err;
  })();

  seasonIdInFlight.set(requested, request);
  try {
    return await request;
  } finally {
    seasonIdInFlight.delete(requested);
  }
}

/**
 * Fetch all fixtures for a season with team info in one query
 * Uses eg_fixtures table + team joins.
 */
async function fetchFixturesWithTeams(
  seasonSlug: string,
  limit = 100,
  offset = 0
): Promise<any[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const err = new Error('Supabase client is not configured (missing env vars).');
    console.error('Error fetching fixtures:', err);
    throw err;
  }

  const seasonId = await getSeasonId(seasonSlug);

  const from = Math.max(0, Number(offset) || 0);
  const to = from + Math.max(1, Number(limit) || 100) - 1;

  const selectAttempts: Array<{ select: string; orderStartTime: boolean }> = [
    {
      select: `
        id,
        round,
        status,
        start_time,
        venue,
        home_team_key,
        home_team_id,
        away_team_key,
        away_team_id,
        home_team_slug,
        away_team_slug,
        home_goals,
        home_behinds,
        home_total,
        away_goals,
        away_behinds,
        away_total,
        eg_teams:home_team_id(slug, name, logo_url, primary_color),
        away_team:away_team_id(slug, name, logo_url, primary_color)
      `,
      orderStartTime: true,
    },
    {
      select: `
        id,
        round,
        status,
        start_time,
        venue,
        home_team_key,
        home_team_id,
        away_team_key,
        away_team_id,
        home_goals,
        home_behinds,
        home_total,
        away_goals,
        away_behinds,
        away_total,
        eg_teams:home_team_id(slug, name, logo_url, primary_color),
        away_team:away_team_id(slug, name, logo_url, primary_color)
      `,
      orderStartTime: true,
    },
    {
      select: `
        id,
        round,
        status,
        start_time,
        venue,
        home_team_slug,
        away_team_slug,
        home_goals,
        home_behinds,
        home_total,
        away_goals,
        away_behinds,
        away_total
      `,
      orderStartTime: true,
    },
    {
      select: `
        id,
        round,
        status,
        venue,
        home_team_slug,
        away_team_slug,
        home_goals,
        home_behinds,
        home_total,
        away_goals,
        away_behinds,
        away_total
      `,
      orderStartTime: false,
    },
    {
      select: `
        id,
        round,
        status,
        venue,
        home_goals,
        home_behinds,
        home_total,
        away_goals,
        away_behinds,
        away_total
      `,
      orderStartTime: false,
    },
    {
      select: '*',
      orderStartTime: false,
    },
  ];

  let fixtures: any[] | null = null;
  let lastError: any = null;

  for (const attempt of selectAttempts) {
    let query = supabase
      .from('eg_fixtures')
      .select(attempt.select)
      .eq('season_id', seasonId)
      .order('round', { ascending: false })
      .range(from, to);

    if (attempt.orderStartTime) {
      query = query.order('start_time', { ascending: true });
    }

    const res = await query;

    if (!res.error) {
      fixtures = (res.data || []) as any[];
      lastError = null;
      break;
    }
    lastError = res.error;
  }

  if (lastError) {
    console.error('Error fetching fixtures:', {
      seasonSlug,
      seasonId,
      from,
      to,
      error: lastError,
    });
    throw lastError;
  }

  return (fixtures || []).map((f: any) => {
    const homeGoals = Number(f?.home_goals);
    const homeBehinds = Number(f?.home_behinds);
    const awayGoals = Number(f?.away_goals);
    const awayBehinds = Number(f?.away_behinds);

    const homeTotal =
      Number.isFinite(Number(f?.home_total))
        ? Number(f.home_total)
        : Number.isFinite(homeGoals) && Number.isFinite(homeBehinds)
          ? homeGoals * 6 + homeBehinds
          : null;

    const awayTotal =
      Number.isFinite(Number(f?.away_total))
        ? Number(f.away_total)
        : Number.isFinite(awayGoals) && Number.isFinite(awayBehinds)
          ? awayGoals * 6 + awayBehinds
          : null;

    return {
      ...f,
      round: Number.isFinite(Number(f?.round)) ? Number(f.round) : 1,
      status: String(f?.status || 'SCHEDULED').toUpperCase(),
      home_total: homeTotal,
      away_total: awayTotal,
      home_team_slug: f?.home_team_slug || f?.home_team_key || f?.eg_teams?.slug || '',
      away_team_slug: f?.away_team_slug || f?.away_team_key || f?.away_team?.slug || '',
    };
  });
}

/**
 * Fetch next N rounds of fixtures (for initial fast load)
 */
export function useNextFixtures(
  seasonSlug: string,
  roundLimit = 3
): ReturnType<typeof useQuery> {
  return useQuery({
    queryKey: ['fixtures', 'next', seasonSlug, roundLimit],
    queryFn: () => fetchFixturesWithTeams(seasonSlug, roundLimit * 10, 0),
    staleTime: 45_000,
    gcTime: 1_200_000,
  });
}

/**
 * Fetch all fixtures for a season (background load after next fixtures)
 */
export function useAllFixtures(
  seasonSlug: string,
  enabled = false
): ReturnType<typeof useQuery> {
  return useQuery({
    queryKey: ['fixtures', 'all', seasonSlug],
    queryFn: () => fetchFixturesWithTeams(seasonSlug, 1000, 0),
    staleTime: 45_000,
    gcTime: 1_200_000,
    enabled,
  });
}

/**
 * Fetch a specific fixture by ID with team and submission data
 */
async function fetchFixtureById(fixtureId: string): Promise<any> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const err = new Error('Supabase client is not configured (missing env vars).');
    console.error('Error fetching fixture by id:', err);
    throw err;
  }

  const { data: fixture, error } = await supabase
    .from('eg_fixtures')
    .select(
      `
      id,
      round,
      status,
      start_time,
      venue,
      home_team_id,
      away_team_id,
      home_goals,
      home_behinds,
      away_goals,
      away_behinds,
      eg_teams:home_team_id(slug, name, logo_url, primary_color),
      away_team:away_team_id(slug, name, logo_url, primary_color)
    `
    )
    .eq('id', fixtureId)
    .maybeSingle();

  if (error) throw error;
  return fixture;
}

export function useFixture(fixtureId: string | undefined) {
  return useQuery({
    queryKey: ['fixture', fixtureId],
    queryFn: () => fetchFixtureById(fixtureId!),
    enabled: !!fixtureId,
    staleTime: 45_000,
    gcTime: 1_200_000,
  });
}

/**
 * Fetch submissions for a fixture (for match centre stats)
 */
async function fetchFixtureSubmissions(fixtureId: string): Promise<any[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const err = new Error('Supabase client is not configured (missing env vars).');
    console.error('Error fetching fixture submissions:', err);
    throw err;
  }

  const { data: submissions, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('fixture_id', fixtureId);

  if (error) throw error;
  return submissions || [];
}

export function useFixtureSubmissions(fixtureId: string | undefined) {
  return useQuery({
    queryKey: ['submissions', fixtureId],
    queryFn: () => fetchFixtureSubmissions(fixtureId!),
    enabled: !!fixtureId,
    staleTime: 30_000,
    gcTime: 600_000,
  });
}
