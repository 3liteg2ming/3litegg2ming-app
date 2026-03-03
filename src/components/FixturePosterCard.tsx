import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import SmartImg from './SmartImg';
import { assetUrl, TEAM_ASSETS, type TeamKey } from '../lib/teamAssets';
import '../styles/fixture-poster-card.css';

export type FixtureScore = { total: number; goals: number; behinds: number };

export type FixturePosterMatch = {
  id?: string;
  round?: number;
  venue?: string;
  dateText?: string;

  status: 'SCHEDULED' | 'LIVE' | 'FINAL';
  home: string;
  away: string;

  homePsn?: string;
  awayPsn?: string;

  homeCoachName?: string;
  awayCoachName?: string;
  homeCoachPsn?: string;
  awayCoachPsn?: string;

  homeScore?: FixtureScore;
  awayScore?: FixtureScore;
  headerTag?: string;

  onMatchCentreClick?: () => void;
};

function hexToRgb(hex: string) {
  const h = String(hex || '').replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return {
    r: Number.isFinite(r) ? r : 11,
    g: Number.isFinite(g) ? g : 58,
    b: Number.isFinite(b) ? b : 141,
  };
}

const TINT_OVERRIDES: Record<string, string> = {
  collingwood: '#C4A942',
  carlton: '#1E4ED8',
  brisbane: '#7A1933',
  sydney: '#C71F2D',
};

function pickTeamTint(key: string, asset: any): string {
  const k = String(key);
  if (TINT_OVERRIDES[k]) return TINT_OVERRIDES[k];
  const candidates: any[] = [asset?.primary, asset?.glow, asset?.accent, asset?.tint];
  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('#') && (c.length === 7 || c.length === 4)) return c;
  }
  return '#0B3A8D';
}

function statusText(status: FixturePosterMatch['status']) {
  if (status === 'FINAL') return 'FULL TIME';
  if (status === 'LIVE') return 'LIVE';
  return 'SCHEDULED';
}

function teamShort(asset: any) {
  const s = String(asset?.short || '').trim();
  if (s) return s.toUpperCase();
  const n = String(asset?.name || '').trim();
  return (n.slice(0, 3) || '—').toUpperCase();
}

function FixturePosterCardComponent({ m }: { m: FixturePosterMatch }) {
  const home = TEAM_ASSETS[m.home as TeamKey] || {
    name: 'TBC',
    shortName: 'TBC',
    colour: '#2a2f38',
    logoPath: '',
  };
  const away = TEAM_ASSETS[m.away as TeamKey] || {
    name: 'TBC',
    shortName: 'TBC',
    colour: '#2a2f38',
    logoPath: '',
  };

  const isUpcoming = m.status === 'SCHEDULED';

  const hasScores = !!m.homeScore && !!m.awayScore;
  const showScore = !isUpcoming && (m.status === 'LIVE' || m.status === 'FINAL') && hasScores;
  const compactScore =
    showScore && Math.max(Number(m.homeScore?.total || 0), Number(m.awayScore?.total || 0)) >= 100;

  const homeTint = pickTeamTint(m.home, home);
  const awayTint = pickTeamTint(m.away, away);

  const homeRgb = hexToRgb(homeTint);
  const awayRgb = hexToRgb(awayTint);

  const cssVars: React.CSSProperties = useMemo(
    () => ({
      ['--homeR' as any]: String(homeRgb.r),
      ['--homeG' as any]: String(homeRgb.g),
      ['--homeB' as any]: String(homeRgb.b),
      ['--awayR' as any]: String(awayRgb.r),
      ['--awayG' as any]: String(awayRgb.g),
      ['--awayB' as any]: String(awayRgb.b),
    }),
    [homeRgb, awayRgb],
  );

  const winner = useMemo(() => {
    if (!(m.status === 'FINAL' && showScore)) return '';
    const ht = Number(m.homeScore!.total);
    const at = Number(m.awayScore!.total);
    if (!Number.isFinite(ht) || !Number.isFinite(at)) return '';
    if (ht === at) return 'Draw';
    const winName = ht > at ? home.name : away.name;
    return `${winName} by ${Math.abs(ht - at)}`;
  }, [m.status, showScore, m.homeScore, m.awayScore, home.name, away.name]);

  const venueLine = useMemo(() => {
    const v = String(m.venue || '').trim();
    return v || 'TBA';
  }, [m.venue]);

  const dateLine = useMemo(() => {
    const v = String(m.dateText || '').trim();
    return v || 'Time TBA';
  }, [m.dateText]);

  const homeCoachName = String(m.homeCoachName || 'TBC').trim() || 'TBC';
  const awayCoachName = String(m.awayCoachName || 'TBC').trim() || 'TBC';
  const homeCoachNameIsTbc = homeCoachName.toUpperCase() === 'TBC';
  const awayCoachNameIsTbc = awayCoachName.toUpperCase() === 'TBC';

  const homeCoachPsn = String(m.homeCoachPsn || m.homePsn || '').trim();
  const awayCoachPsn = String(m.awayCoachPsn || m.awayPsn || '').trim();
  const homeCoachPsnText = homeCoachPsn || 'TBC';
  const awayCoachPsnText = awayCoachPsn || 'TBC';
  const homeCoachPsnIsTbc = !homeCoachPsn;
  const awayCoachPsnIsTbc = !awayCoachPsn;

  const psLogo = assetUrl('PlayStation-Logo.wine.png');
  const competitionLogo = assetUrl('afl26-logo.png');

  const homeWins = showScore ? Number(m.homeScore!.total) > Number(m.awayScore!.total) : false;
  const awayWins = showScore ? Number(m.awayScore!.total) > Number(m.homeScore!.total) : false;

  const statusClass = m.status === 'FINAL' ? 'final' : m.status === 'LIVE' ? 'live' : 'upcoming';
  const homeLogoSrc = home.logoFile || home.logoPath ? assetUrl(home.logoFile || home.logoPath || '') : '';
  const awayLogoSrc = away.logoFile || away.logoPath ? assetUrl(away.logoFile || away.logoPath || '') : '';

  return (
    <motion.section
      className={`fxPosterCard fxPosterCard--${statusClass} ${compactScore ? 'fxPosterCard--compactScore' : ''}`}
      style={cssVars}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      whileTap={{ scale: 0.997 }}
    >
      {m.headerTag ? (
        <div className="fxPosterCard__formatTag" aria-label={m.headerTag}>
          {m.headerTag}
        </div>
      ) : null}

      <div className="fxPosterCard__statusWrap" aria-hidden>
        <div className="fxPosterCard__statusPill">
          <span className="fxPosterCard__statusDot" />
          <span className="fxPosterCard__statusText">{statusText(m.status)}</span>
        </div>
      </div>

      {homeLogoSrc ? (
        <div className="fxPosterCard__watermark fxPosterCard__watermark--home" aria-hidden="true">
          <img
            src={homeLogoSrc}
            alt={`${home.name} watermark`}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            width={256}
            height={256}
          />
        </div>
      ) : null}
      {awayLogoSrc ? (
        <div className="fxPosterCard__watermark fxPosterCard__watermark--away" aria-hidden="true">
          <img
            src={awayLogoSrc}
            alt={`${away.name} watermark`}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            width={256}
            height={256}
          />
        </div>
      ) : null}

      {competitionLogo ? (
        <div className="fxPosterCard__compBadge" aria-hidden="true">
          <img
            src={competitionLogo}
            alt="AFL 26"
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            width={104}
            height={42}
          />
        </div>
      ) : null}

      <div className="fxPosterCard__main">
        <div className="fxPosterCard__side fxPosterCard__side--home">
          <div className="fxPosterCard__teamGlow" />
          <div className="fxPosterCard__teamBox">
            <SmartImg
              className="fxPosterCard__logo"
              src={homeLogoSrc}
              alt={home.name}
              fallbackText={teamShort(home)}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              width={72}
              height={72}
            />
          </div>
          <div className="fxPosterCard__abbr">{teamShort(home)}</div>
        </div>

        <div className="fxPosterCard__center">
          {isUpcoming ? (
            <div className="fxPosterCard__vsOnly">VS</div>
          ) : (
            <>
              <div className="fxPosterCard__scoreRow">
                <div
                  className={[
                    'fxPosterCard__score',
                    !showScore ? 'fxPosterCard__score--placeholder' : '',
                    showScore && m.status === 'FINAL' && !homeWins && awayWins ? 'fxPosterCard__score--dim' : '',
                  ].join(' ')}
                >
                  {showScore ? m.homeScore!.total : '—'}
                </div>

                <div className="fxPosterCard__dash">-</div>

                <div
                  className={[
                    'fxPosterCard__score',
                    !showScore ? 'fxPosterCard__score--placeholder' : '',
                    showScore && m.status === 'FINAL' && !awayWins && homeWins ? 'fxPosterCard__score--dim' : '',
                  ].join(' ')}
                >
                  {showScore ? m.awayScore!.total : '—'}
                </div>
              </div>

              <div className="fxPosterCard__minor">
                <div className={`fxPosterCard__minorVal ${!showScore ? 'fxPosterCard__minorVal--placeholder' : ''}`}>
                  {showScore ? `${m.homeScore!.goals}.${m.homeScore!.behinds}` : '—.—'}
                </div>
                <div className="fxPosterCard__minorDivider" />
                <div className={`fxPosterCard__minorVal ${!showScore ? 'fxPosterCard__minorVal--placeholder' : ''}`}>
                  {showScore ? `${m.awayScore!.goals}.${m.awayScore!.behinds}` : '—.—'}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="fxPosterCard__side fxPosterCard__side--away">
          <div className="fxPosterCard__teamGlow" />
          <div className="fxPosterCard__teamBox">
            <SmartImg
              className="fxPosterCard__logo"
              src={awayLogoSrc}
              alt={away.name}
              fallbackText={teamShort(away)}
              loading="lazy"
              decoding="async"
              fetchPriority="low"
              width={72}
              height={72}
            />
          </div>
          <div className="fxPosterCard__abbr">{teamShort(away)}</div>
        </div>
      </div>

      <div className="fxPosterCard__metaBlock">
        <div className={`fxPosterCard__date ${dateLine.toUpperCase().includes('TBA') ? 'is-tbc' : ''}`}>{dateLine}</div>
        <div className={`fxPosterCard__venue ${venueLine.toUpperCase() === 'TBA' ? 'is-tbc' : ''}`}>{venueLine}</div>
      </div>

      <div className="fxPosterCard__coachRow">
        <div className="fxPosterCard__coachCard fxPosterCard__coachCard--home">
          <div className={`fxPosterCard__coachName ${homeCoachNameIsTbc ? 'is-tbc' : ''}`}>{homeCoachName}</div>
          <div className="fxPosterCard__coachPsnRow">
            <img className="fxPosterCard__psIconImg fxPosterCard__psIconImg--white" src={psLogo} alt="PlayStation" />
            <div className={`fxPosterCard__coachPsn ${homeCoachPsnIsTbc ? 'is-tbc' : ''}`}>{homeCoachPsnText}</div>
          </div>
        </div>

        <div className="fxPosterCard__coachCard fxPosterCard__coachCard--away">
          <div className={`fxPosterCard__coachName ${awayCoachNameIsTbc ? 'is-tbc' : ''}`}>{awayCoachName}</div>
          <div className="fxPosterCard__coachPsnRow">
            <img className="fxPosterCard__psIconImg fxPosterCard__psIconImg--white" src={psLogo} alt="PlayStation" />
            <div className={`fxPosterCard__coachPsn ${awayCoachPsnIsTbc ? 'is-tbc' : ''}`}>{awayCoachPsnText}</div>
          </div>
        </div>
      </div>

      {winner ? <div className="fxPosterCard__result">{winner}</div> : null}

      <button className="fxPosterCard__cta" type="button" onClick={m.onMatchCentreClick}>
        MATCH CENTRE
      </button>
    </motion.section>
  );
}

function arePropsEqual(prev: { m: FixturePosterMatch }, next: { m: FixturePosterMatch }) {
  const a = prev.m;
  const b = next.m;

  return (
    a.id === b.id &&
    a.round === b.round &&
    a.venue === b.venue &&
    a.dateText === b.dateText &&
    a.status === b.status &&
    a.home === b.home &&
    a.away === b.away &&
    a.homePsn === b.homePsn &&
    a.awayPsn === b.awayPsn &&
    a.homeCoachName === b.homeCoachName &&
    a.awayCoachName === b.awayCoachName &&
    a.homeCoachPsn === b.homeCoachPsn &&
    a.awayCoachPsn === b.awayCoachPsn &&
    a.headerTag === b.headerTag &&
    (a.homeScore?.total ?? null) === (b.homeScore?.total ?? null) &&
    (a.homeScore?.goals ?? null) === (b.homeScore?.goals ?? null) &&
    (a.homeScore?.behinds ?? null) === (b.homeScore?.behinds ?? null) &&
    (a.awayScore?.total ?? null) === (b.awayScore?.total ?? null) &&
    (a.awayScore?.goals ?? null) === (b.awayScore?.goals ?? null) &&
    (a.awayScore?.behinds ?? null) === (b.awayScore?.behinds ?? null) &&
    a.onMatchCentreClick === b.onMatchCentreClick
  );
}

const FixturePosterCard = React.memo(FixturePosterCardComponent, arePropsEqual);

export default FixturePosterCard;
