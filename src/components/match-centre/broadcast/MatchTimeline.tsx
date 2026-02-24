import { useMemo } from 'react';
import { assetUrl, TEAM_ASSETS, type TeamKey } from '@/lib/teamAssets';
import SmartImg from '@/components/SmartImg';
import type { MatchCentreModel } from '@/lib/matchCentreRepo';
import '@/styles/match-centre-momentum.css';

function slugToTeamKey(slug: string): TeamKey | null {
  const s = String(slug || '').toLowerCase().trim();
  return (Object.keys(TEAM_ASSETS) as TeamKey[]).includes(s as TeamKey) ? (s as TeamKey) : null;
}

export default function MatchTimeline({ model, loading }: { model: MatchCentreModel | null; loading?: boolean }) {
  const home = model?.home;
  const away = model?.away;

  const homeKey = home ? slugToTeamKey(home.slug) : null;
  const awayKey = away ? slugToTeamKey(away.slug) : null;

  const homeLogo =
    home?.logoUrl ||
    (homeKey ? assetUrl(TEAM_ASSETS[homeKey].logoFile) : undefined);

  const awayLogo =
    away?.logoUrl ||
    (awayKey ? assetUrl(TEAM_ASSETS[awayKey].logoFile) : undefined);

  return (
    <section className="mcMomentum">
      <div className="mcMomentum__header">
        <h2 className="mcMomentum__title">Momentum Worm</h2>
        <p className="mcMomentum__desc">Score progression through quarters</p>
      </div>

      <div className="mcMomentum__card">
        {/* Quarter backgrounds */}
        <div className="mcMomentum__quarters">
          {['Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => (
            <div key={i} className="mcMomentum__quarter">
              <span className="mcMomentum__quarterLabel">{q}</span>
            </div>
          ))}
        </div>

        {/* Main worm chart area */}
        <div className="mcMomentum__chartContainer">
          {/* Team logos (left & right) */}
          <div className="mcMomentum__logoLeft">
            {homeLogo && (
              <SmartImg
                src={homeLogo}
                alt={home?.fullName || 'Home'}
                className="mcMomentum__logoImg"
                fallbackText={home?.abbreviation || 'H'}
              />
            )}
          </div>

          <div className="mcMomentum__worm">
            {/* Centre midline */}
            <div className="mcMomentum__midline" />

            {/* Placeholder message */}
            {loading || !model ? (
              <div className="mcMomentum__placeholder">
                <div className="mcMomentum__placeholderDot" />
              </div>
            ) : (
              <div className="mcMomentum__placeholder">
                <p className="mcMomentum__placeholderText">
                  {model?.statusLabel === 'FULL TIME'
                    ? 'Match finished'
                    : 'Quarter data coming'}
                </p>
              </div>
            )}
          </div>

          <div className="mcMomentum__logoRight">
            {awayLogo && (
              <SmartImg
                src={awayLogo}
                alt={away?.fullName || 'Away'}
                className="mcMomentum__logoImg"
                fallbackText={away?.abbreviation || 'A'}
              />
            )}
          </div>
        </div>

        {/* Team names below */}
        <div className="mcMomentum__legend">
          <div className="mcMomentum__legendTeam">
            <span className="mcMomentum__legendLabel">{home?.fullName || '—'}</span>
          </div>
          <div className="mcMomentum__legendTeam" style={{ textAlign: 'right' }}>
            <span className="mcMomentum__legendLabel">{away?.fullName || '—'}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
