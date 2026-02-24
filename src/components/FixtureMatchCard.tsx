import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { assetUrl, TEAM_ASSETS, type TeamKey } from '../lib/teamAssets';
import SmartImg from './SmartImg';
import '../styles/fixture-spotlight.css';

export type FixtureScore = { total: number; goals: number; behinds: number };

export type FixtureMatch = {
  id?: string;
  round?: number | string;
  titleLine?: string;

  // Optional legacy fields your page may still pass
  footerLine?: string; // e.g. "Adelaide by 10 · Saturday..."
  resultLine?: string; // e.g. "Adelaide by 10"

  status: 'SCHEDULED' | 'LIVE' | 'FINAL';
  home: TeamKey;
  away: TeamKey;

  homePsn?: string;
  awayPsn?: string;

  homeScore?: FixtureScore;
  awayScore?: FixtureScore;

  matchOfRound?: boolean;

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

function pickTeamTint(key: TeamKey, asset: any): string {
  if (String(key) === 'collingwood') return '#B88A00';
  if (String(key) === 'adelaide') return '#C81E2A';

  const candidates: any[] = [asset?.glow, asset?.accent, asset?.tint, asset?.primary];
  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('#') && (c.length === 7 || c.length === 4)) return c;
  }
  return '#0B3A8D';
}

function statusText(status: FixtureMatch['status']) {
  if (status === 'FINAL') return 'FULL TIME';
  if (status === 'LIVE') return 'LIVE';
  return 'UPCOMING';
}

function dotClass(status: FixtureMatch['status']) {
  if (status === 'FINAL') return 'fxMC__dot fxMC__dot--final';
  if (status === 'LIVE') return 'fxMC__dot fxMC__dot--live';
  return 'fxMC__dot fxMC__dot--scheduled';
}

function scoreReady(m: FixtureMatch) {
  return (m.status === 'LIVE' || m.status === 'FINAL') && !!m.homeScore && !!m.awayScore;
}

function upper(s: string) {
  return String(s || '').toUpperCase();
}

/** "Adelaide Crows" -> "Adelaide", "Sydney Swans" -> "Sydney" */
function clubFromTeamName(fullName: string) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return fullName;
  return parts.slice(0, -1).join(' ');
}

/** If you pass: "Adelaide by 10 · Saturday..." => returns "Adelaide by 10" */
function trimToResultOnly(line?: string) {
  const raw = String(line || '').trim();
  if (!raw) return '';
  const cut = raw.split('·')[0].split('•')[0].split('|')[0].trim();
  return cut;
}

function PSIcon() {
  return (
    <svg className="fxMC__psIconSvg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path
        d="M27 12c9 0 15 4 15 12 0 7-6 11-15 11h-5v17h-8V12h13zm-5 7v9h5c4 0 7-2 7-5 0-3-3-4-7-4h-5z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M46 28c6 2 10 4 10 10 0 7-7 12-17 12-5 0-10-1-14-3l3-6c4 2 8 3 11 3 5 0 8-2 8-5 0-2-2-3-5-4l-6-2c-6-2-9-5-9-10 0-7 7-11 16-11 5 0 9 1 12 2l-3 6c-3-2-6-2-9-2-4 0-7 1-7 4 0 2 2 3 5 4l5 2z"
        fill="currentColor"
        opacity="0.55"
      />
    </svg>
  );
}

export default function FixtureSpotlightCard({ m }: { m: FixtureMatch }) {
  const home = TEAM_ASSETS[m.home];
  const away = TEAM_ASSETS[m.away];
  if (!home || !away) return null;

  const ready = scoreReady(m);

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
      ['--egYellow' as any]: '#F5C400',
    }),
    [homeRgb, awayRgb]
  );

  const roundLabel = m.round ? `ROUND ${m.round}` : 'ROUND';
  const titleLine = (m.titleLine && m.titleLine.trim()) || `${upper(home.name)} v ${upper(away.name)}`;

  const homeTotal = ready ? Number(m.homeScore!.total) : NaN;
  const awayTotal = ready ? Number(m.awayScore!.total) : NaN;

  const winnerSide: 'HOME' | 'AWAY' | 'DRAW' | 'NONE' = (() => {
    if (!ready || !Number.isFinite(homeTotal) || !Number.isFinite(awayTotal)) return 'NONE';
    if (homeTotal === awayTotal) return 'DRAW';
    return homeTotal > awayTotal ? 'HOME' : 'AWAY';
  })();

  // ✅ This guarantees "Adelaide by 10" exists for FINAL with scores
  const resultText = (() => {
    if (!ready || m.status !== 'FINAL') return '';

    // if you pass something like "Adelaide by 10 · Saturday..." we trim it
    const fromFooter = trimToResultOnly(m.resultLine || m.footerLine);
    if (fromFooter) return fromFooter;

    if (winnerSide === 'DRAW') return 'Draw';

    if (winnerSide === 'HOME' || winnerSide === 'AWAY') {
      const margin = Math.abs(homeTotal - awayTotal);
      const winnerClub = winnerSide === 'HOME' ? clubFromTeamName(home.name) : clubFromTeamName(away.name);
      return `${winnerClub} by ${margin}`;
    }

    return '';
  })();

  return (
    <motion.section
      className="fxMC"
      style={cssVars}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="fxMC__shimmer" aria-hidden />
      <div className="fxMC__glowPulse" aria-hidden />
      <div className="fxMC__edgeTop" aria-hidden />
      <div className="fxMC__edgeSides" aria-hidden />

      <div className="fxMC__header">
        <div className="fxMC__round">
          <span className="fxMC__bolt" aria-hidden>⚡</span>
          <span className="fxMC__roundText">{roundLabel}</span>
        </div>

        <div className="fxMC__status">
          <span className={dotClass(m.status)} />
          <span className="fxMC__statusText">{statusText(m.status)}</span>
        </div>
      </div>

      <div className="fxMC__title">{titleLine}</div>

      <div className="fxMC__main">
        {/* HOME */}
        <div className="fxMC__team fxMC__team--home">
          <div className="fxMC__teamGlow fxMC__teamGlow--home" aria-hidden />
          <div className="fxMC__logoBox fxMC__logoBox--home">
            <SmartImg className="fxMC__logo" src={assetUrl(home.logoFile)} alt={home.name} fallbackText="EG" />
          </div>
          <div className="fxMC__abbr">{(home.short || home.name).toUpperCase()}</div>
        </div>

        {/* SCORE */}
        <div className="fxMC__score">
          <div className="fxMC__scoreRow">
            <span className={`fxMC__scoreNum ${winnerSide === 'HOME' ? 'fxMC__scoreNum--win' : ''}`}>
              {ready ? m.homeScore!.total : '—'}
            </span>
            <span className="fxMC__scoreDash">-</span>
            <span className={`fxMC__scoreNum ${winnerSide === 'AWAY' ? 'fxMC__scoreNum--win' : ''}`}>
              {ready ? m.awayScore!.total : '—'}
            </span>
          </div>

          <div className="fxMC__minorRow">
            <span className="fxMC__minorNum">{ready ? `${m.homeScore!.goals}.${m.homeScore!.behinds}` : '—.—'}</span>
            <span className="fxMC__minorDivider" />
            <span className="fxMC__minorNum">{ready ? `${m.awayScore!.goals}.${m.awayScore!.behinds}` : '—.—'}</span>
          </div>
        </div>

        {/* AWAY */}
        <div className="fxMC__team fxMC__team--away">
          <div className="fxMC__teamGlow fxMC__teamGlow--away" aria-hidden />
          <div className="fxMC__logoBox fxMC__logoBox--away">
            <SmartImg className="fxMC__logo" src={assetUrl(away.logoFile)} alt={away.name} fallbackText="EG" />
          </div>
          <div className="fxMC__abbr">{(away.short || away.name).toUpperCase()}</div>
        </div>
      </div>

      <div className="fxMC__psnRow">
        <div className="fxMC__psnPill">
          <span className="fxMC__psIconWrap" aria-hidden><PSIcon /></span>
          <span className="fxMC__psnText">{m.homePsn || 'PSN'}</span>
        </div>

        <div className="fxMC__psnPill">
          <span className="fxMC__psIconWrap" aria-hidden><PSIcon /></span>
          <span className="fxMC__psnText">{m.awayPsn || 'PSN'}</span>
        </div>
      </div>

      {/* ✅ Always shows for FINAL with scores */}
      {resultText ? (
        <div className="fxMC__resultRow">
          <div className="fxMC__resultPill">{resultText}</div>
        </div>
      ) : null}

      <button className="fxMC__cta" type="button" onClick={m.onMatchCentreClick}>
        MATCH CENTRE
      </button>
    </motion.section>
  );
}
