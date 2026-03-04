import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { AuthState, CoachUser } from './types';
import type { TeamKey } from '../../lib/teamAssets';
import { buildAuthRedirect } from '../../lib/authRedirect';
import { getSupabaseClient, hasSupabaseEnv, requireSupabaseClient } from '../../lib/supabaseClient';

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
const SIGN_IN_TIMEOUT_MS = 25_000;
const SUPABASE_ENV_ERROR = 'App misconfigured: missing server keys. Please contact support.';
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const SUPABASE_ANON_PRESENT = Boolean((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim());

function isDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem('eg_debug') === '1';
  } catch {
    return false;
  }
}

function debugLog(event: string, payload?: Record<string, unknown>) {
  if (!isDebugEnabled()) return;
  if (payload) {
    console.info(`[EG DEBUG][auth] ${event}`, payload);
  } else {
    console.info(`[EG DEBUG][auth] ${event}`);
  }
}

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
    name: err?.name,
    code: err?.code,
    status: err?.status,
    message: err?.message || String(error || ''),
    stack: err?.stack,
    details: err?.details,
    hint: err?.hint,
    timeout: Boolean(err?.timeout),
  };
}

class AuthTimeoutError extends Error {
  timeout: boolean;

  constructor(message: string) {
    super(message);
    this.name = 'AuthTimeoutError';
    this.timeout = true;
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new AuthTimeoutError(message));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
}

function isReachabilityError(error: unknown): boolean {
  const message = String((error as any)?.message || '').toLowerCase();
  return (
    message.includes('could not reach server') ||
    message.includes('failed to fetch') ||
    message.includes('network request failed') ||
    message.includes('networkerror')
  );
}

function logBootstrapError(error: unknown) {
  const err = error as any;
  const payload = {
    name: err?.name,
    message: err?.message || String(error || ''),
    stack: err?.stack,
    status: err?.status,
    code: err?.code,
    details: err?.details,
    hint: err?.hint,
    timeout: Boolean(err?.timeout),
  };

  console.error('[Auth.refresh] bootstrap failed', payload);
  debugLog('boot.failed', payload);
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
    debugLog('boot.start', {
      hasSupabaseEnv,
      isSupabase,
      supabaseUrl: SUPABASE_URL,
      hasAnonKey: SUPABASE_ANON_PRESENT,
    });
    setBooting(true);
    try {
      if (isSupabase) {
        const {
          data: { session },
          error: sessionError,
        } = await withTimeout(
          supabase!.auth.getSession(),
          AUTH_TIMEOUT_MS,
          'Could not reach server. Please try again.',
        );
        if (sessionError) {
          debugLog('boot.session.error', toLoggableError(sessionError));
          throw sessionError;
        }
        if (!session) {
          debugLog('boot.session.none');
          setUser(null);
        } else {
          debugLog('boot.session.found');
          const { data, error } = await withTimeout(
            supabase!.auth.getUser(),
            AUTH_TIMEOUT_MS,
            'Could not reach server. Please try again.',
          );
          if (error) {
            debugLog('boot.user.error', toLoggableError(error));
            setUser(null);
          } else {
            await ensureProfileFromAuthUser(supabase, data.user);
            setUser(toCoachUserFromSupabase(data.user));
          }
        }
      } else {
        debugLog('boot.env.missing');
        setUser(null);
      }
    } catch (error) {
      logBootstrapError(error);
      setUser(null);
    } finally {
      setBooting(false);
      debugLog('boot.end');
    }
  }

  useEffect(() => {
    debugLog('provider.init', { hasSupabaseEnv, isSupabase });
    refresh();

    if (!isSupabase) return;

    const { data: sub } = supabase!.auth.onAuthStateChange(async (_event, session) => {
      debugLog('auth.state.change', { event: _event, hasSession: Boolean(session) });
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
    debugLog('signin.start');
    setActionLoading(true);
    try {
      if (!isSupabase) {
        throw new Error(SUPABASE_ENV_ERROR);
      }
      let data: any = null;
      let error: any = null;
      try {
        const response = await withTimeout(
          supabase!.auth.signInWithPassword({
            email: args.email,
            password: args.password,
          }),
          SIGN_IN_TIMEOUT_MS,
          'Could not reach server. Please try again.',
        );
        data = response.data;
        error = response.error;
      } catch (firstErr) {
        if (!isReachabilityError(firstErr)) {
          throw firstErr;
        }
        debugLog('signin.retry', { reason: String((firstErr as any)?.message || 'network timeout') });
        const response = await withTimeout(
          supabase!.auth.signInWithPassword({
            email: args.email,
            password: args.password,
          }),
          SIGN_IN_TIMEOUT_MS,
          'Could not reach server. Please try again.',
        );
        data = response.data;
        error = response.error;
      }

      if (error) throw error;
      await ensureProfileFromAuthUser(supabase, data.user);
      setUser(toCoachUserFromSupabase(data.user));
      debugLog('signin.success', { hasUser: Boolean(data.user) });
    } catch (error) {
      debugLog('signin.failed', toLoggableError(error));
      throw error;
    } finally {
      setActionLoading(false);
      debugLog('signin.end');
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
    debugLog('signup.start');
    setActionLoading(true);
    try {
      if (!isSupabase) {
        throw new Error(SUPABASE_ENV_ERROR);
      }
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
      debugLog('signup.success', { hasUser: Boolean(next) });
      return next;
    } catch (error) {
      debugLog('signup.failed', toLoggableError(error));
      throw error;
    } finally {
      setActionLoading(false);
      debugLog('signup.end');
    }
  }

  async function signOut() {
    setActionLoading(true);
    try {
      if (!isSupabase) throw new Error(SUPABASE_ENV_ERROR);
      await supabase!.auth.signOut();
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
