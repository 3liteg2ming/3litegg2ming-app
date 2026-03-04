import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { AuthState, CoachUser } from './types';
import type { TeamKey } from '../../lib/teamAssets';
import { buildAuthRedirect } from '../../lib/authRedirect';
import { getSupabaseClient, hasSupabaseEnv, requireSupabaseClient } from '../../lib/supabaseClient';
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
const AUTH_TIMEOUT_MS = 10_000;

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

function toLoggableError(error: unknown) {
  const err = error as any;
  return {
    code: err?.code,
    status: err?.status,
    message: err?.message || String(error || ''),
    details: err?.details,
    hint: err?.hint,
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

async function ensureProfileFromAuthUser(supabase: ReturnType<typeof getSupabaseClient>, authUser: any | null) {
  if (!supabase || !authUser?.id) return;

  const meta = authUser.user_metadata || {};
  const firstName = cleanText(meta.first_name || meta.firstName);
  const lastName = cleanText(meta.last_name || meta.lastName);
  const displayName =
    cleanText(meta.display_name || meta.displayName) || cleanText(`${firstName} ${lastName}`) || cleanText(authUser.email).split('@')[0];
  const gamerTag = cleanText(meta.psn || meta.gamer_tag || meta.gamertag || meta.psn_name);

  try {
    const { data, error } = await supabase.from('profiles').select('user_id,psn').eq('user_id', authUser.id).maybeSingle();
    if (error) {
      console.error('[AuthBootstrap] profiles select failed', toLoggableError(error));
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
      console.error('[AuthBootstrap] profiles upsert failed', toLoggableError(profileUpsert.error));
    }

    const egUpsert = await supabase.from('eg_profiles').upsert(payload, { onConflict: 'user_id' });
    if (egUpsert.error) {
      console.error('[AuthBootstrap] eg_profiles upsert failed', toLoggableError(egUpsert.error));
    }
  } catch (err) {
    console.error('[AuthBootstrap] ensureProfileFromAuthUser failed', toLoggableError(err));
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => (hasSupabaseEnv ? requireSupabaseClient() : null), []);
  const [user, setUser] = useState<CoachUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const isSupabase = Boolean(supabase && hasSupabaseEnv);
  const loading = booting || actionLoading;

  async function refresh() {
    setBooting(true);
    try {
      if (isSupabase) {
        const {
          data: { session },
          error: sessionError,
        } = await withTimeout(
          supabase!.auth.getSession(),
          AUTH_TIMEOUT_MS,
          'Could not reach the server. Please try again.',
        );
        if (sessionError) {
          throw sessionError;
        }
        if (!session) {
          setUser(null);
        } else {
          const { data, error } = await withTimeout(
            supabase!.auth.getUser(),
            AUTH_TIMEOUT_MS,
            'Could not reach the server. Please try again.',
          );
          if (error) {
            setUser(null);
          } else {
            await ensureProfileFromAuthUser(supabase, data.user);
            setUser(toCoachUserFromSupabase(data.user));
          }
        }
      } else {
        setUser(mockGetUser());
      }
    } catch (error) {
      console.error('[Auth.refresh] bootstrap failed', toLoggableError(error));
      setUser(null);
    } finally {
      setBooting(false);
    }
  }

  useEffect(() => {
    refresh();

    if (!isSupabase) return;

    const { data: sub } = supabase!.auth.onAuthStateChange(async (_event, session) => {
      await ensureProfileFromAuthUser(supabase, session?.user || null);
      setUser(toCoachUserFromSupabase(session?.user));
      setBooting(false);
    });

    return () => {
      sub.subscription?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn(args: { email: string; password: string }) {
    setActionLoading(true);
    try {
      if (isSupabase) {
        const { data, error } = await withTimeout(
          supabase!.auth.signInWithPassword({
            email: args.email,
            password: args.password,
          }),
          AUTH_TIMEOUT_MS,
          'Could not reach the server. Please try again.',
        );
        if (error) throw error;
        await ensureProfileFromAuthUser(supabase, data.user);
        setUser(toCoachUserFromSupabase(data.user));
      } else {
        const u = await mockSignIn(args);
        setUser(u);
      }
    } finally {
      setActionLoading(false);
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
    setActionLoading(true);
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
      setActionLoading(false);
    }
  }

  async function signOut() {
    setActionLoading(true);
    try {
      if (isSupabase) {
        await supabase!.auth.signOut();
      } else {
        await mockSignOut();
      }
      setUser(null);
    } finally {
      setActionLoading(false);
    }
  }

  const value: AuthContextValue = {
    user,
    booting,
    actionLoading,
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
