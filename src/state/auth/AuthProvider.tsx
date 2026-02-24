import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { AuthState, CoachUser } from './types';
import type { TeamKey } from '../../lib/teamAssets';
import { getSupabaseClient, hasSupabaseEnv } from './supabaseClient';
import { mockGetUser, mockSignIn, mockSignOut, mockSignUp } from './mockAuth';

type AuthContextValue = AuthState & {
  signIn: (args: { email: string; password: string }) => Promise<void>;
  signUp: (args: {
    email: string;
    password: string;
    displayName?: string;
    psn?: string;
    teamKey?: TeamKey;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function toCoachUserFromSupabase(raw: any): CoachUser | null {
  if (!raw) return null;
  const meta = raw.user_metadata || {};
  return {
    id: raw.id,
    email: raw.email || '',
    displayName: meta.display_name || meta.displayName || undefined,
    psn: meta.psn || undefined,
    teamKey: meta.team_key || meta.teamKey || undefined,
  };
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
    // Initial load
    refresh();

    if (!isSupabase) return;

    // Keep in sync with Supabase session changes
    const { data: sub } = supabase!.auth.onAuthStateChange((_event, session) => {
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
    teamKey?: TeamKey;
  }) {
    setLoading(true);
    try {
      if (isSupabase) {
        const { data, error } = await supabase!.auth.signUp({
          email: args.email,
          password: args.password,
          options: {
            data: {
              display_name: args.displayName,
              psn: args.psn,
              team_key: args.teamKey,
            },
          },
        });
        if (error) throw error;
        setUser(toCoachUserFromSupabase(data.user));
      } else {
        const u = await mockSignUp(args);
        setUser(u);
      }
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
