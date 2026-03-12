import { useQuery } from '@tanstack/react-query';
import { fetchLadderRows } from '@/lib/ladderRepo';

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
  return fetchLadderRows(seasonSlug);
}

export function useLadder(seasonSlug: string) {
  return useQuery({
    queryKey: ['eg_ladder', seasonSlug],
    queryFn: () => fetchLadder(seasonSlug),
    staleTime: 45_000,
    gcTime: 1_200_000,
  });
}
