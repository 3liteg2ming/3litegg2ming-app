import { useQuery } from '@tanstack/react-query';
import { fetchTeamOptions, type TeamOption } from '../lib/teamsRepo';

export function useTeamOptions() {
  return useQuery<TeamOption[]>({
    queryKey: ['teams', 'options'],
    queryFn: () => fetchTeamOptions(),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}
