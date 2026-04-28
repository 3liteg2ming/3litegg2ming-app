import { useQuery } from '@tanstack/react-query';
import { fetchLatestMatchCentre, fetchMatchCentre, type MatchCentreModel } from '@/lib/matchCentreRepo';

export function useMatchCentre(fixtureId?: string) {
  return useQuery<MatchCentreModel>({
    queryKey: ['match-centre', fixtureId || 'latest'],
    queryFn: () => (fixtureId ? fetchMatchCentre(fixtureId) : fetchLatestMatchCentre()),
    staleTime: 2 * 60_000,
    gcTime: 30 * 60_000,
  });
}
