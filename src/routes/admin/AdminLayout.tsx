import { Link, NavLink, Outlet, useLocation, useOutletContext } from 'react-router-dom';
import { useMemo, useState } from 'react';
import '@/styles/admin.css';

type ToastType = 'success' | 'error' | 'info';

type AdminToast = {
  id: number;
  type: ToastType;
  message: string;
};

export type AdminLayoutContext = {
  globalSearch: string;
  setGlobalSearch: (value: string) => void;
  pushToast: (message: string, type?: ToastType) => void;
};

const links = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/seasons', label: 'Seasons & Competitions' },
  { to: '/admin/preseason-seeding', label: 'Preseason Seeding' },
  { to: '/admin/teams', label: 'Teams' },
  { to: '/admin/players', label: 'Players' },
  { to: '/admin/fixtures', label: 'Fixtures & Results' },
  { to: '/admin/rebuild', label: 'Rebuild Tools' },
  { to: '/admin/coaches', label: 'Coaches & Roles' },
  { to: '/admin/submissions', label: 'Submissions / OCR' },
  { to: '/admin/content', label: 'Content' },
  { to: '/admin/flags', label: 'Feature Flags' },
  { to: '/admin/assets', label: 'Assets Browser' },
  { to: '/admin/audit', label: 'Audit Log' },
];

export function useAdminLayoutContext() {
  return useOutletContext<AdminLayoutContext>();
}

export default function AdminLayout() {
  const location = useLocation();
  const [globalSearch, setGlobalSearch] = useState('');
  const [toasts, setToasts] = useState<AdminToast[]>([]);

  const title = useMemo(() => {
    const match = links.find((l) => (l.end ? location.pathname === l.to : location.pathname.startsWith(l.to)));
    return match?.label || 'Admin Console';
  }, [location.pathname]);

  const pushToast = (message: string, type: ToastType = 'info') => {
    const id = Date.now() + Math.floor(Math.random() * 10_000);
    setToasts((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3200);
  };

  return (
    <div className="eg-admin-shell">
      <aside className="eg-admin-sidebar">
        <div className="eg-admin-sidebar-brand">
          <div className="eg-admin-dot" />
          <div>
            <h1>Elite Gaming</h1>
            <p>Admin Console</p>
          </div>
        </div>

        <nav className="eg-admin-sidebar-nav" aria-label="Admin sections">
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
          <div>
            <h2>{title}</h2>
            <p>Secure, audited admin operations</p>
          </div>

          <label className="eg-admin-search-wrap">
            <span>Quick Search</span>
            <input
              value={globalSearch}
              onChange={(event) => setGlobalSearch(event.target.value)}
              placeholder="Search IDs, names, and keys"
            />
          </label>
        </header>

        <div className="eg-admin-content">
          <Outlet
            context={{
              globalSearch,
              setGlobalSearch,
              pushToast,
            }}
          />
        </div>
      </section>

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
