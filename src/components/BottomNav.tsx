import React, { useEffect, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { BarChart3, CalendarDays, Home, Trophy, Upload } from 'lucide-react';
import { useAuth } from '../state/auth/AuthProvider';
import '../styles/bottomNavPremium.css';

type NavItem = {
  label: string;
  href: string;
  Icon: React.ComponentType<{ className?: string }>;
};

const NAV_BASE: NavItem[] = [
  { label: 'Home', href: '/', Icon: Home },
  { label: 'Fixtures', href: '/fixtures', Icon: CalendarDays },
  { label: 'Ladder', href: '/ladder', Icon: Trophy },
  { label: 'Stats', href: '/stats3', Icon: BarChart3 },
];

const NAV_SUBMIT: NavItem = { label: 'Submit', href: '/submit', Icon: Upload };

const routePrefetchers: Record<string, () => Promise<any>> = {
  '/': () => import('../pages/HomePage'),
  '/fixtures': () => import('../pages/AFL26FixturesPage'),
  '/ladder': () => import('../pages/LadderPage'),
  '/stats3': () => import('../pages/AFL2026StatsPage'),
  '/submit': () => import('../pages/SubmitPage'),
};

const warmedRoutes = new Set<string>();

async function prefetchRouteAndData(href: string) {
  if (warmedRoutes.has(href)) return;
  warmedRoutes.add(href);

  try {
    await routePrefetchers[href]?.();
  } catch {
    // ignore route prefetch failures
  }

  try {
    if (href === '/' || href === '/fixtures') {
      const mod = await import('../data/afl26Supabase');
      await mod.getAfl26RoundsFromSupabase();
    }

    if (href === '/stats3') {
      const leadersMod = await import('../lib/stats-leaders-cache');
      await Promise.all([leadersMod.fetchStatLeaders(), leadersMod.fetchLeaderCategories('players')]);
    }

    if (href === '/submit') {
      const rosterMod = await import('../data/aflPlayers');
      await rosterMod.fetchAflPlayers();
    }
  } catch {
    // ignore data prewarm failures
  }
}

export default function BottomNav({ hidden = false }: { hidden?: boolean }) {
  const { user } = useAuth();
  const isAuthed = !!user;

  const NAV: NavItem[] = useMemo(() => {
    return isAuthed ? [...NAV_BASE, NAV_SUBMIT] : NAV_BASE;
  }, [isAuthed]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void prefetchRouteAndData('/fixtures');
      void prefetchRouteAndData('/ladder');
      void prefetchRouteAndData('/stats3');
    }, 120);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className={`egNavDock${hidden ? ' egNavDock--hidden' : ''}`} aria-hidden={hidden ? 'true' : undefined}>
      <div className="egNavDock__glass">
        <div className="egNavDock__row">
          {NAV.map(({ label, href, Icon }) => (
            <NavLink
              key={href}
              to={href}
              end={href === '/'}
              className={({ isActive }) => `${isActive ? 'egNavDock__pill' : 'egNavDock__btn'}${href === '/submit' ? ' egNavDock__submit' : ''}`}
              aria-label={label}
              role="menuitem"
              onMouseEnter={() => {
                void prefetchRouteAndData(href);
              }}
              onFocus={() => {
                void prefetchRouteAndData(href);
              }}
              onTouchStart={() => {
                void prefetchRouteAndData(href);
              }}
            >
              {({ isActive }) => (
                <>
                  {isActive && <div className="egNavDock__pillIcon">
                    <Icon className="egNavDock__icon--active" />
                  </div>}
                  {!isActive && <Icon className="egNavDock__icon" />}
                  {isActive
                    ? <span className="egNavDock__pillText">{label}</span>
                    : <span className="egNavDock__btnLabel">{label}</span>
                  }
                </>
              )}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  );
}
