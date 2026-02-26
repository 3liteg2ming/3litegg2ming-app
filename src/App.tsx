import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import HomePage from './pages/HomePage';
import { ProtectedRoute } from './state/auth/ProtectedRoute';
import BottomNav from './components/BottomNav';
import TopHeader from './components/TopHeader';
import WelcomeSplash from './components/WelcomeSplash';

import './styles/appFrame.css';
import './styles/auth.css';

const AFL26FixturesPage = lazy(() => import('./pages/AFL26FixturesPage'));
const LadderPage = lazy(() => import('./pages/LadderPage'));
const ComingSoonPage = lazy(() => import('./pages/ComingSoonPage'));
const MatchCentrePage = lazy(() => import('./pages/MatchCentrePage'));
const MembersPage = lazy(() => import('./pages/MembersPage'));
const SubmitPage = lazy(() => import('./pages/SubmitPage'));
const SignInPage = lazy(() => import('./pages/auth/SignInPage'));
const SignUpPage = lazy(() => import('./pages/auth/SignUpPage'));
const AdminCreateFixturePage = lazy(() => import('./pages/admin/AdminCreateFixturePage'));
const AFL2026StatsPage = lazy(() => import('./pages/AFL2026StatsPage'));
const StatLeadersPage = lazy(() => import('./pages/StatLeadersPage'));
const PreseasonPage = lazy(() => import('./pages/PreseasonPage'));

function RouteFallback() {
  return (
    <div
      style={{
        minHeight: '50vh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
      }}
      aria-busy="true"
      aria-live="polite"
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          borderRadius: 20,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
          padding: 18,
          boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
        }}
      >
        <div
          style={{
            height: 14,
            width: '42%',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.08)',
            marginBottom: 14,
          }}
        />
        <div
          style={{
            height: 12,
            width: '100%',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.05)',
            marginBottom: 10,
          }}
        />
        <div
          style={{
            height: 12,
            width: '78%',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.05)',
            marginBottom: 16,
          }}
        />
        <div
          style={{
            height: 4,
            width: '100%',
            borderRadius: 999,
            background:
              'linear-gradient(90deg, rgba(255,210,24,0.95) 0%, rgba(123,214,255,0.95) 55%, rgba(255,255,255,0.12) 100%)',
          }}
        />
      </div>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const welcomeOpen =
    typeof document !== 'undefined' && document.body.classList.contains('egWelcomeOpen');

  const hideNav =
    welcomeOpen ||
    location.pathname.startsWith('/auth/sign-in') ||
    location.pathname.startsWith('/auth/sign-up');

  return (
    <div className="eg-viewport">
      <div className="eg-device" role="application" aria-label="Elite Gaming App">
        {!welcomeOpen ? <TopHeader /> : null}
        <WelcomeSplash />

        <Suspense fallback={<RouteFallback />}>
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
          <Route path="/preseason" element={<PreseasonPage />} />

          {/* Admin (protected) */}
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
          <Route path="/match-centre/:matchId" element={<MatchCentrePage />} />

          <Route path="/coming-soon" element={<ComingSoonPage />} />

          {/* fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>

        {!hideNav ? <BottomNav /> : null}
      </div>
    </div>
  );
}
