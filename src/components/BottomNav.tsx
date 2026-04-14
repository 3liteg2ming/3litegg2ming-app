import React, { useEffect, useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { BarChart3, CalendarDays, Home, Trophy, Upload, Users } from 'lucide-react';
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
  { label: 'Teams', href: '/teams', Icon: Users },
  { label: 'Ladder', href: '/ladder', Icon: Trophy },
  { label: 'Stats', href: '/stats3', Icon: BarChart3 },
];

const NAV_SUBMIT: NavItem = { label: 'Submit', href: '/submit', Icon: Upload };

const routePrefetchers: Record<string, () => Promise<any>> = {
  '/': () => import('../pages/HomePage'),
  '/fixtures': () => import('../pages/AFL26FixturesPage'),
  '/ladder': () => import('../pages/LadderPage'),
  '/teams': () => import('../pages/TeamsPage'),
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
    <nav className={`egNav${hidden ? ' egNav--hidden' : ''}`} aria-hidden={hidden ? 'true' : undefined}>
      {NAV.map(({ label, href, Icon }) => (
        <NavLink
          key={href}
          to={href}
          end={href === '/'}
          className={({ isActive }) => `egNav__item${isActive ? ' egNav__item--active' : ''}${href === '/submit' ? ' egNav__item--submit' : ''}`}
          aria-label={label}
          onMouseEnter={() => void prefetchRouteAndData(href)}
          onFocus={() => void prefetchRouteAndData(href)}
          onTouchStart={() => void prefetchRouteAndData(href)}
        >
          <Icon className="egNav__icon" />
          <span className="egNav__label">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
