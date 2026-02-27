import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ComingSoonPage from './pages/ComingSoonPage';
import MatchCentrePage from './pages/MatchCentrePage';
import MembersPage from './pages/MembersPage';

import SignInPage from './pages/auth/SignInPage';
import SignUpPage from './pages/auth/SignUpPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';

import { AuthProvider } from './state/auth/AuthProvider';
import { ProtectedRoute } from './state/auth/ProtectedRoute';
import { AdminRoute } from './state/auth/AdminRoute';

// Create QueryClient instance with optimized settings
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 45_000, // 45 seconds
      gcTime: 1_200_000, // 20 minutes (formerly cacheTime)
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

import AdminCreateFixturePage from './pages/admin/AdminCreateFixturePage';
import AdminPanelPage from './pages/admin/AdminPanelPage';

import BottomNav from './components/BottomNav';
import TopHeader from './components/TopHeader';

// Lovable-styled Stats pages (wired to /stats3)
import StatLeadersPage from './pages/StatLeadersPage';

import './styles/appFrame.css';
import './styles/auth.css';

const HomePage = lazy(() => import('./pages/HomePage'));
const AFL26FixturesPage = lazy(() => import('./pages/AFL26FixturesPage'));
const LadderPage = lazy(() => import('./pages/LadderPage'));
const SubmitPage = lazy(() => import('./pages/SubmitPage'));
const AFL2026StatsPage = lazy(() => import('./pages/AFL2026StatsPage'));

function AppRoutes() {
  const location = useLocation();

  const hideNav =
    location.pathname.startsWith('/auth/sign-in') ||
    location.pathname.startsWith('/auth/sign-up');

  return (
    <>
      <TopHeader />

      <Suspense fallback={<div />}>
        <Routes>
          <Route path="/" element={<HomePage />} />

          {/* Core */}
          <Route path="/fixtures" element={<AFL26FixturesPage />} />
          <Route path="/ladder" element={<LadderPage />} />

          {/* ✅ Stats v3 */}
          <Route path="/stats3" element={<AFL2026StatsPage />} />
          <Route path="/stats3/leaders" element={<StatLeadersPage />} />
          <Route path="/stats3/compare" element={<ComingSoonPage />} />

          {/* Lovable compare route (older link in the design) */}
          <Route path="/stats2/compare" element={<ComingSoonPage />} />

          {/* Backward compatibility */}
          <Route path="/stats" element={<Navigate to="/stats3" replace />} />
          <Route path="/stats/leaders" element={<Navigate to="/stats3/leaders" replace />} />

          {/* Submit Results (protected) */}
          <Route
            path="/submit"
            element={
              <ProtectedRoute>
                <SubmitPage />
              </ProtectedRoute>
            }
          />

          {/* Auth */}
          <Route path="/auth/sign-in" element={<SignInPage />} />
          <Route path="/auth/sign-up" element={<SignUpPage />} />

          {/* Members (protected) */}
          <Route
            path="/members"
            element={
              <ProtectedRoute>
                <MembersPage />
              </ProtectedRoute>
            }
          />

          {/* Pro Team placeholder */}
          <Route path="/pro-team" element={<ComingSoonPage />} />

          {/* Admin (protected) */}
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminPanelPage />
              </AdminRoute>
            }
          />
          <Route
            path="/admin/create-fixture"
            element={
              <ProtectedRoute>
                <AdminCreateFixturePage />
              </ProtectedRoute>
            }
          />

          {/* Match Centre */}
          <Route path="/match-centre" element={<MatchCentrePage />} />
          <Route path="/match-centre/:fixtureId" element={<MatchCentrePage />} />

          <Route path="/coming-soon" element={<ComingSoonPage />} />

          {/* fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>

      {!hideNav ? <BottomNav /> : null}
    </>
  );
}

export default function App() {
  return (
    <div className="eg-viewport">
      <div className="eg-device" role="application" aria-label="Elite Gaming App">
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </QueryClientProvider>
      </div>
    </div>
  );
}
