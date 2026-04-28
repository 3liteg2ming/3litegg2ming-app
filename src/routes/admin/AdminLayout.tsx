import { Link, NavLink, Outlet, useLocation, useOutletContext } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { getAdminToken } from './AdminGate';
import { exchangeAdminPasscode, pingAdminSession, startSuperadminAutoSession } from '@/lib/adminConsoleRepo';
import '@/styles/admin.css';

type ToastType = 'success' | 'error' | 'info';

const ADMIN_TOKEN_KEY = 'eg_admin_token';
const ADMIN_TOKEN_EXPIRES_AT_KEY = 'eg_admin_token_expires_at';

type AdminToast = {
  id: number;
  type: ToastType;
  message: string;
};

export type AdminLayoutContext = {
  globalSearch: string;
  setGlobalSearch: (value: string) => void;
  pushToast: (message: string, type?: ToastType) => void;
  adminToken: () => string;
};

const links = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/seasons', label: 'Seasons & Competitions' },
  { to: '/admin/preseason-seeding', label: 'Preseason Seeding' },
  { to: '/admin/teams', label: 'Teams' },
  { to: '/admin/players', label: 'Players' },
  { to: '/admin/fixtures', label: 'Fixtures & Results' },
  { to: '/admin/rebuild', label: 'Rebuild Tools' },
  { to: '/admin/best-team', label: 'Best 23 Team' },
  { to: '/admin/coaches', label: 'Coaches & Roles' },
  { to: '/admin/submissions', label: 'Submissions / OCR' },
  { to: '/admin/content', label: 'Content' },
  { to: '/admin/news', label: 'Homepage News' },
  { to: '/admin/flags', label: 'Feature Flags' },
  { to: '/admin/assets', label: 'Assets Browser' },
  { to: '/admin/audit', label: 'Audit Log' },
  { to: '/admin/odds', label: 'Melvin Bet Odds' },
];

export function useAdminLayoutContext() {
  return useOutletContext<AdminLayoutContext>();
}

export default function AdminLayout() {
  const location = useLocation();
  const [globalSearch, setGlobalSearch] = useState('');
  const [toasts, setToasts] = useState<AdminToast[]>([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [adminPasscode, setAdminPasscode] = useState('');
  const [adminUnlockError, setAdminUnlockError] = useState('');
  const [adminUnlocking, setAdminUnlocking] = useState(false);
  const [adminWriteChecking, setAdminWriteChecking] = useState(true);
  const [adminWriteToken, setAdminWriteToken] = useState('');
  const [adminWriteExpiresAt, setAdminWriteExpiresAt] = useState<number | null>(null);

  const title = useMemo(() => {
    const match = links.find((l) => (l.end ? location.pathname === l.to : location.pathname.startsWith(l.to)));
    return match?.label || 'Admin Console';
  }, [location.pathname]);

  const pushToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 10_000);
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3200);
  }, []);

  const clearAdminWriteSession = useCallback((message?: string, type: ToastType = 'info') => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(ADMIN_TOKEN_KEY);
      window.localStorage.removeItem(ADMIN_TOKEN_EXPIRES_AT_KEY);
    }
    setAdminPasscode('');
    setAdminUnlockError('');
    setAdminWriteToken('');
    setAdminWriteExpiresAt(null);
    setAdminWriteChecking(false);
    if (message) pushToast(message, type);
  }, [pushToast]);

  const applyAdminWriteSession = useCallback((token: string, expiresAt?: number | null) => {
    const safeToken = String(token || '').trim();
    if (!safeToken) return;

    const safeExpiresAt =
      typeof expiresAt === 'number' && Number.isFinite(expiresAt) && expiresAt > Date.now()
        ? expiresAt
        : Date.now() + 60 * 60 * 1000;

    window.localStorage.setItem(ADMIN_TOKEN_KEY, safeToken);
    window.localStorage.setItem(ADMIN_TOKEN_EXPIRES_AT_KEY, String(safeExpiresAt));
    setAdminWriteToken(safeToken);
    setAdminWriteExpiresAt(safeExpiresAt);
    setAdminUnlockError('');
  }, []);

  const maybeStartSuperadminSession = useCallback(async () => {
    try {
      const { response } = await startSuperadminAutoSession();
      if (!response?.ok || !response.token) return false;

      const expiresAtFromServer = response.expires_at ? new Date(response.expires_at).getTime() : null;
      const expiresInSeconds = Number(response.expires_in || 14_400);
      const expiresAt =
        typeof expiresAtFromServer === 'number' &&
        Number.isFinite(expiresAtFromServer) &&
        expiresAtFromServer > Date.now()
          ? expiresAtFromServer
          : Date.now() + Math.max(60, expiresInSeconds) * 1000;

      applyAdminWriteSession(response.token, expiresAt);
      return true;
    } catch {
      return false;
    }
  }, [applyAdminWriteSession]);

  const adminWriteExpiryLabel = useMemo(() => {
    if (!adminWriteExpiresAt || !Number.isFinite(adminWriteExpiresAt)) return '';
    return new Date(adminWriteExpiresAt).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  }, [adminWriteExpiresAt]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let active = true;

    (async () => {
      const storedToken = getAdminToken();
      const storedExpiry = typeof window === 'undefined'
        ? 0
        : Number(window.localStorage.getItem(ADMIN_TOKEN_EXPIRES_AT_KEY) || '0');

      if (!storedToken) {
        const autoSessionStarted = await maybeStartSuperadminSession();
        if (!active) return;
        if (autoSessionStarted) {
          setAdminWriteChecking(false);
          return;
        }
        setAdminWriteChecking(false);
        setAdminWriteExpiresAt(Number.isFinite(storedExpiry) && storedExpiry > 0 ? storedExpiry : null);
        return;
      }

      const ping = await pingAdminSession(storedToken);
      if (!active) return;

      if (ping.ok) {
        setAdminWriteToken(storedToken);
        setAdminWriteExpiresAt(Number.isFinite(storedExpiry) && storedExpiry > 0 ? storedExpiry : null);
        setAdminUnlockError('');
      } else {
        const autoSessionStarted = await maybeStartSuperadminSession();
        if (autoSessionStarted) {
          if (!active) return;
          setAdminWriteChecking(false);
          return;
        }
        clearAdminWriteSession(
          'Admin write access expired. Enter the passcode again to keep saving manual results.',
          'error',
        );
      }

      setAdminWriteChecking(false);
    })();

    return () => {
      active = false;
    };
  }, [clearAdminWriteSession, maybeStartSuperadminSession]);

  useEffect(() => {
    if (!adminWriteToken) return;
    const expiryTimer = window.setInterval(() => {
      if (getAdminToken()) return;
      clearAdminWriteSession(
        'Admin write access expired. Enter the passcode again to keep saving manual results.',
        'error',
      );
    }, 30_000);
    return () => window.clearInterval(expiryTimer);
  }, [adminWriteToken, clearAdminWriteSession]);

  useEffect(() => {
    if (!adminWriteToken) return;
    const pingTimer = window.setInterval(async () => {
      const token = getAdminToken();
      if (!token) {
        clearAdminWriteSession(
          'Admin write access expired. Enter the passcode again to keep saving manual results.',
          'error',
        );
        return;
      }

      const ping = await pingAdminSession(token);
      if (!ping.ok) {
        clearAdminWriteSession(
          'Admin write access expired. Enter the passcode again to keep saving manual results.',
          'error',
        );
      }
    }, 60_000);
    return () => window.clearInterval(pingTimer);
  }, [adminWriteToken, clearAdminWriteSession]);

  async function unlockAdminWrite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdminUnlockError('');
    setAdminUnlocking(true);

    try {
      const { response } = await exchangeAdminPasscode(adminPasscode.trim());
      if (!response?.ok || !response.token) {
        setAdminUnlockError(String(response?.error || 'Invalid passcode.'));
        return;
      }

      const freshToken = String(response.token || '').trim();
      const ping = await pingAdminSession(freshToken);
      if (!ping.ok) {
        const autoSessionStarted = await maybeStartSuperadminSession();
        if (autoSessionStarted) {
          setAdminPasscode('');
          pushToast('Admin write access unlocked from your super admin account.', 'success');
          return;
        }
        setAdminUnlockError('Session token rejected by server. The database admin-session RPCs are out of sync.');
        return;
      }

      const expiresAtFromServer = response.expires_at ? new Date(response.expires_at).getTime() : null;
      const expiresInSeconds = Number(response.expires_in || 3600);
      const expiresAt =
        typeof expiresAtFromServer === 'number' &&
        Number.isFinite(expiresAtFromServer) &&
        expiresAtFromServer > Date.now()
          ? expiresAtFromServer
          : Date.now() + Math.max(60, expiresInSeconds) * 1000;

      applyAdminWriteSession(freshToken, expiresAt);
      setAdminPasscode('');
      pushToast('Admin write access unlocked. Manual result saves are ready.', 'success');
    } catch (error) {
      const message = String((error as { message?: string })?.message || 'Unable to unlock admin write access.');
      if (/eg_admin_exchange_passcode|does not exist/i.test(message)) {
        setAdminUnlockError('Admin passcode RPC is missing on this database.');
      } else if (/failed to fetch/i.test(message)) {
        setAdminUnlockError('Cannot reach Supabase right now. Try again in a moment.');
      } else {
        setAdminUnlockError(message);
      }
    } finally {
      setAdminUnlocking(false);
      setAdminWriteChecking(false);
    }
  }

  return (
    <div className="eg-admin-shell">
      <aside className={`eg-admin-sidebar${mobileNavOpen ? ' is-open' : ''}`}>
        <div className="eg-admin-sidebar-brand">
          <div className="eg-admin-dot" />
          <div>
            <h1>Elite Gaming</h1>
            <p>Admin Console</p>
          </div>
        </div>

        <nav id="eg-admin-sections" className="eg-admin-sidebar-nav" aria-label="Admin sections">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => (isActive ? 'is-active' : '')}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="eg-admin-sidebar-footer">
          <Link to="/">Back to App</Link>
        </div>
      </aside>

      <section className="eg-admin-main">
        <header className="eg-admin-topbar">
          <div className="eg-admin-topbar-main">
            <div className="eg-admin-topbar-copy">
              <span className="eg-admin-topbar-kicker">Launch Control Centre</span>
              <div>
                <h2>{title}</h2>
                <p>Secure, audited admin operations</p>
              </div>
            </div>

            <button
              type="button"
              className="eg-admin-mobile-nav-toggle"
              onClick={() => setMobileNavOpen((prev) => !prev)}
              aria-expanded={mobileNavOpen}
              aria-controls="eg-admin-sections"
            >
              {mobileNavOpen ? '\u2715 Close' : '\u2630 Sections'}
            </button>
          </div>

          <div className="eg-admin-topbar-tools">
            <section className="eg-admin-session-wrap" aria-label="Admin write access">
              <span className="eg-admin-session-label">Admin Write Access</span>

              {adminWriteChecking ? (
                <p className="eg-admin-muted" style={{ margin: 0 }}>
                  Checking saved passcode session…
                </p>
              ) : adminWriteToken ? (
                <div className="eg-admin-session-row">
                  <span className="eg-admin-session-pill is-unlocked">Unlocked</span>
                  <p className="eg-admin-muted" style={{ margin: 0, flex: '1 1 220px' }}>
                    {adminWriteExpiryLabel
                      ? `Manual result saves are ready until ${adminWriteExpiryLabel}.`
                      : 'Manual result saves are ready.'}
                  </p>
                  <button
                    type="button"
                    className="eg-admin-session-button"
                    onClick={() => clearAdminWriteSession('Admin write access locked.', 'info')}
                  >
                    Lock
                  </button>
                </div>
              ) : (
                <>
                  <form className="eg-admin-session-form" onSubmit={unlockAdminWrite}>
                    <input
                      type="password"
                      value={adminPasscode}
                      onChange={(event) => setAdminPasscode(event.target.value)}
                      placeholder="Enter admin passcode"
                      autoComplete="current-password"
                    />
                    <button type="submit" disabled={adminUnlocking || !adminPasscode.trim()}>
                      {adminUnlocking ? 'Unlocking...' : 'Unlock'}
                    </button>
                  </form>
                  <p className="eg-admin-muted" style={{ margin: 0 }}>
                    Use this once when you need to save manual wins or override results without going through
                    the submit flow.
                  </p>
                </>
              )}

              {adminUnlockError ? (
                <p className="eg-admin-error" style={{ margin: 0 }}>
                  {adminUnlockError}
                </p>
              ) : null}
            </section>

            <label className="eg-admin-search-wrap">
              <span>Quick Search</span>
              <input
                value={globalSearch}
                onChange={(event) => setGlobalSearch(event.target.value)}
                placeholder="Search IDs, names, and keys"
              />
            </label>
          </div>
        </header>

        <div className="eg-admin-content">
          <Outlet
            context={{
              globalSearch,
              setGlobalSearch,
              pushToast,
              adminToken: getAdminToken,
            }}
          />
        </div>
      </section>

      <button
        type="button"
        className={`eg-admin-sidebar-backdrop${mobileNavOpen ? ' is-visible' : ''}`}
        aria-label="Close admin navigation"
        onClick={() => setMobileNavOpen(false)}
      />

      <div className="eg-admin-toasts" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={`eg-admin-toast ${toast.type}`}>
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
