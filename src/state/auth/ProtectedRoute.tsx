import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, booting } = useAuth();
  const location = useLocation();

  if (booting) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-title">Restoring session…</div>
          <div className="auth-sub">Checking your coach account</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth/sign-in" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />;
  }

  return <>{children}</>;
}
