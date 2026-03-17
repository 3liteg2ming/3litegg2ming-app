import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';

// TEMPORARY: Bypass route protection to allow direct URL access
// Set to false to re-enable authentication checks
const BYPASS_PROTECTION = true;

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  // TEMPORARY: Pass through without auth check
  if (BYPASS_PROTECTION) {
    return <>{children}</>;
  }

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
