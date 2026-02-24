import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, User } from 'lucide-react';
import { assetUrl } from '../lib/teamAssets';

import '../styles/topHeader.css';

type CompKey = 'AFL26' | 'PROTEAM';

type Competition = {
  key: CompKey;
  label: string;
  logoSrc: string;
  basePath: string;
};

const COMPETITIONS: Competition[] = [
  { key: 'AFL26', label: 'AFL 26', logoSrc: assetUrl('afl26-logo.png'), basePath: '/' },
  { key: 'PROTEAM', label: 'Pro Team', logoSrc: assetUrl('proteam-logo.png'), basePath: '/pro-team' },
];

function inferCompetition(pathname: string): CompKey {
  if (pathname.startsWith('/pro-team')) return 'PROTEAM';
  return 'AFL26';
}

export default function TopHeader() {
  const nav = useNavigate();
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const activeKey = useMemo(() => inferCompetition(location.pathname), [location.pathname]);
  const activeComp = useMemo(
    () => COMPETITIONS.find((c) => c.key === activeKey) || COMPETITIONS[0],
    [activeKey]
  );

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

  const selectCompetition = (key: CompKey) => {
    const next = COMPETITIONS.find((c) => c.key === key);
    if (!next) return;
    setOpen(false);
    nav(next.basePath);
  };

  return (
    <header className="egTopHeader" role="banner">
      <div className="egTopHeader__inner">
        {/* LEFT */}
        <div className="egTopHeader__left" ref={wrapRef}>
          <button
            type="button"
            className="egTopHeader__switch"
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
                {COMPETITIONS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    role="menuitem"
                    className={`egTopHeader__menuItem ${c.key === activeComp.key ? 'isActive' : ''}`}
                    onClick={() => selectCompetition(c.key)}
                  >
                    <span className="egTopHeader__menuItemIcon" aria-hidden="true">
                      <img className="egTopHeader__menuLogo" src={c.logoSrc} alt="" loading="lazy" />
                    </span>
                    <span className="egTopHeader__menuText">
                      <span className="egTopHeader__menuTitle">{c.label}</span>
                      <span className="egTopHeader__menuSub">{c.key === 'AFL26' ? 'Season hub' : 'Pro division'}</span>
                    </span>
                  </button>
                ))}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        {/* CENTER: CROPPED + SCALED LOGO (fixes your padded PNG) */}
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

        {/* RIGHT */}
        <div className="egTopHeader__right">
          <button type="button" className="egTopHeader__avatar" onClick={goAuth} aria-label="Account">
            <User size={22} />
          </button>
        </div>
      </div>
    </header>
  );
}
