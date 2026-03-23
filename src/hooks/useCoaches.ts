import { useQuery } from '@tanstack/react-query';
import { fetchTeamsByIds } from '@/lib/teamsRepo';
import { requireSupabaseClient } from '@/lib/supabaseClient';

const supabase = requireSupabaseClient();

export type Coach = {
  user_id: string;
  display_name?: string;
  team_id?: string;
  team_key?: string;
};

type CoachProfileRow = {
  user_id?: string | null;
  display_name?: string | null;
  psn?: string | null;
  team_id?: string | null;
};

function text(value: unknown): string {
  return String(value || '').trim();
}

async function fetchCoachProfiles(table: 'eg_profiles' | 'profiles'): Promise<CoachProfileRow[]> {
  const attempts = ['user_id, display_name, psn, team_id', 'user_id, display_name, team_id'] as const;
  let lastError: Error | null = null;

  for (const selectCols of attempts) {
    const { data, error } = await supabase.from(table).select(selectCols).not('team_id', 'is', null);
    if (!error) {
      return Array.isArray(data) ? (data as CoachProfileRow[]) : [];
    }

    lastError = new Error(error.message);
  }

  if (table === 'eg_profiles') {
    console.warn(`[useCoaches] ${table} lookup failed, falling back`, lastError);
    return [];
  }

  throw lastError || new Error(`Failed to load ${table}`);
}

async function fetchCoaches(): Promise<Coach[]> {
  const primaryProfiles = await fetchCoachProfiles('eg_profiles');
  const profiles = primaryProfiles.length > 0 ? primaryProfiles : await fetchCoachProfiles('profiles');
  if (!profiles.length) return [];

  const teamIds = Array.from(new Set(profiles.map((profile) => text(profile.team_id)).filter(Boolean)));
  let teamsById = new Map<string, { teamKey?: string | null }>();

  try {
    const teams = await fetchTeamsByIds(teamIds);
    teamsById = new Map(Array.from(teams.entries()).map(([teamId, team]) => [teamId, { teamKey: team.teamKey }]));
  } catch (teamsError) {
    // Keep coach rows usable even if the team lookup is temporarily unavailable.
    console.error('[useCoaches] Failed to fetch teams for coaches', teamsError);
  }

  const coaches: Coach[] = [];

  for (const profile of profiles) {
    const userId = text(profile.user_id);
    const teamId = text(profile.team_id);
    if (!userId || !teamId) continue;

    coaches.push({
      user_id: userId,
      display_name: text(profile.display_name) || text(profile.psn) || 'Coach',
      team_id: teamId,
      team_key: teamsById.get(teamId)?.teamKey || undefined,
    });
  }

  return coaches;
}

export function useCoaches() {
  return useQuery({
    queryKey: ['coaches'],
    queryFn: fetchCoaches,
    staleTime: 300_000, // 5 minutes
    gcTime: 600_000, // 10 minutes
  });
}
