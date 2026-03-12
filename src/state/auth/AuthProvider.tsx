import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Session, User as SupabaseUser } from '@supabase/supabase-js';
import type { AuthState, CoachUser } from './types';
import type { TeamKey } from '../../lib/teamAssets';
import { buildAuthRedirect } from '../../lib/authRedirect';
import { fetchCoachProfile } from '../../lib/profileRepo';
import { getSupabaseClient, hasSupabaseEnv, requireSupabaseClient } from '../../lib/supabaseClient';
import { fetchTeamsByIds } from '../../lib/teamsRepo';

const PUBLIC_REGISTRATION_ONLY_MODE = true;
const PUBLIC_LAUNCH_FALLBACK_PATH = '/preseason-registration';
const PUBLIC_LAUNCH_ALLOWED_PATHS = new Set([
  '/preseason-registration',
  '/auth/sign-in',
  '/auth/sign-up',
  '/auth/forgot-password',
  '/auth/callback',
]);

type AuthContextValue = AuthState & {
  signIn: (args: { email: string; password: string }) => Promise<void>;
  signUp: (args: {
    email: string;
    password: string;
    displayName?: string;
    psn?: string;
    firstName?: string;
    lastName?: string;
    facebookName?: string;
    birthYear?: number;
    teamKey?: TeamKey;
  }) => Promise<CoachUser | null>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_TIMEOUT_MS = 10_000;
const SIGN_IN_TIMEOUT_MS = 25_000;
const SUPABASE_ENV_ERROR = 'App misconfigured: missing server keys. Please contact support.';
const SESSION_PERSIST_BLOCKED_ERROR =
  'Signed in, but your browser blocked saving the session. If you’re using Brave or an ad blocker, disable Shields for this site, or clear site data and reload.';
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

function cleanText(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizePublicPath(pathname: string): string {
  const raw = String(pathname || '/').trim();
  if (!raw || raw === '/') return '/';
  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withLeadingSlash.replace(/\/+$/, '') || '/';
}

function isPublicLaunchAllowedPath(pathname: string): boolean {
  return PUBLIC_LAUNCH_ALLOWED_PATHS.has(normalizePublicPath(pathname));
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
  const code = String((error as any)?.code || '').toLowerCase();
  const name = String((error as any)?.name || '').toLowerCase();
  return (
    message.includes('could not reach server') ||
    message.includes('failed to fetch') ||
    message.includes('network request failed') ||
    message.includes('networkerror') ||
    code === 'auth_timeout' ||
    name === 'authtimeouterror'
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

function toCoachUserFromSupabase(raw: SupabaseUser | null): CoachUser | null {
  if (!raw) return null;
  const meta = raw.user_metadata || {};
  const firstName = cleanText(meta.first_name || meta.firstName);
  const lastName = cleanText(meta.last_name || meta.lastName);
  const displayName =
    cleanText(meta.display_name || meta.displayName) ||
    cleanText(`${firstName} ${lastName}`) ||
    cleanText(raw.email).split('@')[0] ||
    'Coach';
  const resolvedPsn = cleanText(meta.psn || meta.gamer_tag || meta.gamertag || meta.psn_name) || undefined;

  return {
    id: raw.id,
    email: raw.email || '',
    displayName,
    psn: resolvedPsn,
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    facebookName: cleanText(meta.facebook_name) || undefined,
    birthYear: Number(meta.birth_year) || undefined,
  };
}

function mergeCoachUser(
  authUser: SupabaseUser | null,
  profile?: Awaited<ReturnType<typeof fetchCoachProfile>> | null,
  team?: { id: string; name: string; shortName: string; teamKey: string | null; logoUrl: string | null } | null,
): CoachUser | null {
  const base = toCoachUserFromSupabase(authUser);
  if (!base) return null;

  const displayName =
    cleanText(profile?.display_name) ||
    base.displayName ||
    cleanText(base.email).split('@')[0] ||
    'Coach';

  return {
    ...base,
    displayName,
    psn: cleanText(profile?.psn) || base.psn,
    teamKey: ((cleanText(team?.teamKey) || base.teamKey) as TeamKey | undefined) || undefined,
    teamId: cleanText(profile?.team_id) || undefined,
    teamName: cleanText(team?.shortName || team?.name) || undefined,
    teamLogoUrl: cleanText(team?.logoUrl) || undefined,
  };
}

async function ensureProfileFromAuthUser(supabase: ReturnType<typeof getSupabaseClient>, authUser: SupabaseUser | null) {
  if (!supabase || !authUser?.id) return;

  const meta = authUser.user_metadata || {};
  const firstName = cleanText(meta.first_name || meta.firstName);
  const lastName = cleanText(meta.last_name || meta.lastName);
  const displayName =
    cleanText(meta.display_name || meta.displayName) || cleanText(`${firstName} ${lastName}`) || cleanText(authUser.email).split('@')[0];
  const gamerTag = cleanText(meta.psn || meta.gamer_tag || meta.gamertag || meta.psn_name);
  const facebookName = cleanText(meta.facebook_name);
  const birthYear = Number(meta.birth_year) || null;

  try {
    const primary = await supabase.from('eg_profiles').select('user_id,psn,facebook_name,birth_year').eq('user_id', authUser.id).maybeSingle();
    if (primary.error) {
      console.error('[AuthBootstrap] eg_profiles select failed', toLoggableError(primary.error));
    }

    const fallback = !primary.data?.user_id
      ? await supabase.from('profiles').select('user_id,psn,facebook_name,birth_year').eq('user_id', authUser.id).maybeSingle()
      : { data: null, error: null };

    if (fallback.error) {
      console.error('[AuthBootstrap] profiles fallback select failed', toLoggableError(fallback.error));
    }

    const data = primary.data?.user_id ? primary.data : fallback.data;
    const existingPsn = cleanText(data?.psn);
    const needsUpsert = !data?.user_id || !existingPsn || !data.facebook_name || !data.birth_year;
    if (!needsUpsert) return;

    const payload = {
      user_id: authUser.id,
      email: authUser.email || null,
      first_name: firstName || null,
      last_name: lastName || null,
      display_name: displayName || null,
      psn: gamerTag || null,
      facebook_name: facebookName || null,
      birth_year: birthYear || null,
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
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<CoachUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const hydrateRequestRef = useRef(0);

  const isSupabase = Boolean(supabase && hasSupabaseEnv);
  const loading = booting;

  const hydrateIdentity = useCallback(
    async (authUser: SupabaseUser | null) => {
      const requestId = ++hydrateRequestRef.current;
      if (!authUser?.id) return;

      try {
        await ensureProfileFromAuthUser(supabase, authUser);
        const profile = await fetchCoachProfile(authUser.id);
        let team: { id: string; name: string; shortName: string; teamKey: string | null; logoUrl: string | null } | null = null;

        if (profile?.team_id) {
          try {
            const teamMap = await fetchTeamsByIds([profile.team_id]);
            team = teamMap.get(profile.team_id) || null;
          } catch (teamError) {
            debugLog('profile.team_lookup.failed', toLoggableError(teamError));
          }
        }

        if (requestId !== hydrateRequestRef.current) return;
        setUser(mergeCoachUser(authUser, profile, team));
      } catch (error) {
        if (requestId !== hydrateRequestRef.current) return;
        debugLog('profile.hydrate.failed', toLoggableError(error));
        setUser((current) => current || toCoachUserFromSupabase(authUser));
      }
    },
    [supabase],
  );

  const applySession = useCallback(
    (nextSession: Session | null, options?: { hydratedUser?: SupabaseUser | null }) => {
      setSession(nextSession);
      if (!nextSession?.user) {
        hydrateRequestRef.current += 1;
        setUser(null);
        return;
      }

      const authUser = options?.hydratedUser || nextSession.user;
      setUser((current) => mergeCoachUser(authUser) || current);
      void hydrateIdentity(authUser);
    },
    [hydrateIdentity],
  );

  const refresh = useCallback(async () => {
    debugLog('boot.start', {
      hasSupabaseEnv,
      isSupabase,
      supabaseUrl: SUPABASE_URL,
      hasAnonKey: SUPABASE_ANON_PRESENT,
    });

    setBooting(true);
    try {
      if (!isSupabase) {
        setSession(null);
        setUser(null);
        return;
      }

      const {
        data: { session: restoredSession },
        error: sessionError,
      } = await withTimeout(supabase!.auth.getSession(), AUTH_TIMEOUT_MS, 'Could not reach server. Please try again.');

      if (sessionError) {
        debugLog('boot.session.error', toLoggableError(sessionError));
        throw sessionError;
      }

      if (!restoredSession?.user) {
        debugLog('boot.session.none');
        setSession(null);
        setUser(null);
        return;
      }

      debugLog('boot.session.found', { userId: restoredSession.user.id });
      applySession(restoredSession);
    } catch (error) {
      logBootstrapError(error);
      setSession(null);
      setUser(null);
    } finally {
      setBooting(false);
      debugLog('boot.end');
    }
  }, [applySession, isSupabase, supabase]);

  useEffect(() => {
    debugLog('provider.init', { hasSupabaseEnv, isSupabase });
    void refresh();

    if (!isSupabase) return;

    const { data: sub } = supabase!.auth.onAuthStateChange((_event, nextSession) => {
      debugLog('auth.state.change', { event: _event, hasSession: Boolean(nextSession) });
      applySession(nextSession);
      setBooting(false);
    });

    return () => {
      sub.subscription?.unsubscribe();
    };
  }, [applySession, isSupabase, refresh, supabase]);

  useLayoutEffect(() => {
    if (typeof window === 'undefined' || !PUBLIC_REGISTRATION_ONLY_MODE) return;

    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);

    const enforcePublicLaunchRoute = () => {
      const currentPath = normalizePublicPath(window.location.pathname);
      if (isPublicLaunchAllowedPath(currentPath)) return;
      if (currentPath === PUBLIC_LAUNCH_FALLBACK_PATH) return;

      originalReplaceState(window.history.state, '', PUBLIC_LAUNCH_FALLBACK_PATH);
      window.dispatchEvent(new PopStateEvent('popstate'));
    };

    window.history.pushState = function (...args) {
      originalPushState(...args);
      enforcePublicLaunchRoute();
    };

    window.history.replaceState = function (...args) {
      originalReplaceState(...args);
      enforcePublicLaunchRoute();
    };

    window.addEventListener('popstate', enforcePublicLaunchRoute);
    enforcePublicLaunchRoute();

    return () => {
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      window.removeEventListener('popstate', enforcePublicLaunchRoute);
    };
  }, []);

  async function signIn(args: { email: string; password: string }) {
    debugLog('signin.start');
    setActionLoading(true);
    try {
      if (!isSupabase) throw new Error(SUPABASE_ENV_ERROR);

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
        if (!isReachabilityError(firstErr)) throw firstErr;
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

      const signedSession = data?.session || null;
      const signedUser = signedSession?.user || data?.user || null;
      if (!signedUser?.id) {
        const persistError = new Error(SESSION_PERSIST_BLOCKED_ERROR);
        (persistError as any).code = 'EG_SESSION_PERSIST_BLOCKED';
        throw persistError;
      }

      applySession(signedSession, { hydratedUser: signedUser });
      debugLog('signin.success', { userId: signedUser.id });
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
    facebookName?: string;
    birthYear?: number;
    teamKey?: TeamKey;
  }): Promise<CoachUser | null> {
    debugLog('signup.start');
    setActionLoading(true);
    try {
      if (!isSupabase) throw new Error(SUPABASE_ENV_ERROR);

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
            facebook_name: args.facebookName,
            birth_year: args.birthYear,
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
      if (data.session) applySession(data.session, { hydratedUser: data.user || null });
      else setUser(next);

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
      hydrateRequestRef.current += 1;
      setSession(null);
      setUser(null);
    } finally {
      setActionLoading(false);
    }
  }

  const value: AuthContextValue = {
    user,
    session,
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
