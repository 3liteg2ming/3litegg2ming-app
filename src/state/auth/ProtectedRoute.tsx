import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-title">Loading…</div>
          <div className="auth-sub">Checking your coach session</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth/sign-in" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
