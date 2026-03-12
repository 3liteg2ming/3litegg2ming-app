import type { TeamKey } from '../../lib/teamAssets';

export type CoachUser = {
  id: string;
  email: string;
  displayName?: string;
  psn?: string;
  firstName?: string;
  lastName?: string;
  facebookName?: string;
  birthYear?: number;
  teamKey?: TeamKey;
  teamId?: string;
  teamName?: string;
  teamLogoUrl?: string;
};

export type AuthState = {
  user: CoachUser | null;
  session?: unknown | null;
  // Initial session/user bootstrap loading.
  booting: boolean;
  // Active auth action loading (sign in/up/out).
  actionLoading: boolean;
  // Backward compatible aggregate loading flag.
  loading: boolean;
  // Indicates whether Supabase env vars are present and we are using Supabase auth.
  isSupabase: boolean;
};
