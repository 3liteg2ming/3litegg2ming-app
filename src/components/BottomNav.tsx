import React, { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { BarChart3, CalendarDays, Home, Trophy, Upload } from 'lucide-react';
import { createClient, type Session } from '@supabase/supabase-js';

import '../styles/bottomNav.css';

type NavItem = {
  label: string;
  href: string;
  Icon: React.ComponentType<{ className?: string }>;
};

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || (import.meta as any).env?.VITE_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey =
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.VITE_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const NAV_BASE: NavItem[] = [
  { label: 'Home', href: '/', Icon: Home },
  { label: 'Fixtures', href: '/fixtures', Icon: CalendarDays },
  { label: 'Ladder', href: '/ladder', Icon: Trophy },
  // Stats v3
  { label: 'Stats', href: '/stats3', Icon: BarChart3 },
];

const NAV_SUBMIT: NavItem = { label: 'Submit', href: '/submit', Icon: Upload };

export default function BottomNav() {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let unsub: (() => void) | null = null;

    (async () => {
      if (!supabase) return;

      const { data } = await supabase.auth.getSession();
      setSession(data.session ?? null);

      const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
        setSession(newSession ?? null);
      });

      unsub = () => sub.subscription.unsubscribe();
    })();

    return () => {
      if (unsub) unsub();
    };
  }, []);

  const isAuthed = !!session;

  const NAV: NavItem[] = useMemo(() => {
    // Only show Submit when logged in
    return isAuthed ? [...NAV_BASE, NAV_SUBMIT] : NAV_BASE;
  }, [isAuthed]);

  return (
    <nav className="egBottomNav" role="navigation" aria-label="Bottom navigation">
      <div className="egBottomNav__bar" role="menubar" aria-label="Primary navigation">
        {NAV.map(({ label, href, Icon }) => (
          <NavLink
            key={href}
            to={href}
            end={href === '/'}
            className={({ isActive }) => `egBottomNav__item ${isActive ? 'egBottomNav__item--active' : ''}`}
            aria-label={label}
            role="menuitem"
          >
            <Icon className="egBottomNav__icon" />
            <span className="egBottomNav__label">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
