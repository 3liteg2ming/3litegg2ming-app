import { type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/state/auth/AuthProvider';
import { requireSupabaseClient } from '@/lib/supabaseClient';

const supabase = requireSupabaseClient();

export function getAdminToken(): string {
  return '';
}

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
  const { user, loading: authLoading } = useAuth();

  const roleQuery = useQuery({
    queryKey: ['admin', 'gate-role', user?.id || 'anon'],
    enabled: Boolean(user?.id) && !authLoading,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('eg_profiles')
        .select('role, is_banned')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data as { role: string | null; is_banned: boolean | null } | null;
    },
  });

  if (authLoading) {
    return <GateScreen title="Loading" subtitle="Checking account session." />;
  }

  if (!user) {
    return <Navigate to="/auth/sign-in" replace state={{ from: location.pathname }} />;
  }

  if (roleQuery.isLoading) {
    return <GateScreen title="Loading" subtitle="Verifying admin access…" />;
  }

  if (roleQuery.isError) {
    return (
      <GateScreen
        title="Error"
        subtitle={roleQuery.error instanceof Error ? roleQuery.error.message : 'Unable to verify access.'}
        cta={<Link to="/">Go Home</Link>}
      />
    );
  }

  const profile = roleQuery.data;

  if (!profile) {
    return (
      <GateScreen
        title="No access"
        subtitle="Profile not found."
        cta={<Link to="/">Go Home</Link>}
      />
    );
  }

  if (profile.is_banned) {
    return (
      <GateScreen
        title="Account disabled"
        subtitle="This account is currently disabled."
        cta={<Link to="/">Go Home</Link>}
      />
    );
  }

  if (profile.role !== 'super_admin') {
    return (
      <GateScreen
        title="No access"
        subtitle="Only super admins can access the Admin Console."
        cta={<Link to="/">Go Home</Link>}
      />
    );
  }

  return <>{children}</>;
}
