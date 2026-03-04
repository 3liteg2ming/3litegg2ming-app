import { Zap } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../state/auth/AuthProvider';
import '../styles/home.css';

function text(value: unknown): string {
  return String(value || '').trim();
}

export default function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const ctaTarget = user ? '/preseason-registration' : '/auth/sign-in';
  const comingSoonCtaLabel = user ? 'Register for Preseason' : 'Create account / Sign in';
  const comingSoonCtaTarget = user ? '/preseason-registration' : '/auth/sign-up';
  const signedAs = useMemo(
    () => text(user?.displayName) || text(user?.email).split('@')[0] || 'Guest',
    [user?.displayName, user?.email],
  );

  return (
    <div className="homePage">
      <div className="homeShell">
        <section className="homeHero">
          <div className="homeHero__bolt" aria-hidden="true" />
          <div className="homeHero__chip">
            <Zap size={14} /> KNOCKOUT PRESEASON
          </div>
          <h1 className="homeHero__title">Knockout Preseason</h1>
          <p className="homeHero__subtitle">Two rounds. Top 8 finals. One champion.</p>
          <p className="homeHero__subtext">Elite Gaming Preseason 2026</p>
          <p className="homeHero__signed">Signed in as {signedAs}</p>
          <button type="button" className="homeHero__cta" onClick={() => navigate(ctaTarget)}>
            Register
          </button>
        </section>

        <section className="homeFeatureSection" aria-label="Platform features">
          <article className="homeFeaturePanel">
            <header className="homeFeaturePanel__header">
              <h2>Designed For Serious Coaches</h2>
            </header>

            <div className="homeFeatureList">
              <div className="homeFeatureItem">
                <strong>Live Match Centre</strong>
                <small>Full team and player stats. Updated instantly.</small>
              </div>

              <div className="homeFeatureItem">
                <strong>Automated Ladder</strong>
                <small>Results update standings automatically.</small>
              </div>

              <div className="homeFeatureItem">
                <strong>Smart Submissions</strong>
                <small>Upload once. Fixtures, stats and ladder sync.</small>
              </div>
            </div>
          </article>
        </section>

        <section className="homeComingSoon" aria-label="Season two status">
          <div className="homeComingSoon__chip">AFL26 SEASON TWO</div>
          <h3 className="homeComingSoon__title">AFL26 Season Two — coming soon</h3>
          <div className="homeComingSoon__copy">
            <p>We&apos;re waiting on the official 2026 roster update.</p>
            <p>Once updated, fixtures + stats leaders will unlock for Season Two.</p>
            <p>Preseason registrations are open now.</p>
          </div>
          <button type="button" className="homeComingSoon__cta" onClick={() => navigate(comingSoonCtaTarget)}>
            {comingSoonCtaLabel}
          </button>
        </section>
      </div>
    </div>
  );
}
