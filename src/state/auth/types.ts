import type { TeamKey } from '../../lib/teamAssets';

export type CoachUser = {
  id: string;
  email: string;
  displayName?: string;
  psn?: string;
  teamKey?: TeamKey;
};

export type AuthState = {
  user: CoachUser | null;
  loading: boolean;
  // Indicates whether Supabase env vars are present and we are using Supabase auth.
  isSupabase: boolean;
};
