import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import SmartImg from './SmartImg';
import { assetUrl, TEAM_ASSETS, type TeamKey } from '../lib/teamAssets';
import '../styles/fixture-broadcast-shared.css';
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

function normalizeTeamLabel(value: unknown): string {
  const normalized = String(value || '').trim();
  return normalized || 'Unknown';
}

function resolveTeamAsset(team: unknown) {
  const key = String(team || '').trim();
  const asset = (key ? TEAM_ASSETS[key as TeamKey] : null) || null;
  return {
    key,
    asset: asset || {
      name: normalizeTeamLabel(key),
      shortName: normalizeTeamLabel(key).slice(0, 3).toUpperCase(),
      colour: '#2a2f38',
      logoPath: '',
      logoFile: '',
    },
  };
}

function normalizeScore(score?: FixtureScore): FixtureScore | null {
  if (!score) return null;
  const total = Number(score.total);
  const goals = Number(score.goals);
  const behinds = Number(score.behinds);
  if (!Number.isFinite(total) || !Number.isFinite(goals) || !Number.isFinite(behinds)) return null;
  return { total, goals, behinds };
}

function resolveLogoSrc(asset: any): string {
  const raw = String(asset?.logoFile || asset?.logoPath || '').trim();
  return raw ? assetUrl(raw) : '';
}

function isMeaningfulMeta(value?: string | null) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return false;
  return normalized !== 'TBA' && normalized !== 'TBC' && normalized !== 'TIME TBA';
}

function displayCoach(name?: string | null) {
  const normalized = String(name || '').trim();
  return normalized || 'Coach TBC';
}

function displayPsn(primary?: string | null, fallback?: string | null) {
  const normalized = String(primary || fallback || '').trim();
  return normalized || 'PSN TBC';
}

function FixturePosterCardComponent({ m }: { m: FixturePosterMatch }) {
  const safeMatch = m || ({
    status: 'SCHEDULED',
    home: 'Unknown',
    away: 'Unknown',
  } satisfies FixturePosterMatch);

  const { key: homeKey, asset: resolvedHome } = resolveTeamAsset(safeMatch.home);
  const { key: awayKey, asset: resolvedAway } = resolveTeamAsset(safeMatch.away);
  const home = {
    ...resolvedHome,
    name: normalizeTeamLabel(resolvedHome?.name || homeKey),
  };
  const away = {
    ...resolvedAway,
    name: normalizeTeamLabel(resolvedAway?.name || awayKey),
  };

  const isUpcoming = safeMatch.status === 'SCHEDULED';
  const homeScore = normalizeScore(safeMatch.homeScore);
  const awayScore = normalizeScore(safeMatch.awayScore);

  const hasScores = !!homeScore && !!awayScore;
  const showScore = !isUpcoming && (safeMatch.status === 'LIVE' || safeMatch.status === 'FINAL') && hasScores;
  const compactScore =
    showScore && Math.max(Number(homeScore?.total || 0), Number(awayScore?.total || 0)) >= 100;

  const homeTint = pickTeamTint(homeKey || home.name, home);
  const awayTint = pickTeamTint(awayKey || away.name, away);

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
    if (!(safeMatch.status === 'FINAL' && showScore && homeScore && awayScore)) return '';
    const ht = Number(homeScore.total);
    const at = Number(awayScore.total);
    if (!Number.isFinite(ht) || !Number.isFinite(at)) return '';
    if (ht === at) return 'Draw';
    const winName = ht > at ? home.name : away.name;
    return `${winName} by ${Math.abs(ht - at)}`;
  }, [safeMatch.status, showScore, homeScore, awayScore, home.name, away.name]);

  const venueLine = useMemo(() => {
    const v = String(safeMatch.venue || '').trim();
    return isMeaningfulMeta(v) ? v : '';
  }, [safeMatch.venue]);

  const homeWins = showScore && homeScore && awayScore ? Number(homeScore.total) > Number(awayScore.total) : false;
  const awayWins = showScore && homeScore && awayScore ? Number(awayScore.total) > Number(homeScore.total) : false;

  const statusClass = safeMatch.status === 'FINAL' ? 'final' : safeMatch.status === 'LIVE' ? 'live' : 'upcoming';
  const homeLogoSrc = resolveLogoSrc(home);
  const awayLogoSrc = resolveLogoSrc(away);
  const headerMeta = String(safeMatch.headerTag || (safeMatch.round ? `Round ${safeMatch.round}` : 'Fixture')).trim();
  const homeCoach = displayCoach(safeMatch.homeCoachName);
  const awayCoach = displayCoach(safeMatch.awayCoachName);
  const homePsn = displayPsn(safeMatch.homePsn, safeMatch.homeCoachPsn);
  const awayPsn = displayPsn(safeMatch.awayPsn, safeMatch.awayCoachPsn);

  return (
    <motion.section
      className={`fxPosterCard fxPosterCard--${statusClass} ${compactScore ? 'fxPosterCard--compactScore' : ''}`}
      style={cssVars}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      whileTap={{ scale: 0.997 }}
    >
      <div className="fxPosterCard__topBar">
        <div className="fxPosterCard__headerBadge">{headerMeta}</div>
        <div className="fxPosterCard__statusPill">
          <span className="fxPosterCard__statusDot" />
          <span className="fxPosterCard__statusText">{statusText(safeMatch.status)}</span>
        </div>
      </div>

      {homeLogoSrc ? (
        <div className="fxPosterCard__watermark fxPosterCard__watermark--home" aria-hidden="true">
          <img
            src={homeLogoSrc}
            alt={`${home.name} watermark`}
            loading="lazy"
            decoding="async"
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
            width={256}
            height={256}
          />
        </div>
      ) : null}

      <div className="fxPosterCard__main">
        <div className="fxPosterCard__side fxPosterCard__side--home">
          <div className="fxPosterCard__teamGlow" />
          <div className="fxPosterCard__teamBox">
            <SmartImg
              className="fxPosterCard__logo fxSafeLogo"
              src={homeLogoSrc}
              alt={home.name}
              fallbackText={teamShort(home)}
              loading="lazy"
              decoding="async"
              width={72}
              height={72}
            />
          </div>
          <div className="fxPosterCard__abbr">{teamShort(home)}</div>
          <div className="fxPosterCard__teamName">{home.name}</div>
        </div>

        <div className="fxPosterCard__center">
          {isUpcoming ? (
            <>
              <div className="fxPosterCard__fixtureState">Match Day</div>
              {venueLine ? <div className="fxPosterCard__fixtureMeta">{venueLine}</div> : null}
            </>
          ) : (
            <>
              {safeMatch.status === 'LIVE' ? <div className="fxPosterCard__liveState">LIVE NOW</div> : null}
              {safeMatch.status === 'FINAL' ? <div className="fxPosterCard__finalState">FULL TIME</div> : null}

              <div className={`fxPosterCard__scoreRow ${safeMatch.status === 'FINAL' ? 'is-final' : safeMatch.status === 'LIVE' ? 'is-live' : ''}`}>
                <div
                  className={[
                    'fxPosterCard__score fxMetalText fxScoreTier--hero',
                    !showScore ? 'fxPosterCard__score--placeholder' : '',
                    showScore && safeMatch.status === 'FINAL' && !homeWins && awayWins ? 'fxPosterCard__score--dim' : '',
                  ].join(' ')}
                >
                  {showScore && homeScore ? homeScore.total : '—'}
                </div>

                <div className="fxPosterCard__dash">-</div>

                <div
                  className={[
                    'fxPosterCard__score fxMetalText fxScoreTier--hero',
                    !showScore ? 'fxPosterCard__score--placeholder' : '',
                    showScore && safeMatch.status === 'FINAL' && !awayWins && homeWins ? 'fxPosterCard__score--dim' : '',
                  ].join(' ')}
                >
                  {showScore && awayScore ? awayScore.total : '—'}
                </div>
              </div>

              <div className="fxPosterCard__minor fxScoreTier--minor">
                <div className={`fxPosterCard__minorVal ${!showScore ? 'fxPosterCard__minorVal--placeholder' : ''}`}>
                  {showScore && homeScore ? `${homeScore.goals}.${homeScore.behinds}` : '—.—'}
                </div>
                <div className="fxPosterCard__minorDivider" />
                <div className={`fxPosterCard__minorVal ${!showScore ? 'fxPosterCard__minorVal--placeholder' : ''}`}>
                  {showScore && awayScore ? `${awayScore.goals}.${awayScore.behinds}` : '—.—'}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="fxPosterCard__side fxPosterCard__side--away">
          <div className="fxPosterCard__teamGlow" />
          <div className="fxPosterCard__teamBox">
            <SmartImg
              className="fxPosterCard__logo fxSafeLogo"
              src={awayLogoSrc}
              alt={away.name}
              fallbackText={teamShort(away)}
              loading="lazy"
              decoding="async"
              width={72}
              height={72}
            />
          </div>
          <div className="fxPosterCard__abbr">{teamShort(away)}</div>
          <div className="fxPosterCard__teamName">{away.name}</div>
        </div>
      </div>

      {venueLine && !isUpcoming ? (
        <div className="fxPosterCard__metaBlock">
          <div className="fxPosterCard__venue">{venueLine}</div>
        </div>
      ) : null}

      {winner ? <div className="fxPosterCard__result">{winner}</div> : null}

      <div className="fxPosterCard__infoGrid">
        <div className="fxPosterCard__infoCard">
          <div className="fxPosterCard__infoLabel">Coach</div>
          <div className={`fxPosterCard__infoValue ${homeCoach === 'Coach TBC' ? 'is-tbc' : ''}`}>{homeCoach}</div>
          <div className="fxPosterCard__infoLabel">PSN</div>
          <div className={`fxPosterCard__coachPsn ${homePsn === 'PSN TBC' ? 'is-tbc' : ''}`}>{homePsn}</div>
        </div>

        <div className="fxPosterCard__infoCard fxPosterCard__infoCard--away">
          <div className="fxPosterCard__infoLabel">Coach</div>
          <div className={`fxPosterCard__infoValue ${awayCoach === 'Coach TBC' ? 'is-tbc' : ''}`}>{awayCoach}</div>
          <div className="fxPosterCard__infoLabel">PSN</div>
          <div className={`fxPosterCard__coachPsn ${awayPsn === 'PSN TBC' ? 'is-tbc' : ''}`}>{awayPsn}</div>
        </div>
      </div>

      <button className="fxPosterCard__cta" type="button" onClick={safeMatch.onMatchCentreClick}>
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
