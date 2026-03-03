import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { isUserAdmin } from '@/lib/profileRepo';

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLoading, setAdminLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      setAdminLoading(true);
      try {
        if (!user?.id) {
          setIsAdmin(false);
          setAdminLoading(false);
          return;
        }

        const adminFlag = await isUserAdmin(user.id);
        if (alive) setIsAdmin(adminFlag);
      } catch (e) {
        console.error('[AdminRoute] error checking admin:', e);
        if (alive) {
          setIsAdmin(false);
        }
      } finally {
        if (alive) {
          setAdminLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [user?.id]);

  // Wait for both auth and admin status to load
  if (loading || adminLoading) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-title">Loading…</div>
          <div className="auth-sub">Checking admin access</div>
        </div>
      </div>
    );
  }

  // Not signed in, redirect to sign-in
  if (!user) {
    return <Navigate to="/auth/sign-in" replace state={{ from: location.pathname }} />;
  }

  // Signed in but not admin
  if (!isAdmin) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-title">Access Denied</div>
          <div className="auth-sub">You don't have permission to access this area.</div>
          <button
            onClick={() => window.location.href = '/'}
            style={{
              marginTop: 16,
              padding: '10px 20px',
              background: 'rgba(245, 196, 0, 0.9)',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer',
              color: '#000',
            }}
          >
            Return Home
          </button>
        </div>
      </div>
    );
  }

  // Admin, allow access
  return <>{children}</>;
}
