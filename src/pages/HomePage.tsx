import { CalendarClock, Megaphone, ShieldCheck, Trophy, Zap } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../state/auth/AuthProvider';
import '../styles/home.css';

const FORMAT_NOTE = 'Format: 2 home-and-away matches, followed by knockout finals.';
const AFL26_LOGO_URL = 'https://zohtixrgskbzosgfluni.supabase.co/storage/v1/object/public/Assets/afl26-logo.png';

function firstName(value?: string | null, email?: string | null) {
  const name = String(value || '').trim();
  if (name) return name.split(/\s+/)[0] || 'Coach';
  return String(email || '').trim().split('@')[0] || 'Coach';
}

function HomeSectionHeader({
  icon,
  title,
  actionText,
}: {
  icon: React.ReactNode;
  title: string;
  actionText?: string;
}) {
  return (
    <header className="homeSectionHead">
      <div className="homeSectionHead__left">
        <span className="homeSectionHead__icon" aria-hidden="true">
          {icon}
        </span>
        <h2>{title}</h2>
      </div>
      {actionText ? <span className="homeSectionHead__meta">{actionText}</span> : null}
    </header>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const coachFirstName = useMemo(() => firstName(user?.firstName || user?.displayName, user?.email), [user?.displayName, user?.email, user?.firstName]);
  const primaryLabel = user ? 'Open registration' : 'Register for preseason';
  const secondaryLabel = user ? 'Update preferences' : 'Sign in';
  const statusLine = user
    ? `Signed in as ${coachFirstName}. Continue to confirm your club order.`
    : 'Create your account, choose your clubs, and lock in your entry today.';

  return (
    <div className="homePage">
      <div className="homeShell">
        <section className="homeHeroIntro" aria-label="Launch intro">
          <div className="homeHeroIntro__copy">
            <div className="homeDashLabel">Elite Gaming</div>
            <h1 className="homeHeroIntro__title">AFL 26 Preseason Knockout</h1>
            <p className="homeHeroIntro__sub">The public microsite for coach registration, club preferences, and preseason launch updates.</p>
          </div>
        </section>

        <section className="homeHeroCard" aria-label="AFL 26 preseason registration">
          <div className="homeHeroCard__content">
            <div className="homeHeroCard__topline">
              <span className="homeHeroCard__kicker">
                <Zap size={14} /> Coach registration
              </span>
              <img className="homeHeroCard__heroLogo" src={AFL26_LOGO_URL} alt="AFL 26" loading="lazy" />
            </div>

            <div className="homeHeroCard__copy">
              <h2>Lock in your club order for AFL 26.</h2>
              <p>Choose up to four preferred clubs, confirm your entry, and keep everything inside one clean public microsite.</p>
            </div>

            <div className="homeHeroCard__actions">
              <button type="button" className="homeHeroCard__cta" onClick={() => navigate('/preseason-registration')}>
                {primaryLabel}
              </button>
              <button
                type="button"
                className="homeHeroCard__ctaSecondary"
                onClick={() => navigate(user ? '/preseason-registration' : '/auth/sign-in')}
              >
                {secondaryLabel}
              </button>
            </div>

            <p className="homeHeroCard__note">{statusLine}</p>

            <div className="homeHeroMeta" aria-label="Launch info">
              <div className="homeHeroMeta__item">
                <span className="homeHeroMeta__label">
                  <ShieldCheck size={14} /> Status
                </span>
                <strong className="homeHeroMeta__value">Registrations live now</strong>
              </div>
              <div className="homeHeroMeta__item">
                <span className="homeHeroMeta__label">
                  <CalendarClock size={14} /> Entry window
                </span>
                <strong className="homeHeroMeta__value">Confirm your clubs today</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="homeCard homeCard--compact homeCard--quiet homeCoachesPanel" aria-label="Current coaches">
          <HomeSectionHeader icon={<ShieldCheck size={15} />} title="Current Coaches" actionText="Registration board" />
          <p className="homeCoachesPanel__text">Confirmed coaches and club allocations will appear here as registrations are processed.</p>
          <button type="button" className="homeCoachesPanel__cta" onClick={() => navigate('/preseason-registration')}>
            View registration
          </button>
        </section>

        <section className="homeCard homeCard--compact homeCard--quiet" aria-label="Competition notes">
          <HomeSectionHeader icon={<Megaphone size={15} />} title="Competition Notes" actionText="Launch notes" />
          <div className="homeAnnouncements">
            <article className="homeAnnouncementItem">
              <h3>Competition format</h3>
              <p>{FORMAT_NOTE}</p>
            </article>
            <article className="homeAnnouncementItem">
              <h3>Registration flow</h3>
              <p>Create your account, sign in, choose up to four clubs, and confirm one final preseason entry.</p>
            </article>
          </div>
        </section>

        <section className="homeCard homeCard--compact homeCard--quiet" aria-label="League leaders">
          <HomeSectionHeader icon={<Trophy size={15} />} title="League Leaders" actionText="Opens after round one" />
          <div className="homePendingState">
            <p className="homePendingState__title">Leaders will appear once preseason begins.</p>
            <p className="homePendingState__sub">Goals, disposals, and headline performers will populate here after the opening matches.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
