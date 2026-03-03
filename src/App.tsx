import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ComingSoonPage from './pages/ComingSoonPage';
import MatchCentrePage from './pages/MatchCentrePage';
import MembersPage from './pages/MembersPage';

import SignInPage from './pages/auth/SignInPage';
import SignUpPage from './pages/auth/SignUpPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';

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
      staleTime: 45_000,
      gcTime: 1_200_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const HomePage = lazy(() => import('./pages/HomePage'));
const AFL26FixturesPage = lazy(() => import('./pages/AFL26FixturesPage'));
const LadderPage = lazy(() => import('./pages/LadderPage'));
const SubmitPage = lazy(() => import('./pages/SubmitPage'));
const AFL2026StatsPage = lazy(() => import('./pages/AFL2026StatsPage'));
const PlayerProfilePage = lazy(() => import('./pages/PlayerProfilePage'));
const PreseasonPage = lazy(() => import('./pages/PreseasonPage'));
const PreseasonRegistrationPage = lazy(() => import('./pages/PreseasonRegistrationPage'));
const AdminConsolePage = lazy(() => import('./pages/AdminConsolePage'));

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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [navAutoHidden, setNavAutoHidden] = useState(false);
  const [globalCrash, setGlobalCrash] = useState<{ message: string; source: string } | null>(null);

  const isAdminRoute = location.pathname.startsWith('/admin');

  const hideNav = location.pathname.startsWith('/auth/sign-in') || location.pathname.startsWith('/auth/sign-up') || isAdminRoute;
  const hideTopHeader = isAdminRoute;

  useEffect(() => {
    setNavAutoHidden(false);
    setGlobalCrash(null);
  }, [location.pathname]);

  useEffect(() => {
    const onGlobalCrash = (event: Event) => {
      const custom = event as CustomEvent<CrashDetail>;
      const message = toCrashMessage(custom.detail?.message);
      const source = toCrashMessage(custom.detail?.source || 'runtime');
      setGlobalCrash({ message, source });
    };

    window.addEventListener(GLOBAL_CRASH_EVENT, onGlobalCrash as EventListener);
    return () => {
      window.removeEventListener(GLOBAL_CRASH_EVENT, onGlobalCrash as EventListener);
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let lastScrollTop = el.scrollTop;
    let downDistance = 0;
    let upDistance = 0;
    let ticking = false;

    const HIDE_THRESHOLD = 20;
    const SHOW_THRESHOLD = 10;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;

      window.requestAnimationFrame(() => {
        const currentTop = el.scrollTop;

        if (currentTop <= 0) {
          downDistance = 0;
          upDistance = 0;
          lastScrollTop = 0;
          setNavAutoHidden(false);
          ticking = false;
          return;
        }

        const delta = currentTop - lastScrollTop;

        if (Math.abs(delta) < 1) {
          ticking = false;
          return;
        }

        if (delta > 0) {
          downDistance += delta;
          upDistance = 0;
          if (downDistance >= HIDE_THRESHOLD) setNavAutoHidden(true);
        } else {
          upDistance += Math.abs(delta);
          downDistance = 0;
          if (upDistance >= SHOW_THRESHOLD) setNavAutoHidden(false);
        }

        lastScrollTop = currentTop;
        ticking = false;
      });
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <>
      {!hideTopHeader ? <TopHeader /> : null}

      <main ref={scrollRef} className="eg-content-scroll" role="main">
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

                <Route path="/stats3" element={<AFL2026StatsPage />} />
                <Route path="/stats3/leaders" element={<StatLeadersPage />} />
                <Route path="/stats3/compare" element={<ComingSoonPage />} />
                <Route path="/player/:playerId" element={<PlayerProfilePage />} />

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

                <Route
                  path="/members"
                  element={
                    <ProtectedRoute>
                      <MembersPage />
                    </ProtectedRoute>
                  }
                />

                <Route path="/pro-team" element={<ComingSoonPage />} />
                <Route path="/admin" element={<AdminConsolePage />} />

                <Route path="/match-centre" element={<MatchCentrePage />} />
                <Route path="/match-centre/:fixtureId" element={<MatchCentrePage />} />

                <Route path="/coming-soon" element={<ComingSoonPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        )}
      </main>

      {!hideNav ? <BottomNav hidden={navAutoHidden} /> : null}
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
  return <AppShell />;
}
