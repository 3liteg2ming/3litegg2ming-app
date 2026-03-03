import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { isUserAdmin } from '@/lib/profileRepo';

function NoAccessCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <section className="eg-admin-gate-screen">
      <div className="eg-admin-gate-card">
        <h1>{title}</h1>
        <p>{subtitle}</p>
        <div className="eg-admin-gate-actions">
          <Link to="/">Go Home</Link>
        </div>
      </div>
    </section>
  );
}

export default function AdminGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user?.id) {
        if (!alive) return;
        setChecking(false);
        setIsAdmin(false);
        return;
      }

      setChecking(true);
      setError(null);

      try {
        if (!alive) return;
        setIsAdmin(await isUserAdmin(user.id));
      } catch (err: any) {
        if (!alive) return;
        setIsAdmin(false);
        setError(err?.message || 'Unable to verify admin access.');
      } finally {
        if (alive) setChecking(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [user?.id]);

  if (loading || checking) {
    return <NoAccessCard title="Loading" subtitle="Checking admin access" />;
  }

  if (!user) {
    return <Navigate to="/auth/sign-in" replace state={{ from: location.pathname }} />;
  }

  if (error) {
    return <NoAccessCard title="No access" subtitle={error} />;
  }

  if (!isAdmin) {
    return <NoAccessCard title="No access" subtitle="Your account is not an admin." />;
  }

  return <>{children}</>;
}
