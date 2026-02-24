import { motion } from 'framer-motion';
import { Zap, ChevronRight } from 'lucide-react';
import SmartImg from './SmartImg';
import { assetUrl, TEAM_ASSETS, type TeamKey } from '../lib/teamAssets';
import '../styles/fixture-card-exact.css';

export type ScoreLine = {
  total: number;
  goals: number;
  behinds: number;
};

export type FixtureCardProps = {
  id: string;
  status: 'SCHEDULED' | 'LIVE' | 'FINAL';
  venue?: string;
  home: TeamKey;
  away: TeamKey;
  homePsn?: string;
  awayPsn?: string;
  homeScore?: ScoreLine;
  awayScore?: ScoreLine;
  matchOfRound?: boolean;
  onMatchCentreClick?: () => void;
  onViewFixturesClick?: () => void;
};

function hexToRgb(hex?: string) {
  const h = String(hex || '').replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (full.length !== 6) return null;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (![r, g, b].every((x) => Number.isFinite(x))) return null;
  return { r, g, b };
}

function rgba(hex?: string, a = 0.25) {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(245,196,0,${a})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
}

export default function FixtureCardExact({
  status,
  home,
  away,
  homePsn,
  awayPsn,
  homeScore,
  awayScore,
  matchOfRound,
  onMatchCentreClick,
  onViewFixturesClick,
}: FixtureCardProps) {
  const homeTeam = TEAM_ASSETS[home];
  const awayTeam = TEAM_ASSETS[away];

  if (!homeTeam || !awayTeam) return null;

  const showScore = (status === 'LIVE' || status === 'FINAL') && homeScore && awayScore;

  const homeTint = homeTeam.primary || '#E31937';
  const awayTint = awayTeam.primary || '#0047AB';

  const cssVars: React.CSSProperties = {
    ['--homeTint' as any]: homeTint,
    ['--awayTint' as any]: awayTint,
    ['--homeGlow' as any]: rgba(homeTint, 0.8),
    ['--awayGlow' as any]: rgba(awayTint, 0.8),
    ['--homeGlowSoft' as any]: rgba(homeTint, 0.4),
    ['--awayGlowSoft' as any]: rgba(awayTint, 0.4),
  };

  const getStatusLabel = () => {
    if (status === 'SCHEDULED') return 'UPCOMING';
    if (status === 'LIVE') return 'LIVE';
    return 'FINAL';
  };

  return (
    <motion.div
      className="fcCard"
      style={cssVars}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      {/* Outer glow effect */}
      <div className="fcCardGlow" />

      {/* Card content */}
      <div className="fcCardInner">
        {/* Header */}
        <div className="fcHeader">
          <div className="fcHeaderLeft">
            {matchOfRound && (
              <>
                <Zap className="fcZapIcon" size={18} />
                <span className="fcHeaderText">MATCH OF THE ROUND</span>
              </>
            )}
            {!matchOfRound && <span className="fcHeaderText">{getStatusLabel()}</span>}
          </div>
          <div className="fcHeaderRight">
            <span className="fcStatusDot" />
            <span className="fcHeaderText">{getStatusLabel()}</span>
          </div>
        </div>

        {/* Main content */}
        <div className="fcMain">
          {/* Home Team */}
          <div className="fcTeamSide">
            <div className="fcLogoBox fcLogoBox--home">
              <SmartImg
                className="fcLogo"
                src={assetUrl(homeTeam.logoFile)}
                alt={homeTeam.name}
                fallbackText="H"
              />
            </div>
            <span className="fcTeamName">{homeTeam.name.toUpperCase()}</span>
            <div className="fcPsnPill">
              <span className="fcPsnBadge">PS</span>
              <span className="fcPsnName">{homePsn || 'EliteYo...'}</span>
            </div>
          </div>

          {/* Score Center */}
          <div className="fcScoreCenter">
            <div className="fcScoreBox">
              <span className="fcScoreValue">{showScore ? homeScore!.total : '—'}</span>
              <span className="fcScoreDivider">-</span>
              <span className="fcScoreValue">{showScore ? awayScore!.total : '—'}</span>
            </div>
            <div className="fcScoreGlow" />
            <div className="fcBehindRow">
              <span className="fcBehindValue">
                {showScore ? `${homeScore!.goals}.${homeScore!.behinds}` : '—.—'}
              </span>
              <span className="fcBehindDivider" />
              <span className="fcBehindValue">
                {showScore ? `${awayScore!.goals}.${awayScore!.behinds}` : '—.—'}
              </span>
            </div>
          </div>

          {/* Away Team */}
          <div className="fcTeamSide">
            <div className="fcLogoBox fcLogoBox--away">
              <SmartImg
                className="fcLogo"
                src={assetUrl(awayTeam.logoFile)}
                alt={awayTeam.name}
                fallbackText="A"
              />
            </div>
            <span className="fcTeamName" style={{ opacity: 0 }}>
              {awayTeam.name.toUpperCase()}
            </span>
            <div className="fcPsnPill">
              <span className="fcPsnBadge">PS</span>
              <span className="fcPsnName">{awayPsn || 'EliteYo...'}</span>
            </div>
          </div>
        </div>

        {/* Bottom Buttons */}
        <div className="fcButtons">
          <button className="fcBtn fcBtn--primary" onClick={onMatchCentreClick}>
            MATCH CENTRE
          </button>
          <button className="fcBtn fcBtn--secondary" onClick={onViewFixturesClick}>
            VIEW FIXTURES
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
