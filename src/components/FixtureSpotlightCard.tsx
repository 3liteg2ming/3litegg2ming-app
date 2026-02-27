import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { assetUrl, TEAM_ASSETS, type TeamKey } from '../lib/teamAssets';
import SmartImg from './SmartImg';
import '../styles/fixture-spotlight.css';

export type FixtureScore = { total: number; goals: number; behinds: number };

export type FixtureMatch = {
  id?: string;
  round?: number;

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

function statusLabel(status: FixtureMatch['status']) {
  if (status === 'FINAL') return 'FULL TIME';
  if (status === 'LIVE') return 'LIVE';
  return 'UPCOMING';
}

function dotClass(status: FixtureMatch['status']) {
  if (status === 'FINAL') return 'fxPoster__dot fxPoster__dot--final';
  if (status === 'LIVE') return 'fxPoster__dot fxPoster__dot--live';
  return 'fxPoster__dot fxPoster__dot--upcoming';
}

function PSIcon() {
  return (
    <svg className="fxPoster__psIconSvg" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
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

  const showScore = (m.status === 'LIVE' || m.status === 'FINAL') && !!m.homeScore && !!m.awayScore;

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
      ['--refGold' as any]: '#F5C400',
    }),
    [homeRgb, awayRgb]
  );

  const title = `${home.name.toUpperCase()} v ${away.name.toUpperCase()}`;
  const roundText = m.round ? `ROUND ${m.round}` : 'ROUND';

  // Winner highlight (only for FINAL with scores)
  const homeTotal = showScore ? Number(m.homeScore!.total) : NaN;
  const awayTotal = showScore ? Number(m.awayScore!.total) : NaN;
  const winner: 'HOME' | 'AWAY' | 'DRAW' | 'NONE' = (() => {
    if (!showScore || !Number.isFinite(homeTotal) || !Number.isFinite(awayTotal)) return 'NONE';
    if (homeTotal === awayTotal) return 'DRAW';
    return homeTotal > awayTotal ? 'HOME' : 'AWAY';
  })();

  return (
    <motion.section
      className="fxPoster"
      style={cssVars}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="fxPoster__halo" />

      <div className="fxPoster__top">
        <div className="fxPoster__topLeft">
          <div className="fxPoster__bolt" aria-hidden>⚡</div>
          <div className="fxPoster__topText">{roundText}</div>
        </div>

        <div className="fxPoster__topRight">
          <div className={dotClass(m.status)} />
          <div className="fxPoster__topText">{statusLabel(m.status)}</div>
        </div>
      </div>

      <div className="fxPoster__title">{title}</div>

      <div className="fxPoster__main">
        {/* HOME */}
        <div className="fxPoster__side">
          <div className="fxPoster__teamBox">
            <div className="fxPoster__logoWrap">
              <SmartImg
                className="fxPoster__logo"
                src={assetUrl(home.logoFile ?? '')}
                alt={home.name}
                fallbackText="EG"
              />
            </div>
          </div>
          <div className="fxPoster__abbr">{(home.short || home.name).toUpperCase()}</div>
        </div>

        {/* SCORES */}
        <div className="fxPoster__center">
          <div className="fxPoster__scorePill">
            <div className={`fxPoster__scoreNum ${winner === 'HOME' && m.status === 'FINAL' ? 'fxPoster__scoreNum--win' : ''}`}>
              {showScore ? m.homeScore!.total : '—'}
            </div>
            <div className="fxPoster__scoreDash">-</div>
            <div className={`fxPoster__scoreNum ${winner === 'AWAY' && m.status === 'FINAL' ? 'fxPoster__scoreNum--win' : ''}`}>
              {showScore ? m.awayScore!.total : '—'}
            </div>
          </div>

          <div className="fxPoster__minor">
            <div className="fxPoster__minorVal">
              {showScore ? `${m.homeScore!.goals}.${m.homeScore!.behinds}` : '—.—'}
            </div>
            <div className="fxPoster__minorDivider" />
            <div className="fxPoster__minorVal">
              {showScore ? `${m.awayScore!.goals}.${m.awayScore!.behinds}` : '—.—'}
            </div>
          </div>
        </div>

        {/* AWAY */}
        <div className="fxPoster__side">
          <div className="fxPoster__teamBox">
            <div className="fxPoster__logoWrap">
              <SmartImg
                className="fxPoster__logo"
                src={assetUrl(away.logoFile ?? '')}
                alt={away.name}
                fallbackText="EG"
              />
            </div>
          </div>
          <div className="fxPoster__abbr">{(away.short || away.name).toUpperCase()}</div>
        </div>
      </div>

      <div className="fxPoster__psnRow">
        <div className="fxPoster__psn">
          <span className="fxPoster__psIconWrap" aria-hidden><PSIcon /></span>
          <span className="fxPoster__psnText">{m.homePsn || 'PSN'}</span>
        </div>

        <div className="fxPoster__psn">
          <span className="fxPoster__psIconWrap" aria-hidden><PSIcon /></span>
          <span className="fxPoster__psnText">{m.awayPsn || 'PSN'}</span>
        </div>
      </div>

      <button className="fxPoster__cta" type="button" onClick={m.onMatchCentreClick}>
        MATCH CENTRE
      </button>
    </motion.section>
  );
}
