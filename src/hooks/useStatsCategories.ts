import { useQuery } from '@tanstack/react-query';
import { getDataSeasonSlugForCompetition, getStoredCompetitionKey } from '../lib/competitionRegistry';
import { fetchStatsLeaderCategories } from '../lib/statsRepo';
import type { Mode, StatLeaderCategory } from '../lib/stats-leaders-cache';

export function useStatsCategories(mode: Mode) {
  const competitionKey = getStoredCompetitionKey();
  const seasonSlug = getDataSeasonSlugForCompetition(competitionKey);

  return useQuery<StatLeaderCategory[]>({
    queryKey: ['stats', 'categories', competitionKey, seasonSlug, mode],
    queryFn: () => fetchStatsLeaderCategories(mode),
    staleTime: 45_000,
    gcTime: 1_200_000,
  });
}
