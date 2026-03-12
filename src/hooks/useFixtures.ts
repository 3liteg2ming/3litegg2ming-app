import { useQuery } from '@tanstack/react-query';
import { fetchFixtureById, fetchSeasonFixtures, fetchSeasonFixturesBySeasonId, type FixtureRow } from '../lib/fixturesRepo';
import { getCanonicalSeasonSlug, resolveSeasonRecord } from '../lib/seasonResolver';
import { getSupabaseClient } from '../lib/supabaseClient';

export type SeasonFixturesResult = {
  requestedSeasonSlug: string;
  canonicalSeasonSlug: string;
  resolvedSeasonId: string;
  resolvedSeasonSlug: string;
  fixtures: FixtureRow[];
};

function asError(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) return error;
  return new Error(String(error || fallbackMessage));
}

async function fetchFixturesForSeason(
  seasonSlug: string,
  limit = 100,
  offset = 0,
): Promise<FixtureRow[]> {
  const result = await fetchResolvedSeasonFixtures(seasonSlug, limit, offset);
  return result.fixtures;
}

async function fetchResolvedSeasonFixtures(
  seasonSlug: string,
  limit = 1000,
  offset = 0,
): Promise<SeasonFixturesResult> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const err = new Error('Supabase client is not configured (missing env vars).');
    console.error('Error fetching fixtures:', err);
    throw err;
  }

  const requestedSeasonSlug = String(seasonSlug || '').trim().toLowerCase();
  const canonicalSeasonSlug = getCanonicalSeasonSlug(requestedSeasonSlug);

  let slugResult:
    | {
        season: { id: string; slug: string };
        fixtures: FixtureRow[];
      }
    | null = null;
  let slugError: Error | null = null;

  try {
    slugResult = await fetchSeasonFixtures(canonicalSeasonSlug, { limit, offset });
    if (slugResult.fixtures.length > 0) {
      return {
        requestedSeasonSlug,
        canonicalSeasonSlug,
        resolvedSeasonId: slugResult.season.id,
        resolvedSeasonSlug: slugResult.season.slug,
        fixtures: slugResult.fixtures,
      };
    }
  } catch (error) {
    slugError = asError(error, 'Slug fixtures fetch failed');
    console.warn('[useFixtures] slug fixture fetch failed, falling back to season.id path', {
      requestedSeasonSlug,
      canonicalSeasonSlug,
      error: slugError.message,
    });
  }

  try {
    const season = await resolveSeasonRecord(supabase, canonicalSeasonSlug, { preferFixtureRows: true });
    const bySeasonId = await fetchSeasonFixturesBySeasonId(season.id, { limit, offset });

    return {
      requestedSeasonSlug,
      canonicalSeasonSlug,
      resolvedSeasonId: season.id,
      resolvedSeasonSlug: season.slug,
      fixtures: bySeasonId.fixtures,
    };
  } catch (error) {
    if (slugResult) {
      return {
        requestedSeasonSlug,
        canonicalSeasonSlug,
        resolvedSeasonId: slugResult.season.id,
        resolvedSeasonSlug: slugResult.season.slug,
        fixtures: slugResult.fixtures,
      };
    }

    throw asError(error, slugError?.message || `Unable to load fixtures for season "${canonicalSeasonSlug}"`);
  }
}

export function useNextFixtures(
  seasonSlug: string,
  roundLimit = 3,
): ReturnType<typeof useQuery> {
  return useQuery<FixtureRow[]>({
    queryKey: ['fixtures', 'next', seasonSlug, roundLimit],
    queryFn: () => fetchFixturesForSeason(seasonSlug, roundLimit * 10, 0),
    staleTime: 45_000,
    gcTime: 1_200_000,
  });
}

export function useAllFixtures(
  seasonSlug: string,
  enabled = false,
): ReturnType<typeof useQuery> {
  return useQuery<FixtureRow[]>({
    queryKey: ['fixtures', 'all', seasonSlug],
    queryFn: () => fetchFixturesForSeason(seasonSlug, 1000, 0),
    staleTime: 45_000,
    gcTime: 1_200_000,
    enabled,
  });
}

export function useSeasonFixtures(
  seasonSlug: string,
  options?: {
    limit?: number;
    offset?: number;
    enabled?: boolean;
  },
) {
  const limit = Math.max(1, Number(options?.limit) || 1000);
  const offset = Math.max(0, Number(options?.offset) || 0);

  return useQuery<SeasonFixturesResult>({
    queryKey: ['fixtures', 'season', seasonSlug, limit, offset],
    queryFn: () => fetchResolvedSeasonFixtures(seasonSlug, limit, offset),
    staleTime: 45_000,
    gcTime: 1_200_000,
    enabled: options?.enabled ?? true,
  });
}

async function fetchFixture(fixtureId: string): Promise<FixtureRow | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const err = new Error('Supabase client is not configured (missing env vars).');
    console.error('Error fetching fixture by id:', err);
    throw err;
  }

  return fetchFixtureById(fixtureId);
}

export function useFixture(fixtureId: string | undefined) {
  return useQuery({
    queryKey: ['fixture', fixtureId],
    queryFn: () => fetchFixture(fixtureId!),
    enabled: !!fixtureId,
    staleTime: 45_000,
    gcTime: 1_200_000,
  });
}

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
    .eq('fixture_id', fixtureId)
    .order('submitted_at', { ascending: false });

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
