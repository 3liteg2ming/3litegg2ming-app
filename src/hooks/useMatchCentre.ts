import { useQuery } from '@tanstack/react-query';
import { fetchLatestMatchCentre, fetchMatchCentre, type MatchCentreModel } from '@/lib/matchCentreRepo';

export function useMatchCentre(fixtureId?: string) {
  return useQuery<MatchCentreModel>({
    queryKey: ['match-centre', fixtureId || 'latest'],
    queryFn: () => (fixtureId ? fetchMatchCentre(fixtureId) : fetchLatestMatchCentre()),
    staleTime: 45_000,
    gcTime: 1_200_000,
  });
}
