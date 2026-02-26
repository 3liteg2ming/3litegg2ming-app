import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, ChevronRight, Sparkles, Trophy, X } from 'lucide-react';

import { assetUrl } from '@/lib/teamAssets';

import '../styles/welcomeSplash.css';

const STORAGE_KEY = 'eg-afl26-welcome-last-seen-v2';
const COOLDOWN_MS = 12 * 60 * 60 * 1000;

type TournamentCard = {
  title: string;
  subtitle: string;
  badge: string;
  accent: 'gold' | 'green' | 'blue';
  href: string;
  cta: string;
};

const UPCOMING: TournamentCard[] = [
  {
    title: 'Knockout Preseason Cup',
    subtitle: '10 teams • Knockout format • Fast chaos',
    badge: 'Registration Open',
    accent: 'green',
    href: '/preseason',
    cta: 'Register now',
  },
  {
    title: 'AFL 26 Season Two',
    subtitle: 'Coach fixtures • ladder • stats • match centre',
    badge: 'Coming Soon',
    accent: 'gold',
    href: '/fixtures',
    cta: 'View fixtures',
  },
  {
    title: 'Live Match Centre Nights',
    subtitle: 'Score updates, leaders, team stats and momentum',
    badge: 'Featured',
    accent: 'blue',
    href: '/match-centre',
    cta: 'Open match centre',
  },
];

function shouldShowNow(pathname: string) {
  if (
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/submit') ||
    pathname.startsWith('/admin/')
  ) {
    return false;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const ts = raw ? Number(raw) : 0;
    if (Number.isFinite(ts) && ts > 0 && Date.now() - ts < COOLDOWN_MS) return false;
  } catch {
    // ignore storage issues, show once
  }
  return true;
}

export default function WelcomeSplash() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    setOpen(shouldShowNow(location.pathname));
  }, [location.pathname, mounted]);

  useEffect(() => {
    const cls = 'egWelcomeOpen';
    if (open) document.body.classList.add(cls);
    else document.body.classList.remove(cls);
    return () => {
      document.body.classList.remove(cls);
    };
  }, [open]);

  const canShow = useMemo(
    () =>
      !location.pathname.startsWith('/auth/') &&
      !location.pathname.startsWith('/submit') &&
      !location.pathname.startsWith('/admin/'),
    [location.pathname]
  );

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setOpen(false);
  };

  const go = (href: string) => {
    dismiss();
    navigate(href);
  };

  if (!canShow) return null;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="egWelcome"
          aria-modal="true"
          role="dialog"
          aria-label="Welcome to Elite Gaming AFL 26"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="egWelcome__backdrop"
            onClick={dismiss}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          <motion.div
            className="egWelcome__sheet"
            initial={{ opacity: 0, y: 22, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.985 }}
            transition={{ type: 'spring', stiffness: 290, damping: 26 }}
          >
            <div className="egWelcome__glow egWelcome__glow--gold" aria-hidden="true" />
            <div className="egWelcome__glow egWelcome__glow--green" aria-hidden="true" />
            <div className="egWelcome__scanline" aria-hidden="true" />
            <div className="egWelcome__sheetSweep" aria-hidden="true" />

            <button type="button" className="egWelcome__close" onClick={dismiss} aria-label="Close welcome">
              <X size={18} />
            </button>

            <motion.div
              className="egWelcome__brandWrap"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06, duration: 0.28 }}
            >
              <div className="egWelcome__brandBadge">
                <Sparkles size={14} />
                <span>AFL 26 Welcome</span>
              </div>
              <div className="egWelcome__brandLogoWrap">
                <div className="egWelcome__logoSweep" aria-hidden="true" />
                <img className="egWelcome__brandLogo" src={assetUrl('elite-gaming-logo.png')} alt="Elite Gaming" />
              </div>
            </motion.div>

            <motion.div
              className="egWelcome__hero"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12, duration: 0.3 }}
            >
              <div className="egWelcome__headline">Welcome to Elite Gaming AFL 26</div>
              <p className="egWelcome__subhead">
                Fixtures, ladder, stats and match centre built for comp nights. Jump straight into what&apos;s live and what&apos;s next.
              </p>
              <div className="egWelcome__heroActions">
                <button type="button" className="egWelcomeBtn egWelcomeBtn--primary" onClick={() => go('/fixtures')}>
                  Open Fixtures <ChevronRight size={16} />
                </button>
                <button type="button" className="egWelcomeBtn egWelcomeBtn--ghost" onClick={() => go('/stats3')}>
                  Stats Hub
                </button>
              </div>
            </motion.div>

            <section className="egWelcome__section">
              <div className="egWelcome__sectionHead">
                <span className="egWelcome__kicker">Upcoming Tournaments</span>
                <span className="egWelcome__kickerIcon">
                  <CalendarDays size={14} />
                </span>
              </div>

              <div className="egWelcome__cards">
                {UPCOMING.map((t, idx) => (
                  <motion.button
                    key={t.title}
                    type="button"
                    className={`egWelcomeCard is-${t.accent}`}
                    onClick={() => go(t.href)}
                    initial={{ opacity: 0, y: 10, scale: 0.99 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ delay: 0.18 + idx * 0.05, duration: 0.24 }}
                  >
                    <div className="egWelcomeCard__top">
                      <span className="egWelcomeCard__badge">{t.badge}</span>
                      <Trophy size={14} className="egWelcomeCard__icon" />
                    </div>
                    <div className="egWelcomeCard__title">{t.title}</div>
                    <div className="egWelcomeCard__sub">{t.subtitle}</div>
                    <div className="egWelcomeCard__cta">
                      {t.cta} <ChevronRight size={14} />
                    </div>
                  </motion.button>
                ))}
              </div>
            </section>

            <motion.div
              className="egWelcome__foot"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28, duration: 0.24 }}
            >
              <button type="button" className="egWelcomeBtn egWelcomeBtn--secondary" onClick={dismiss}>
                Enter App
              </button>
              <div className="egWelcome__footNote">Shown once every 12 hours</div>
            </motion.div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
