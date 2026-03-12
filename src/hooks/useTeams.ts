import { useQuery } from '@tanstack/react-query';
import { fetchTeamOptions, type TeamOption } from '../lib/teamsRepo';

export function useTeamOptions() {
  return useQuery<TeamOption[]>({
    queryKey: ['teams', 'options'],
    queryFn: () => fetchTeamOptions(),
    staleTime: 45_000,
    gcTime: 1_200_000,
  });
}
