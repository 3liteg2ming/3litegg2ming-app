import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, User } from 'lucide-react';
import { assetUrl } from '../lib/teamAssets';
import { useAuth } from '@/state/auth/AuthProvider';
import { isUserAdmin } from '@/lib/profileRepo';
import {
  COMPETITIONS,
  type CompetitionKey,
  getDefaultCompetitionKey,
  getStoredCompetitionKey,
  isSelectable,
  setStoredCompetitionKey,
} from '../lib/competitionRegistry';

import '../styles/topHeader.css';

type HeaderCompetition = {
  key: CompetitionKey;
  label: string;
  status: 'OPEN' | 'COMING_SOON';
  logoSrc: string;
};

const HEADER_COMPETITIONS: HeaderCompetition[] = COMPETITIONS.map((c) => ({
  key: c.key,
  label: c.label,
  status: c.status,
  logoSrc: c.key === 'preseason' ? assetUrl('elite-gaming-logo.png') : assetUrl('afl26-logo.png'),
}));

export default function TopHeader() {
  const nav = useNavigate();
  const { user } = useAuth();

  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<CompetitionKey>(getDefaultCompetitionKey());
  const [isAdmin, setIsAdmin] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const activeComp = useMemo(
    () => HEADER_COMPETITIONS.find((c) => c.key === activeKey) || HEADER_COMPETITIONS[0],
    [activeKey],
  );

  useEffect(() => {
    setActiveKey(getStoredCompetitionKey());
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user?.id) {
        if (alive) setIsAdmin(false);
        return;
      }
      try {
        const admin = await isUserAdmin(user.id);
        if (alive) setIsAdmin(admin);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('[EG CRASH] TopHeader admin check failed', error);
        }
        if (alive) setIsAdmin(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user?.id]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!open) return;
      const el = wrapRef.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const goAuth = () => nav('/auth/sign-in');

  const selectCompetition = (key: CompetitionKey) => {
    if (!isSelectable(key)) return;
    const stored = setStoredCompetitionKey(key);
    setActiveKey(stored);
    setOpen(false);
    nav('/');
  };

  return (
    <header className="egTopHeader" role="banner">
      <div className="egTopHeader__inner">
        <div className="egTopHeader__left" ref={wrapRef}>
          <button
            type="button"
            className={`egTopHeader__switch ${activeKey === 'preseason' ? 'egTopHeader__switch--preseason' : ''}`}
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="Switch competition"
          >
            <span className="egTopHeader__switchIcon" aria-hidden="true">
              <img className="egTopHeader__switchLogo" src={activeComp.logoSrc} alt="" loading="eager" />
            </span>
            <ChevronDown size={18} className="egTopHeader__chev" />
          </button>

          <AnimatePresence>
            {open ? (
              <motion.div
                className="egTopHeader__menu"
                role="menu"
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.16 }}
              >
                {HEADER_COMPETITIONS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    role="menuitem"
                    className={`egTopHeader__menuItem ${c.key === 'preseason' ? 'egTopHeader__menuItem--preseason' : ''} ${c.key === activeComp.key ? 'isActive' : ''}`}
                    onClick={() => selectCompetition(c.key)}
                    disabled={!isSelectable(c.key)}
                    aria-disabled={!isSelectable(c.key)}
                  >
                    <span className="egTopHeader__menuItemIcon" aria-hidden="true">
                      <img className="egTopHeader__menuLogo" src={c.logoSrc} alt="" loading="lazy" />
                    </span>
                    <span className="egTopHeader__menuText">
                      <span className="egTopHeader__menuTitle">{c.label}</span>
                      <span className="egTopHeader__menuSub">
                        {c.key === 'afl26' && c.status === 'COMING_SOON'
                          ? 'Season Two • Coming Soon'
                          : c.status === 'COMING_SOON'
                            ? 'Coming Soon'
                            : 'Season hub'}
                      </span>
                    </span>
                  </button>
                ))}
                {isAdmin ? (
                  <button
                    type="button"
                    role="menuitem"
                    className="egTopHeader__menuItem"
                    onClick={() => {
                      setOpen(false);
                      nav('/admin/create-fixture');
                    }}
                  >
                    <span className="egTopHeader__menuItemIcon" aria-hidden="true">
                      <img className="egTopHeader__menuLogo" src={assetUrl('elite-gaming-logo.png')} alt="" loading="lazy" />
                    </span>
                    <span className="egTopHeader__menuText">
                      <span className="egTopHeader__menuTitle">Admin</span>
                      <span className="egTopHeader__menuSub">Create Fixture</span>
                    </span>
                  </button>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <div className="egTopHeader__center" aria-label="Elite Gaming">
          <button type="button" className="egTopHeader__brand" onClick={() => nav('/')} aria-label="Go to home">
            <span className="egTopHeader__brandCrop" aria-hidden="true">
              <img
                className="egTopHeader__brandLogo egTopHeader__brandLogo--cropped"
                src={assetUrl('elite-gaming-logo.png')}
                alt="Elite Gaming"
                loading="eager"
              />
            </span>
          </button>
        </div>

        <div className="egTopHeader__right">
          <button type="button" className="egTopHeader__avatar" onClick={goAuth} aria-label="Account">
            <User size={22} />
          </button>
        </div>
      </div>
    </header>
  );
}
