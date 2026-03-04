import { requireSupabaseClient } from './supabaseClient';

const supabase = requireSupabaseClient();

export type FixtureRow = {
  id: string;
  round: number;

  home_team_slug: string;
  away_team_slug: string;

  venue: string;
  start_time: string | null;

  status: 'SCHEDULED' | 'LIVE' | 'FINAL';

  home_total: number | null;
  away_total: number | null;
  home_goals: number | null;
  home_behinds: number | null;
  away_goals: number | null;
  away_behinds: number | null;

  home_coach_name: string | null;
  away_coach_name: string | null;
  home_psn: string | null;
  away_psn: string | null;
};

export async function fetchSeasonFixtures(seasonSlug: string) {
  if (!seasonSlug) throw new Error('seasonSlug required');

  const { data: season, error: seasonErr } = await supabase
    .from('eg_seasons')
    .select('id, slug, name')
    .eq('slug', seasonSlug)
    .single();

  if (seasonErr) throw new Error(seasonErr.message);
  if (!season) throw new Error(`Season not found: ${seasonSlug}`);

  const { data: fixtures, error: fixErr } = await supabase
    .from('eg_fixtures')
    .select('*')
    .eq('season_id', season.id)
    .order('round', { ascending: true })
    .order('start_time', { ascending: true });

  if (fixErr) throw new Error(fixErr.message);

  return { season, fixtures: (fixtures ?? []) as FixtureRow[] };
}
