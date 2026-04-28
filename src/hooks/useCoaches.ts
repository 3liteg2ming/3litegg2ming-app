import { useQuery } from '@tanstack/react-query';
import { fetchCurrentCoaches, type Coach } from '@/lib/homeRepo';

export type { Coach };

export function useCoaches() {
  return useQuery<Coach[]>({
    queryKey: ['coaches'],
    queryFn: fetchCurrentCoaches,
    staleTime: 300_000,
    gcTime: 600_000,
  });
}
