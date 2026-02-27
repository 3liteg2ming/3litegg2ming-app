import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import SmartImg from '@/components/SmartImg';
import { assetUrl, TEAM_ASSETS, type TeamKey } from '@/lib/teamAssets';
import type { MatchCentreModel } from '@/lib/matchCentreRepo';
import '@/styles/match-centre-hero.css';

type Props = {
  onBack?: () => void;
  model: MatchCentreModel | null;
  loading?: boolean;
};

function slugToTeamKey(slug: string): TeamKey | null {
  const s = String(slug || '').toLowerCase().trim();
  const keys = Object.keys(TEAM_ASSETS) as TeamKey[];
  if (keys.includes(s as TeamKey)) return s as TeamKey;
  const compact = s.replace(/[^a-z0-9]/g, '');
  const aliases: Record<string, TeamKey> = {
    collingwoodmagpies: 'collingwood',
    carltonblues: 'carlton',
    adelaidecrows: 'adelaide',
    brisbanelions: 'brisbane',
    gwsgiants: 'gws',
    stkildasaints: 'stkilda',
    westernbulldogs: 'westernbulldogs',
    westcoasteagles: 'westcoast',
    portadelaidepower: 'portadelaide',
    northmelbournekangaroos: 'northmelbourne',
    goldcoastsuns: 'goldcoast',
    geelongcats: 'geelong',
    hawthornhawks: 'hawthorn',
    richmondtigers: 'richmond',
    sydneyswans: 'sydney',
    melbournedemons: 'melbourne',
    essendonbombers: 'essendon',
    fremantledockers: 'fremantle',
  };
  return aliases[compact] || null;
}

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

function pickTeamTint(key: TeamKey | undefined, asset: any): string {
  if (!key) return '#0B3A8D';
  if (String(key) === 'collingwood') return '#B88A00';
  if (String(key) === 'adelaide') return '#C81E2A';

  const candidates: any[] = [asset?.glow, asset?.accent, asset?.tint, asset?.primary];
  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('#') && (c.length === 7 || c.length === 4)) return c;
  }
  return asset?.colour || '#0B3A8D';
}

export default function HeroHeader({ onBack, model, loading }: Props) {
  const home = model?.home;
  const away = model?.away;

  const homeKey = home ? slugToTeamKey(home.slug) : null;
  const awayKey = away ? slugToTeamKey(away.slug) : null;

  const homeAsset = homeKey ? TEAM_ASSETS[homeKey] : null;
  const awayAsset = awayKey ? TEAM_ASSETS[awayKey] : null;

  const homeLogo =
    home?.logoUrl || (homeKey ? assetUrl(TEAM_ASSETS[homeKey].logoFile ?? '') : '');

  const awayLogo =
    away?.logoUrl || (awayKey ? assetUrl(TEAM_ASSETS[awayKey].logoFile ?? '') : '');

  const homeTint = pickTeamTint(homeKey ?? undefined, homeAsset);
  const awayTint = pickTeamTint(awayKey ?? undefined, awayAsset);

  const homeRgb = hexToRgb(homeTint);
  const awayRgb = hexToRgb(awayTint);

  const cssVars: React.CSSProperties = useMemo(
    () => ({
      ['--mcHomeR' as any]: String(homeRgb.r),
      ['--mcHomeG' as any]: String(homeRgb.g),
      ['--mcHomeB' as any]: String(homeRgb.b),
      ['--mcAwayR' as any]: String(awayRgb.r),
      ['--mcAwayG' as any]: String(awayRgb.g),
      ['--mcAwayB' as any]: String(awayRgb.b),
    }),
    [homeRgb, awayRgb]
  );

  const round = model?.round ?? 0;
  const dateText = model?.dateText ?? 'TBC';
  const venue = model?.venue ?? 'TBC';
  const status = model?.statusLabel ?? '—';
  const margin = model?.margin ?? 0;
  const hasTripleDigitScore = Math.max(home?.score ?? 0, away?.score ?? 0) >= 100;
  const hasBothTripleDigitScores = (home?.score ?? 0) >= 100 && (away?.score ?? 0) >= 100;

  // Status pill styling
  const statusDot =
    status === 'FULL TIME'
      ? 'mcHero__dot--final'
      : status === 'LIVE'
        ? 'mcHero__dot--live'
        : 'mcHero__dot--upcoming';

  return (
    <section className="mcHero" style={cssVars}>
      <div className="mcHero__halo" />

      {/* Back button */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mcHero__back"
          aria-label="Back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}

      <div className="mcHero__content">
        {/* Round + Date */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mcHero__header"
        >
          <span className="mcHero__round">ROUND {round}</span>
          <span className="mcHero__date">{dateText}</span>
        </motion.div>

        {/* Team Logos + Scores */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.08 }}
          className="mcHero__main"
        >
          {/* HOME */}
          <div className="mcHero__side">
            <div className="mcHero__logoBox">
              <SmartImg
                src={homeLogo}
                alt={home?.fullName || 'Home'}
                className="mcHero__logo"
                fallbackText={home?.abbreviation || 'H'}
              />
            </div>
            <span className="mcHero__teamName">{home?.fullName || (loading ? '—' : '—')}</span>
          </div>

          {/* SCORES */}
          <div
            className={`mcHero__scores${hasTripleDigitScore ? ' mcHero__scores--compact' : ''}${hasBothTripleDigitScores ? ' mcHero__scores--compactBoth' : ''}`}
          >
            <div className="mcHero__scoreLine">
              <span className="mcHero__score">{home?.score || 0}</span>
              <span className="mcHero__dash">–</span>
              <span className="mcHero__score">{away?.score || 0}</span>
            </div>
            <div className="mcHero__minors">
              <span className="mcHero__minor">{home ? `${home.goals}.${home.behinds}` : '0.0'}</span>
              <span className="mcHero__pipe">|</span>
              <span className="mcHero__minor">{away ? `${away.goals}.${away.behinds}` : '0.0'}</span>
            </div>
          </div>

          {/* AWAY */}
          <div className="mcHero__side">
            <div className="mcHero__logoBox">
              <SmartImg
                src={awayLogo}
                alt={away?.fullName || 'Away'}
                className="mcHero__logo"
                fallbackText={away?.abbreviation || 'A'}
              />
            </div>
            <span className="mcHero__teamName">{away?.fullName || (loading ? '—' : '—')}</span>
          </div>
        </motion.div>

        {/* Status + Venue */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.16 }}
          className="mcHero__footer"
        >
          <div className="mcHero__statusPill">
            <span className={`mcHero__dot ${statusDot}`} />
            <span className="mcHero__statusText">{status}</span>
          </div>
          <p className="mcHero__venueText">
            {venue}
            {status === 'FULL TIME' && home && away ? <> • {home.fullName} by {margin}</> : null}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
