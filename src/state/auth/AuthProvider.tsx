import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { AuthState, CoachUser } from './types';
import type { TeamKey } from '../../lib/teamAssets';
import { buildAuthRedirect } from '../../lib/authRedirect';
import { getSupabaseClient, hasSupabaseEnv } from './supabaseClient';
import { mockGetUser, mockSignIn, mockSignOut, mockSignUp } from './mockAuth';

type AuthContextValue = AuthState & {
  signIn: (args: { email: string; password: string }) => Promise<void>;
  signUp: (args: {
    email: string;
    password: string;
    displayName?: string;
    psn?: string;
    firstName?: string;
    lastName?: string;
    teamKey?: TeamKey;
  }) => Promise<CoachUser | null>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function toCoachUserFromSupabase(raw: any): CoachUser | null {
  if (!raw) return null;
  const meta = raw.user_metadata || {};
  const resolvedPsn = meta.psn || meta.gamer_tag || meta.gamertag || meta.psn_name || undefined;
  return {
    id: raw.id,
    email: raw.email || '',
    displayName: meta.display_name || meta.displayName || undefined,
    psn: resolvedPsn,
    firstName: meta.first_name || meta.firstName || undefined,
    lastName: meta.last_name || meta.lastName || undefined,
    teamKey: meta.team_key || meta.teamKey || undefined,
  };
}

function cleanText(value: unknown): string {
  return String(value ?? '').trim();
}

async function ensureProfileFromAuthUser(supabase: ReturnType<typeof getSupabaseClient>, authUser: any | null) {
  if (!supabase || !authUser?.id) return;

  const meta = authUser.user_metadata || {};
  const firstName = cleanText(meta.first_name || meta.firstName);
  const lastName = cleanText(meta.last_name || meta.lastName);
  const displayName =
    cleanText(meta.display_name || meta.displayName) || cleanText(`${firstName} ${lastName}`) || cleanText(authUser.email).split('@')[0];
  const gamerTag = cleanText(meta.gamer_tag || meta.gamertag || meta.psn || meta.psn_name);

  try {
    const { data, error } = await supabase.from('profiles').select('user_id,psn').eq('user_id', authUser.id).maybeSingle();
    if (error) {
      console.error('[AuthBootstrap] profiles select failed', error);
    }

    const existingPsn = cleanText(data?.psn);
    const needsUpsert = !data?.user_id || !existingPsn;
    if (!needsUpsert) return;

    const payload = {
      user_id: authUser.id,
      email: authUser.email || null,
      first_name: firstName || null,
      last_name: lastName || null,
      display_name: displayName || null,
      psn: gamerTag || null,
      updated_at: new Date().toISOString(),
    };

    const profileUpsert = await supabase.from('profiles').upsert(payload, { onConflict: 'user_id' });
    if (profileUpsert.error) {
      console.error('[AuthBootstrap] profiles upsert failed', profileUpsert.error);
    }

    const egUpsert = await supabase.from('eg_profiles').upsert(payload, { onConflict: 'user_id' });
    if (egUpsert.error) {
      console.error('[AuthBootstrap] eg_profiles upsert failed', egUpsert.error);
    }
  } catch (err) {
    console.error('[AuthBootstrap] ensureProfileFromAuthUser failed', err);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [user, setUser] = useState<CoachUser | null>(null);
  const [loading, setLoading] = useState(true);

  const isSupabase = Boolean(supabase && hasSupabaseEnv);

  async function refresh() {
    setLoading(true);
    try {
      if (isSupabase) {
        const { data, error } = await supabase!.auth.getUser();
        if (error) {
          setUser(null);
        } else {
          await ensureProfileFromAuthUser(supabase, data.user);
          setUser(toCoachUserFromSupabase(data.user));
        }
      } else {
        setUser(mockGetUser());
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();

    if (!isSupabase) return;

    const { data: sub } = supabase!.auth.onAuthStateChange(async (_event, session) => {
      await ensureProfileFromAuthUser(supabase, session?.user || null);
      setUser(toCoachUserFromSupabase(session?.user));
      setLoading(false);
    });

    return () => {
      sub.subscription?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn(args: { email: string; password: string }) {
    setLoading(true);
    try {
      if (isSupabase) {
        const { data, error } = await supabase!.auth.signInWithPassword({
          email: args.email,
          password: args.password,
        });
        if (error) throw error;
        await ensureProfileFromAuthUser(supabase, data.user);
        setUser(toCoachUserFromSupabase(data.user));
      } else {
        const u = await mockSignIn(args);
        setUser(u);
      }
    } finally {
      setLoading(false);
    }
  }

  async function signUp(args: {
    email: string;
    password: string;
    displayName?: string;
    psn?: string;
    firstName?: string;
    lastName?: string;
    teamKey?: TeamKey;
  }): Promise<CoachUser | null> {
    setLoading(true);
    try {
      if (isSupabase) {
        const { data, error } = await supabase!.auth.signUp({
          email: args.email,
          password: args.password,
          options: {
            emailRedirectTo: buildAuthRedirect('/auth/callback'),
            data: {
              first_name: args.firstName,
              last_name: args.lastName,
              display_name: args.displayName,
              psn: args.psn,
              gamer_tag: args.psn,
              gamertag: args.psn,
              psn_name: args.psn,
              team_key: args.teamKey,
            },
          },
        });
        if (error) {
          console.error('[Auth.signUp] Supabase error', {
            code: (error as any)?.code,
            message: error.message,
            status: (error as any)?.status,
            name: (error as any)?.name,
          });
          throw error;
        }
        await ensureProfileFromAuthUser(supabase, data.user);
        const next = toCoachUserFromSupabase(data.user);
        setUser(next);
        return next;
      }

      const u = await mockSignUp(args);
      setUser(u);
      return u;
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    setLoading(true);
    try {
      if (isSupabase) {
        await supabase!.auth.signOut();
      } else {
        await mockSignOut();
      }
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  const value: AuthContextValue = {
    user,
    loading,
    isSupabase,
    signIn,
    signUp,
    signOut,
    refresh,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
