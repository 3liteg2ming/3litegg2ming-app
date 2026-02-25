import { useQuery, useQueries } from '@tanstack/react-query';
import { getSupabaseClient } from '../lib/supabaseClient';
import { AflRound } from '../types';

interface FixturesParams {
  seasonSlug: string;
  limit?: number;
  offset?: number;
  roundNumber?: number;
}

/**
 * Fetch all fixtures for a season with team info in one query
 * Uses a view or returns fixtures with team details populated
 */
async function fetchFixturesWithTeams(
  seasonSlug: string,
  limit = 100,
  offset = 0
): Promise<any[]> {
  const supabase = getSupabaseClient();

  // Try to use eg_fixtures_with_teams view if it exists
  // Otherwise fall back to manual join query
  const { data: fixtures, error } = await supabase
    .from('eg_fixtures')
    .select(
      `
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
      away_goals,
      away_behinds,
      eg_teams:home_team_id(slug, name, logo_url, primary_color),
      away_team:away_team_id(slug, name, logo_url, primary_color)
    `
    )
    .eq('season:eg_seasons(slug)', seasonSlug)
    .order('round', { ascending: false })
    .order('start_time', { ascending: true })
    .limit(limit)
    .offset(offset);

  if (error) {
    console.error('Error fetching fixtures:', error);
    throw error;
  }

  return fixtures || [];
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
    enabled, // Only run when explicitly enabled (after next fixtures load)
  });
}

/**
 * Fetch a specific fixture by ID with team and submission data
 */
async function fetchFixtureById(fixtureId: string): Promise<any> {
  const supabase = getSupabaseClient();

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
