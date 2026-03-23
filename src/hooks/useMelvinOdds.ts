import { useQuery } from '@tanstack/react-query';
import { fetchMelvinOdds, type OddsMap } from '../lib/melvinOddsRepo';

export function useMelvinOdds() {
  return useQuery<OddsMap>({
    queryKey: ['melvin-odds'],
    queryFn: fetchMelvinOdds,
    staleTime: 120_000,
    gcTime: 600_000,
  });
}
