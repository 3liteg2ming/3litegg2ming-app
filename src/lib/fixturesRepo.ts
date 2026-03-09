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

  const normalized = String(seasonSlug || '').trim().toLowerCase();
  const aliases: Record<string, string> = {
    afl26: 'afl26-season-two',
    'afl-26': 'afl26-season-two',
    'preseason-2026': 'preseason',
    'knockout-preseason': 'preseason',
  };
  const reverseAlias = Object.entries(aliases).find(([, value]) => value === normalized)?.[0] || null;
  const attempts = [normalized, aliases[normalized], reverseAlias].filter((v, i, arr): v is string => !!v && arr.indexOf(v) === i);

  let season: { id: string; slug: string; name: string } | null = null;
  let seasonErr: Error | null = null;
  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from('eg_seasons')
      .select('id, slug, name')
      .eq('slug', attempt)
      .maybeSingle();
    if (!error && data?.id) {
      season = data as any;
      seasonErr = null;
      break;
    }
    if (error) seasonErr = new Error(error.message);
  }

  if (!season) {
    const { data, error } = await supabase
      .from('eg_seasons')
      .select('id, slug, name')
      .ilike('slug', `%${normalized}%`)
      .limit(1);
    if (!error && Array.isArray(data) && data[0]?.id) {
      season = data[0] as any;
    } else if (error) {
      seasonErr = new Error(error.message);
    }
  }

  if (seasonErr) throw seasonErr;
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
