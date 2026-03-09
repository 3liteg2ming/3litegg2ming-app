import { useQuery } from '@tanstack/react-query';

import { getSupabaseClient } from '@/lib/supabaseClient';

// Reuse the same season resolution logic as fixtures.
// (Kept local so Ladder doesn't depend on the fixture hook implementation.)
const seasonIdCache = new Map<string, string>();
const seasonIdInFlight = new Map<string, Promise<string>>();
const SEASON_SLUG_ALIASES: Record<string, string> = {
  afl26: 'afl26-season-two',
  'afl-26': 'afl26-season-two',
  'preseason-2026': 'preseason',
  'knockout-preseason': 'preseason',
};

function normSlug(input: string) {
  return String(input || '').trim().toLowerCase();
}

async function resolveSeasonId(seasonSlug: string): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase client is not configured (missing env vars).');

  const slug = normSlug(seasonSlug);
  if (!slug) throw new Error('seasonSlug is required');

  const cached = seasonIdCache.get(slug);
  if (cached) return cached;

  const inflight = seasonIdInFlight.get(slug);
  if (inflight) return inflight;

  const job = (async () => {
    const reverseAlias = Object.entries(SEASON_SLUG_ALIASES).find(([, value]) => value === slug)?.[0] || null;
    const attempts = [slug, SEASON_SLUG_ALIASES[slug], reverseAlias].filter(
      (v, i, arr): v is string => !!v && arr.indexOf(v) === i,
    );

    for (const attempt of attempts) {
      const exact = await supabase.from('eg_seasons').select('id,slug').eq('slug', attempt).maybeSingle();
      if (exact.data?.id) {
        const id = String(exact.data.id);
        seasonIdCache.set(slug, id);
        seasonIdCache.set(String((exact.data as any).slug || attempt).toLowerCase(), id);
        return id;
      }
    }

    const fuzzy = await supabase.from('eg_seasons').select('id,slug').ilike('slug', `%${slug}%`).limit(1);
    if (Array.isArray(fuzzy.data) && fuzzy.data[0]?.id) {
      const id = String(fuzzy.data[0].id);
      seasonIdCache.set(slug, id);
      seasonIdCache.set(String(fuzzy.data[0].slug || slug).toLowerCase(), id);
      return id;
    }

    throw new Error(`Season not found for slug "${slug}"`);
  })();

  seasonIdInFlight.set(slug, job);
  try {
    return await job;
  } finally {
    seasonIdInFlight.delete(slug);
  }
}

export type LadderRow = {
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
  last5_results: string[] | null;
};

async function fetchLadder(seasonSlug: string): Promise<LadderRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase client is not configured (missing env vars).');
  const seasonId = await resolveSeasonId(seasonSlug);

  const baseSelect =
    'season_id,team_id,team_name,team_slug,team_logo_url,played,wins,losses,draws,pf,pa,points,percentage';

  const attempts = [
    {
      view: 'eg_ladder_rows_v2',
      select: `${baseSelect},last5_results`,
      hasRealForm: true,
    },
    {
      view: 'eg_ladder_rows',
      select: baseSelect,
      hasRealForm: false,
    },
  ] as const;

  let rows: any[] = [];
  let lastError: string | null = null;

  for (const attempt of attempts) {
    const { data, error } = await supabase
      .from(attempt.view)
      .select(attempt.select)
      .eq('season_id', seasonId)
      .order('points', { ascending: false })
      .order('percentage', { ascending: false })
      .order('pf', { ascending: false })
      .limit(100);

    if (error) {
      lastError = error.message;
      continue;
    }

    rows = (data || []).map((row: any) => ({
      ...row,
      last5_results: attempt.hasRealForm ? row?.last5_results ?? [] : [],
    }));
    lastError = null;
    break;
  }

  if (lastError) throw new Error(lastError);
  return rows as LadderRow[];
}

export function useLadder(seasonSlug: string) {
  return useQuery({
    queryKey: ['eg_ladder', seasonSlug],
    queryFn: () => fetchLadder(seasonSlug),
    staleTime: 30_000,
  });
}
