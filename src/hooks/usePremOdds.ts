import { useQuery } from '@tanstack/react-query';
import { fetchPremOdds, type PremOddsMap } from '../lib/premOddsRepo';

export function usePremOdds() {
  return useQuery<PremOddsMap>({
    queryKey: ['prem-odds'],
    queryFn: fetchPremOdds,
    staleTime: 120_000,
    gcTime: 600_000,
  });
}
