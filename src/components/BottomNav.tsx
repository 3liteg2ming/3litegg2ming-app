import React, { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { BarChart3, CalendarDays, Home, Trophy, Upload } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';

import { hasSupabaseEnv, requireSupabaseClient } from '../lib/supabaseClient';
import '../styles/bottomNav.css';

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
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!hasSupabaseEnv) {
      setSession(null);
      return;
    }

    let unsub: (() => void) | null = null;
    let alive = true;

    (async () => {
      const supabase = requireSupabaseClient();
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      setSession(data.session ?? null);

      const { data: sub } = supabase.auth.onAuthStateChange((_event: string, newSession: Session | null) => {
        setSession(newSession ?? null);
      });

      unsub = () => sub.subscription.unsubscribe();
    })();

    return () => {
      alive = false;
      if (unsub) unsub();
    };
  }, []);

  const isAuthed = !!session;

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
    <nav className={`egBottomNav ${hidden ? 'egBottomNav--hidden' : ''}`} role="navigation" aria-label="Bottom navigation">
      <div className="egBottomNav__bar" role="menubar" aria-label="Primary navigation">
        {NAV.map(({ label, href, Icon }) => (
          <NavLink
            key={href}
            to={href}
            end={href === '/'}
            className={({ isActive }) => `egBottomNav__item ${isActive ? 'egBottomNav__item--active' : ''}`}
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
            <Icon className="egBottomNav__icon" />
            <span className="egBottomNav__label">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
