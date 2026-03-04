import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import type { AdminProfile } from '@/lib/adminTypes';
import { requireSupabaseClient } from '@/lib/supabaseClient';
import { useAuth } from '@/state/auth/AuthProvider';
import { isUserAdmin } from '@/lib/profileRepo';

const supabase = requireSupabaseClient();

let profileMemoryCache: AdminProfile | null = null;

function GateScreen(props: { title: string; subtitle: string; cta?: ReactNode }) {
  return (
    <section className="eg-admin-gate-screen">
      <div className="eg-admin-gate-card">
        <h1>{props.title}</h1>
        <p>{props.subtitle}</p>
        {props.cta ? <div className="eg-admin-gate-actions">{props.cta}</div> : null}
      </div>
    </section>
  );
}

export default function AdminGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, loading } = useAuth();

  const profileQuery = useQuery({
    queryKey: ['admin', 'profile', user?.id || 'anonymous'],
    enabled: Boolean(user?.id) && !loading,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    initialData: profileMemoryCache,
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('eg_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw new Error(error.message);

      const profile = (data as AdminProfile | null) ?? null;
      profileMemoryCache = profile;
      return profile;
    },
  });

  const legacyAdminQuery = useQuery({
    queryKey: ['admin', 'profiles-is-admin', user?.id || 'anonymous'],
    enabled: Boolean(user?.id) && !loading,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      if (!user?.id) return false;
      return await isUserAdmin(user.id);
    },
  });

  if (loading) {
    return <GateScreen title="Loading" subtitle="Checking account session." />;
  }

  if (!user) {
    return <Navigate to="/auth/sign-in" replace state={{ from: location.pathname }} />;
  }

  if (profileQuery.isLoading) {
    return <GateScreen title="Loading" subtitle="Verifying admin access." />;
  }

  if (profileQuery.isError) {
    return (
      <GateScreen
        title="Admin check failed"
        subtitle={profileQuery.error instanceof Error ? profileQuery.error.message : 'Unable to load your profile.'}
        cta={<Link to="/">Go Home</Link>}
      />
    );
  }

  const profile = profileQuery.data;
  const legacyIsAdmin = legacyAdminQuery.data === true;

  if (!profile && !legacyIsAdmin) {
    return (
      <GateScreen
        title="No access"
        subtitle="Profile not found in eg_profiles"
        cta={<Link to="/">Go Home</Link>}
      />
    );
  }

  if (profile?.is_banned) {
    return (
      <GateScreen
        title="Account disabled"
        subtitle="This account is currently disabled. Contact a super admin for review."
        cta={<Link to="/">Go Home</Link>}
      />
    );
  }

  const isAdmin =
    profile?.role === 'admin' ||
    profile?.role === 'super_admin' ||
    legacyIsAdmin;

  if (!isAdmin) {
    return (
      <GateScreen
        title="No access"
        subtitle="Your account does not have permission to open Admin Console."
        cta={<Link to="/">Go Home</Link>}
      />
    );
  }

  return <>{children}</>;
}
