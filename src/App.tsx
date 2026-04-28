import { Suspense, lazy, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { attachQueryPersister, hydrateQueryClient, prefetchPublicPageData } from './lib/queryPersist';

import ComingSoonPage from './pages/ComingSoonPage';
import MatchCentrePage from './pages/MatchCentrePage';
import MembersPage from './pages/MembersPage';
import { SpeedInsights } from '@vercel/speed-insights/react';

import SignInPage from './pages/auth/SignInPage';
import SignUpPage from './pages/auth/SignUpPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import AuthCallbackPage from './pages/auth/AuthCallbackPage';

import { ProtectedRoute } from './state/auth/ProtectedRoute';

import BottomNav from './components/BottomNav';
import TopHeader from './components/TopHeader';
import ErrorBoundary from './components/ErrorBoundary';
import StatLeadersPage from './pages/StatLeadersPage';

import './styles/appFrame.css';
import './styles/auth.css';
import './styles/error-boundary.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Aggressive caching for the finals window: data within a session never
      // refetches automatically, second visits hydrate instantly from
      // localStorage, and a manual reload forces fresh data.
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: true,
      retry: 1,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    },
    mutations: {
      retry: 0,
    },
  },
});

// Restore previously-cached query results from localStorage so the public
// pages render instantly on the next visit — the network refresh runs in the
// background and updates the UI when ready.
hydrateQueryClient(queryClient);
attachQueryPersister(queryClient);
// Warm the cache for every public page the moment the app boots so navigating
// between Home / Fixtures / Ladder / Teams feels instant.
prefetchPublicPageData(queryClient);

const HomePage = lazy(() => import('./pages/HomePage'));
const AFL26FixturesPage = lazy(() => import('./pages/AFL26FixturesPage'));
const LadderPage = lazy(() => import('./pages/LadderPage'));
const SubmitPage = lazy(() => import('./pages/SubmitPage'));
const AFL2026StatsPage = lazy(() => import('./pages/AFL2026StatsPage'));
const BestTeamPage = lazy(() => import('./pages/BestTeamPage'));
const PlayerProfilePage = lazy(() => import('./pages/PlayerProfilePage'));
const HeadToHeadPage = lazy(() => import('./pages/HeadToHeadPage'));
const PreseasonPage = lazy(() => import('./pages/PreseasonPage'));
const PreseasonRegistrationPage = lazy(() => import('./pages/PreseasonRegistrationPage'));
const AdminConsolePage = lazy(() => import('./pages/AdminConsolePage'));

const AdminGate = lazy(() => import('./routes/admin/AdminGate'));
const AdminLayout = lazy(() => import('./routes/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('./routes/admin/pages/AdminDashboard'));
const AdminSeasons = lazy(() => import('./routes/admin/pages/AdminSeasons'));
const AdminTeams = lazy(() => import('./routes/admin/pages/AdminTeams'));
const AdminPlayers = lazy(() => import('./routes/admin/pages/AdminPlayers'));
const AdminFixtures = lazy(() => import('./routes/admin/pages/AdminFixtures'));
const AdminFixtureDetail = lazy(() => import('./routes/admin/pages/AdminFixtureDetail'));
const AdminRebuild = lazy(() => import('./routes/admin/pages/AdminRebuild'));
const AdminCoaches = lazy(() => import('./routes/admin/pages/AdminCoaches'));
const AdminSubmissions = lazy(() => import('./routes/admin/pages/AdminSubmissions'));
const AdminContent = lazy(() => import('./routes/admin/pages/AdminContent'));
const AdminFlags = lazy(() => import('./routes/admin/pages/AdminFlags'));
const AdminAssets = lazy(() => import('./routes/admin/pages/AdminAssets'));
const AdminAudit = lazy(() => import('./routes/admin/pages/AdminAudit'));
const AdminOdds = lazy(() => import('./routes/admin/pages/AdminOdds'));
const AdminNews = lazy(() => import('./routes/admin/pages/AdminNews'));
const AdminBestTeam = lazy(() => import('./routes/admin/pages/AdminBestTeam'));
const TeamsPage = lazy(() => import('./pages/TeamsPage'));
const TeamProfilePage = lazy(() => import('./pages/TeamProfilePage'));

const GLOBAL_CRASH_EVENT = 'eg:global-crash';

type CrashDetail = {
  source?: string;
  message?: string;
};

function toCrashMessage(value: unknown) {
  const text = String(value || '').trim();
  return text || 'Unknown crash';
}

function PageCrashFallback({ title, message, details }: { title: string; message: string; details?: string }) {
  return (
    <section className="egCrashInline" role="alert" aria-live="assertive">
      <div className="egCrashInline__panel">
        <div className="egCrashInline__kicker">Elite Gaming</div>
        <h1 className="egCrashInline__title">{title}</h1>
        <p className="egCrashInline__message">{message}</p>
        {import.meta.env.DEV && details ? (
          <details className="egCrashInline__details">
            <summary>Show error details</summary>
            <pre>{details}</pre>
          </details>
        ) : null}
        <button type="button" className="egCrashInline__reload" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    </section>
  );
}

function HomeRouteSafe() {
  return (
    <ErrorBoundary
      title="Something went wrong"
      message="Home failed to render. You can reload safely."
      onError={(error, info) => {
        console.error('[EG CRASH] Home route boundary', error, info?.componentStack || '');
      }}
    >
      <HomePage />
    </ErrorBoundary>
  );
}

function AppRoutes() {
  const location = useLocation();
  const [globalCrash, setGlobalCrash] = useState<{ message: string; source: string } | null>(null);

  const isAdminRoute = location.pathname.startsWith('/admin');
  const HIDE_NAV = false;

  const hideNav = HIDE_NAV;
  const hideTopHeader = isAdminRoute;

  const [navHidden, setNavHidden] = useState(false);
  const navHiddenRef = useRef(false);

  useEffect(() => {
    const scrollEl = document.querySelector('.eg-content-scroll') as HTMLElement | null;
    if (!scrollEl) return;

    let lastScrollTop = scrollEl.scrollTop;
    let ticking = false;
    let lastActionTime = performance.now();

    const onScroll = () => {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        const current = scrollEl.scrollTop;
        const delta = current - lastScrollTop;
        const hideThreshold = 32;
        const showThreshold = 16;
        const atTop = current < 64;
        const now = performance.now();

        // Avoid rapid hide/show toggles
        if (now - lastActionTime < 120) {
          lastScrollTop = current;
          ticking = false;
          return;
        }

        // Show when near the top or when scrolling up significantly
        if ((atTop || delta < -showThreshold) && navHiddenRef.current) {
          navHiddenRef.current = false;
          setNavHidden(false);
          lastActionTime = now;
        }

        // Hide when scrolling down past threshold (and not at the top)
        if (current >= 64 && delta > hideThreshold && !navHiddenRef.current) {
          navHiddenRef.current = true;
          setNavHidden(true);
          lastActionTime = now;
        }

        lastScrollTop = current;
        ticking = false;
      });
    };

    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setGlobalCrash(null);
  }, [location.pathname]);

  useEffect(() => {
    // Reset nav visibility when navigating between pages
    navHiddenRef.current = false;
    setNavHidden(false);
  }, [location.pathname]);

  useEffect(() => {
    const onGlobalCrash = (event: Event) => {
      const custom = event as CustomEvent<CrashDetail>;
      const message = toCrashMessage(custom.detail?.message);

      // Ignore a noisy browser-lock error that can happen when the tab is backgrounded
      // or when multiple tabs race the same storage lock. It should not hard-crash the UI.
      if (message.toLowerCase().includes("lock broken by another request") && message.toLowerCase().includes("steal")) {
        return;
      }

      const source = toCrashMessage(custom.detail?.source || 'runtime');
      setGlobalCrash({ message, source });
    };

    window.addEventListener(GLOBAL_CRASH_EVENT, onGlobalCrash as EventListener);
    return () => {
      window.removeEventListener(GLOBAL_CRASH_EVENT, onGlobalCrash as EventListener);
    };
  }, []);

  return (
    <>
      {!hideTopHeader ? <TopHeader /> : null}

      <main className="eg-content-scroll" role="main">
        {globalCrash ? (
          <PageCrashFallback
            title="Something went wrong"
            message="A runtime error occurred. You can reload now."
            details={`${globalCrash.source}: ${globalCrash.message}`}
          />
        ) : (
          <ErrorBoundary
            key={location.pathname}
            onError={(error, info) => {
              if (import.meta.env.DEV) {
                console.error('[EG CRASH] Route render error', error, info?.componentStack || '');
              }
            }}
            fallback={({ error }) => (
              <PageCrashFallback
                title="Something went wrong"
                message="This page crashed while rendering."
                details={error?.stack || error?.message || 'Unknown render error'}
              />
            )}
          >
            <Suspense fallback={<div className="eg-app-loading">Loading…</div>}>
              <Routes>
                <Route path="/" element={<HomeRouteSafe />} />
                <Route path="/preseason" element={<PreseasonPage />} />
                <Route path="/preseason-registration" element={<PreseasonRegistrationPage />} />
                <Route path="/preseason/register" element={<Navigate to="/preseason-registration" replace />} />

                <Route path="/fixtures" element={<AFL26FixturesPage />} />
                <Route path="/ladder" element={<LadderPage />} />
                <Route path="/best-team" element={<BestTeamPage />} />

                <Route path="/stats3" element={<AFL2026StatsPage />} />
                <Route path="/stats3/leaders" element={<StatLeadersPage />} />
                <Route path="/stats3/compare" element={<HeadToHeadPage />} />
                <Route path="/player/:playerId" element={<PlayerProfilePage />} />
                <Route path="/teams" element={<TeamsPage />} />
                <Route path="/teams/:teamId" element={<TeamProfilePage />} />

                <Route path="/stats" element={<Navigate to="/stats3" replace />} />
                <Route path="/stats/leaders" element={<Navigate to="/stats3/leaders" replace />} />

                <Route
                  path="/submit"
                  element={
                    <ProtectedRoute>
                      <SubmitPage />
                    </ProtectedRoute>
                  }
                />

                <Route path="/auth/sign-in" element={<SignInPage />} />
                <Route path="/auth/sign-up" element={<SignUpPage />} />
                <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/auth/callback" element={<AuthCallbackPage />} />
                <Route path="/sign-in" element={<Navigate to="/auth/sign-in" replace />} />
                <Route path="/signin" element={<Navigate to="/auth/sign-in" replace />} />
                <Route path="/login" element={<Navigate to="/auth/sign-in" replace />} />
                <Route path="/create-account" element={<Navigate to="/auth/sign-up" replace />} />
                <Route path="/register" element={<Navigate to="/auth/sign-up" replace />} />
                <Route path="/auth/confirm" element={<Navigate to="/auth/callback" replace />} />

                <Route
                  path="/members"
                  element={
                    <ProtectedRoute>
                      <MembersPage />
                    </ProtectedRoute>
                  }
                />
                <Route path="/profile" element={<Navigate to="/members" replace />} />

                <Route path="/pro-team" element={<ComingSoonPage />} />
                <Route path="/admin" element={<AdminGate><AdminLayout /></AdminGate>}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="seasons" element={<AdminSeasons />} />
                  <Route path="teams" element={<AdminTeams />} />
                  <Route path="players" element={<AdminPlayers />} />
                  <Route path="fixtures" element={<AdminFixtures />} />
                  <Route path="fixtures/:fixtureId" element={<AdminFixtureDetail />} />
                  <Route path="rebuild" element={<AdminRebuild />} />
                  <Route path="coaches" element={<AdminCoaches />} />
                  <Route path="submissions" element={<AdminSubmissions />} />
                  <Route path="content" element={<AdminContent />} />
                  <Route path="news" element={<AdminNews />} />
                  <Route path="flags" element={<AdminFlags />} />
                  <Route path="assets" element={<AdminAssets />} />
                  <Route path="audit" element={<AdminAudit />} />
                  <Route path="odds" element={<AdminOdds />} />
                  <Route path="best-team" element={<AdminBestTeam />} />
                  <Route path="console" element={<AdminConsolePage />} />
                  <Route path="preseason-seeding" element={<AdminConsolePage />} />
                </Route>

                <Route path="/match-centre" element={<MatchCentrePage />} />
                <Route path="/match-centre/:fixtureId" element={<MatchCentrePage />} />

                <Route path="/coming-soon" element={<ComingSoonPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        )}
      </main>

      {!hideNav ? <BottomNav hidden={navHidden} /> : null}
    </>
  );
}

function AppShell() {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');

  return (
    <div className="eg-viewport">
      <div className={`eg-device${isAdminRoute ? ' eg-device--admin' : ''}`} role="application" aria-label="Elite Gaming App">
        <QueryClientProvider client={queryClient}>
          <AppRoutes />
        </QueryClientProvider>
      </div>
    </div>
  );
}


export default function App() {
  return (
    <>
      <AppShell />
      <SpeedInsights />
    </>
  );
}
