import { useQuery } from '@tanstack/react-query';
import { requireSupabaseClient } from '@/lib/supabaseClient';

const supabase = requireSupabaseClient();

export type Coach = {
  user_id: string;
  display_name?: string;
  team_id?: string;
  team_key?: string;
};

async function fetchCoaches(): Promise<Coach[]> {
  const { data: profiles, error: profilesError } = await supabase.from('profiles').select('user_id, display_name, team_id').not('team_id', 'is', null);
  if (profilesError) {
    throw new Error(profilesError.message);
  }

  const { data: teams, error: teamsError } = await supabase.from('teams').select('id, team_key');
  if (teamsError) {
    // Gracefully handle teams error, profiles will be returned without team_key
    console.error("Failed to fetch teams for coaches", teamsError);
    return profiles as Coach[];
  }

  const teamsById = new Map<string, { team_key?: string }>();
  for (const team of teams) {
    teamsById.set(team.id, team);
  }

  return profiles.map(p => ({
    ...p,
    team_key: teamsById.get(p.team_id!)?.team_key,
  }));
}

export function useCoaches() {
  return useQuery({
    queryKey: ['coaches'],
    queryFn: fetchCoaches,
    staleTime: 300_000, // 5 minutes
    gcTime: 600_000, // 10 minutes
  });
}
