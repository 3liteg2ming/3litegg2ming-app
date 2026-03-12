import { getTeamAssets } from './teamAssets';
import { requireSupabaseClient } from './supabaseClient';
import { fetchTeamsByIds } from './teamsRepo';

const supabase = requireSupabaseClient();
const TTL_MS = 60_000;

export type FeaturedPlayerRecord = {
  key: 'goals' | 'disposals';
  label: 'GOALS' | 'DISPOSALS';
  name: string;
  headshotUrl: string | null;
  teamName: string | null;
  teamLogoUrl: string | null;
};

const FEATURED_TARGETS: Array<{ key: 'goals' | 'disposals'; label: 'GOALS' | 'DISPOSALS'; name: string }> = [
  { key: 'goals', label: 'GOALS', name: 'Jeremy Cameron' },
  { key: 'disposals', label: 'DISPOSALS', name: 'Nick Daicos' },
];

let cache: { at: number; value: FeaturedPlayerRecord[] } | null = null;

function text(value: unknown): string {
  return String(value || '').trim();
}

export function buildFeaturedPlayerFallback(): FeaturedPlayerRecord[] {
  return [
    { key: 'goals', label: 'GOALS', name: 'Jeremy Cameron', headshotUrl: null, teamName: 'AFL26', teamLogoUrl: null },
    { key: 'disposals', label: 'DISPOSALS', name: 'Nick Daicos', headshotUrl: null, teamName: 'AFL26', teamLogoUrl: null },
  ];
}

export async function fetchFeaturedPlayers(): Promise<FeaturedPlayerRecord[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  const raw = await Promise.all(
    FEATURED_TARGETS.map(async (target) => {
      const exact = await supabase
        .from('eg_players')
        .select('name,headshot_url,photo_url,team_id')
        .eq('name', target.name)
        .limit(1)
        .maybeSingle();

      let row: any = exact.data || null;
      if (!row) {
        const likeByFullName = await supabase
          .from('eg_players')
          .select('name,headshot_url,photo_url,team_id')
          .ilike('name', `%${target.name.replace(/\s+/g, '%')}%`)
          .limit(1);
        row = likeByFullName.data?.[0] || null;
      }
      if (!row) {
        const surname = target.name.split(' ').slice(-1)[0];
        const likeBySurname = await supabase
          .from('eg_players')
          .select('name,headshot_url,photo_url,team_id')
          .ilike('name', `%${surname}%`)
          .limit(1);
        row = likeBySurname.data?.[0] || null;
      }

      return {
        key: target.key,
        label: target.label,
        name: text(row?.name) || target.name,
        headshotUrl: text(row?.headshot_url) || text(row?.photo_url) || null,
        teamId: text(row?.team_id) || null,
      };
    }),
  );

  const teamMap = await fetchTeamsByIds(raw.map((row) => row.teamId || '').filter(Boolean));
  const value = raw.map((row) => {
    const team = row.teamId ? teamMap.get(row.teamId) : null;
    const teamName = team?.name || 'AFL26';
    return {
      key: row.key,
      label: row.label,
      name: row.name || 'Unknown',
      headshotUrl: row.headshotUrl,
      teamName,
      teamLogoUrl: team?.logoUrl || getTeamAssets(teamName).logo || null,
    };
  });

  cache = { at: Date.now(), value: value.length ? value : buildFeaturedPlayerFallback() };
  return cache.value;
}
