import { type CSSProperties, useMemo } from 'react';
import { ChevronLeft } from 'lucide-react';

import SmartImg from '@/components/SmartImg';
import type { MatchCentreModel } from '@/lib/matchCentreRepo';
import { resolveTeamKey, resolveTeamLogoUrl } from '@/lib/entityResolvers';
import { TEAM_ASSETS, type TeamKey } from '@/lib/teamAssets';
import '@/styles/mc-hero.css';

type Props = {
  onBack?: () => void;
  model: MatchCentreModel | null;
  loading: boolean;
};

function slugToTeamKey(slug?: string | null): TeamKey | null {
  const raw = String(slug || '').trim();
  if (!raw) return null;
  const key = resolveTeamKey({ slug: raw });
  return TEAM_ASSETS[key] ? key : null;
}

function abbreviation(teamName?: string | null, fallback = 'TBC') {
  const raw = String(teamName || '').trim();
  if (!raw) return fallback;

  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]?.[0] || ''}${words[1]?.[0] || ''}`.toUpperCase();
  }

  return raw.slice(0, 3).toUpperCase();
}

function statusToDisplayLabel(statusLabel?: string | null) {
  const raw = String(statusLabel || '').trim().toUpperCase();
  if (raw === 'FINAL') return 'Full Time';
  if (raw === 'LIVE') return 'Scheduled';
  return 'Scheduled';
}

function statusTone(statusLabel: string) {
  return statusLabel === 'Full Time' ? 'final' : 'scheduled';
}

function resolveHex(value?: string | null) {
  const raw = String(value || '').trim();
  if (raw.startsWith('#') && (raw.length === 7 || raw.length === 4)) return raw;
  return null;
}

function hexToRgb(hex?: string | null) {
  const resolved = resolveHex(hex) || '#3b82f6';
  const compact = resolved.replace('#', '');
  const full = compact.length === 3 ? compact.split('').map((part) => `${part}${part}`).join('') : compact;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);

  return {
    r: Number.isFinite(r) ? r : 59,
    g: Number.isFinite(g) ? g : 130,
    b: Number.isFinite(b) ? b : 246,
  };
}

const TINT_OVERRIDES: Record<string, string> = {
  collingwood: '#C4A942',
  carlton: '#1E4ED8',
  brisbane: '#7A1933',
  sydney: '#C71F2D',
};

/** Secondary team colours for colour clash resolution */
const TEAM_SECONDARY_COLORS: Record<string, string> = {
  adelaide: '#f3c346',
  brisbane: '#2e76bc',
  carlton: '#6ca8ff',
  collingwood: '#8f9397',
  essendon: '#1f1f1f',
  fremantle: '#9a82d8',
  geelong: '#5d88c8',
  goldcoast: '#f2be3f',
  gws: '#4f5964',
  hawthorn: '#c8a96f',
  melbourne: '#e33542',
  northmelbourne: '#ffffff',
  portadelaide: '#73b5d9',
  richmond: '#ffd139',
  stkilda: '#c22d36',
  sydney: '#f5f5f5',
  westcoast: '#f2b31f',
  westernbulldogs: '#d23c4f',
};

function colorDistanceHex(a: string, b: string): number {
  const parse = (hex: string): [number, number, number] => {
    const c = hex.replace('#', '');
    const f = c.length === 3 ? c.split('').map((ch) => `${ch}${ch}`).join('') : c;
    return [parseInt(f.slice(0, 2), 16) || 128, parseInt(f.slice(2, 4), 16) || 128, parseInt(f.slice(4, 6), 16) || 128];
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
  return Math.sqrt(dr * dr * 2 + dg * dg * 4 + db * db * 3);
}

function resolveContrastingAwayTint(homeTint: string, awayTint: string, awayKey?: TeamKey | null): string {
  const CLASH_THRESHOLD = 80;
  if (colorDistanceHex(homeTint, awayTint) >= CLASH_THRESHOLD) return awayTint;
  const key = String(awayKey || '').toLowerCase().replace(/[^a-z]/g, '');
  const secondary = TEAM_SECONDARY_COLORS[key];
  if (secondary && colorDistanceHex(homeTint, secondary) > CLASH_THRESHOLD) return secondary;
  return awayTint;
}

function pickTeamTint(teamKey?: TeamKey | null, teamName?: string | null, explicitColour?: string | null) {
  const direct = resolveHex(explicitColour);
  if (direct) return direct;

  const keyStr = String(teamKey || '').trim().toLowerCase();
  if (TINT_OVERRIDES[keyStr]) return TINT_OVERRIDES[keyStr];

  const asset = (teamKey ? (TEAM_ASSETS[teamKey] as Record<string, string | undefined>) : null) || null;
  const candidates = [asset?.glow, asset?.accent, asset?.tint, asset?.primary, asset?.colour];
  for (const candidate of candidates) {
    const resolved = resolveHex(candidate);
    if (resolved) return resolved;
  }

  return '#3b82f6';
}

function computeResultSummary(
  homeScore: number,
  awayScore: number,
  statusLabel: string,
  homeTeamName?: string | null,
  awayTeamName?: string | null,
) {
  if (statusLabel === 'Scheduled') {
    return { text: 'Match yet to start', winnerKey: null };
  }

  if (statusLabel !== 'Full Time') return null;

  const scoreDiff = Math.abs(homeScore - awayScore);
  if (scoreDiff === 0) {
    return { text: 'Scores level', winnerKey: null };
  }

  const isHomeWin = homeScore > awayScore;
  const winningTeam = isHomeWin ? homeTeamName : awayTeamName;
  const margin = scoreDiff;

  return {
    text: `${winningTeam || (isHomeWin ? 'Home' : 'Away')} won by ${margin} pts`,
    winnerKey: isHomeWin ? 'home' : 'away',
  };
}

export default function HeroHeader({ onBack, model, loading }: Props) {
  const isLoadingShell = !!loading && !model;
  const home = model?.home;
  const away = model?.away;

  const homeKey = slugToTeamKey(home?.slug);
  const awayKey = slugToTeamKey(away?.slug);

  const homeLogo = resolveTeamLogoUrl({
    logoUrl: home?.logoUrl,
    slug: home?.slug,
    teamKey: homeKey || undefined,
    name: home?.fullName,
    fallbackPath: homeKey ? TEAM_ASSETS[homeKey]?.logoFile || TEAM_ASSETS[homeKey]?.logoPath : 'elite-gaming-logo.png',
  });

  const awayLogo = resolveTeamLogoUrl({
    logoUrl: away?.logoUrl,
    slug: away?.slug,
    teamKey: awayKey || undefined,
    name: away?.fullName,
    fallbackPath: awayKey ? TEAM_ASSETS[awayKey]?.logoFile || TEAM_ASSETS[awayKey]?.logoPath : 'elite-gaming-logo.png',
  });

  const homeTint = pickTeamTint(homeKey, home?.fullName, home?.color || home?.colour);
  const rawAwayTint = pickTeamTint(awayKey, away?.fullName, away?.color || away?.colour);
  const awayTint = resolveContrastingAwayTint(homeTint, rawAwayTint, awayKey);

  const homeRgb = hexToRgb(homeTint);
  const awayRgb = hexToRgb(awayTint);

  const rawStatus = model?.statusLabel || 'UPCOMING';
  const displayStatus = statusToDisplayLabel(rawStatus);
  const tone = statusTone(displayStatus);

  const roundLabel = model?.round ? `Round ${model.round}` : isLoadingShell ? 'Match Centre' : (tone === 'scheduled' ? '' : 'Round TBC');

  const homeScore = Number.isFinite(home?.score) ? Number(home?.score) : 0;
  const awayScore = Number.isFinite(away?.score) ? Number(away?.score) : 0;
  const homeGoals = Number.isFinite(home?.goals) ? Number(home?.goals) : null;
  const homeBehinds = Number.isFinite(home?.behinds) ? Number(home?.behinds) : null;
  const awayGoals = Number.isFinite(away?.goals) ? Number(away?.goals) : null;
  const awayBehinds = Number.isFinite(away?.behinds) ? Number(away?.behinds) : null;

  const homeLeading = homeScore > awayScore;
  const awayLeading = awayScore > homeScore;

  const homeAbbr = home?.abbreviation || home?.shortName || abbreviation(home?.fullName, 'H');
  const awayAbbr = away?.abbreviation || away?.shortName || abbreviation(away?.fullName, 'A');

  const scoreClassName = `mcHeroShell__score ${tone === 'final' ? 'mcHeroShell__score--final' : 'mcHeroShell__score--scheduled'}`;

  // Only show dashes if genuinely unplayed: Scheduled status AND both scores are 0
  const isDashDisplay = displayStatus === 'Scheduled' && homeScore === 0 && awayScore === 0;

  // Check if goals/behinds data is available and valid
  const hasGoalsData =
    homeGoals !== null && homeBehinds !== null && awayGoals !== null && awayBehinds !== null;

  const resultSummary = computeResultSummary(homeScore, awayScore, displayStatus, home?.fullName, away?.fullName);
  const winnerTint = resultSummary?.winnerKey === 'home' ? homeTint : resultSummary?.winnerKey === 'away' ? awayTint : '#f5c400';

  const heroVars = useMemo(
    () =>
      ({
        '--mc-hero-home-r': String(homeRgb.r),
        '--mc-hero-home-g': String(homeRgb.g),
        '--mc-hero-home-b': String(homeRgb.b),
        '--mc-hero-away-r': String(awayRgb.r),
        '--mc-hero-away-g': String(awayRgb.g),
        '--mc-hero-away-b': String(awayRgb.b),
        '--mc-hero-home-hex': homeTint,
        '--mc-hero-away-hex': awayTint,
        '--mc-hero-winner-hex': winnerTint,
      }) as CSSProperties,
    [awayRgb.b, awayRgb.g, awayRgb.r, awayTint, homeRgb.b, homeRgb.g, homeRgb.r, homeTint, winnerTint],
  );

  return (
    <section className="mcHeroShell" style={heroVars}>
      <div className="mcHeroShell__inner">
        <div className="mcHeroShell__toolbar">
          {onBack ? (
            <button type="button" className="mcHeroShell__back" onClick={onBack} aria-label="Back">
              <ChevronLeft size={16} />
            </button>
          ) : null}
        </div>

        <div className={`mcHeroShell__card mcHeroShell__card--${tone}`}>
          <div className="mcHeroShell__backdrop" aria-hidden="true">
            <span className="mcHeroShell__backdropGlow mcHeroShell__backdropGlow--home" />
            <span className="mcHeroShell__backdropGlow mcHeroShell__backdropGlow--away" />
            <span className="mcHeroShell__scoreSweep" />
            <span className="mcHeroShell__vignette" />
          </div>
          <div className="mcHeroShell__chrome" aria-hidden="true" />

          <div className="mcHeroShell__meta">
            {roundLabel && <span className="mcHeroShell__pill mcHeroShell__pill--round">{roundLabel}</span>}
            <span className={`mcHeroShell__pill mcHeroShell__pill--status mcHeroShell__pill--${tone}`}>
              <span className={`mcHeroShell__statusDot mcHeroShell__statusDot--${tone}`} aria-hidden="true" />
              {displayStatus}
            </span>
          </div>

          <div className="mcHeroShell__stage">
            <div
              className={`mcHeroShell__teamCol mcHeroShell__teamCol--home ${homeLeading ? 'is-leading' : awayLeading ? 'is-trailing' : ''}`}
            >
              <span className="mcHeroShell__teamGlow mcHeroShell__teamGlow--home" aria-hidden="true" />
              <div className="mcHeroShell__logoWrap">
                <SmartImg src={homeLogo} alt={home?.fullName || 'Home'} className="mcHeroShell__logo" fallbackText={homeAbbr} loading="eager" fetchPriority="high" />
              </div>
              <div className="mcHeroShell__teamText">
                <div className="mcHeroShell__teamName">{home?.fullName || 'Home Team'}</div>
              </div>
            </div>

            <div className="mcHeroShell__centreCol">
              <div className="mcHeroShell__centreMeta">
                {isDashDisplay ? (
                  <>
                    <div className="mcHeroShell__matchupLabel">MATCHUP</div>
                    {model?.venue && (
                      <div className="mcHeroShell__eventCapsule">
                        <span className="mcHeroShell__eventVenue">{model.venue}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className={scoreClassName} aria-label={`Score ${homeScore} to ${awayScore}`}>
                    <span className={homeLeading ? 'is-leading' : awayLeading ? 'is-trailing' : ''}>{homeScore}</span>
                    <span className="mcHeroShell__dash" aria-hidden="true">
                      &ndash;
                    </span>
                    <span className={awayLeading ? 'is-leading' : homeLeading ? 'is-trailing' : ''}>{awayScore}</span>
                  </div>
                )}
                {!isDashDisplay && hasGoalsData && (
                  <div className="mcHeroShell__minor">
                    <span className={`mcHeroShell__minorVal ${homeLeading ? 'is-leading' : awayLeading ? 'is-trailing' : ''}`}>
                      {homeGoals}.{homeBehinds}
                    </span>
                    <span className="mcHeroShell__minorDivider" />
                    <span className={`mcHeroShell__minorVal ${awayLeading ? 'is-leading' : homeLeading ? 'is-trailing' : ''}`}>
                      {awayGoals}.{awayBehinds}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div
              className={`mcHeroShell__teamCol mcHeroShell__teamCol--away ${awayLeading ? 'is-leading' : homeLeading ? 'is-trailing' : ''}`}
            >
              <span className="mcHeroShell__teamGlow mcHeroShell__teamGlow--away" aria-hidden="true" />
              <div className="mcHeroShell__logoWrap">
                <SmartImg src={awayLogo} alt={away?.fullName || 'Away'} className="mcHeroShell__logo" fallbackText={awayAbbr} loading="eager" fetchPriority="high" />
              </div>
              <div className="mcHeroShell__teamText">
                <div className="mcHeroShell__teamName">{away?.fullName || 'Away Team'}</div>
              </div>
            </div>
          </div>

          {resultSummary && <div className="mcHeroShell__resultSummary">{resultSummary.text}</div>}
        </div>
      </div>
    </section>
  );
}
