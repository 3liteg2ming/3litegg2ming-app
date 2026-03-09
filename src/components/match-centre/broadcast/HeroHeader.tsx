import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import SmartImg from '@/components/SmartImg';
import { TEAM_ASSETS, type TeamKey } from '@/lib/teamAssets';
import type { MatchCentreModel } from '@/lib/matchCentreRepo';
import { resolveTeamKey, resolveTeamLogoUrl } from '@/lib/entityResolvers';
import '@/styles/fixture-broadcast-shared.css';
import '@/styles/match-centre-hero.css';

type Props = {
  onBack?: () => void;
  model: MatchCentreModel | null;
  loading?: boolean;
};

function slugToTeamKey(slug: string): TeamKey | null {
  if (!String(slug || '').trim()) return null;
  const key = resolveTeamKey({ slug });
  return TEAM_ASSETS[key] ? key : null;
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
  if (!key) return '#1D4ED8';
  if (String(key) === 'collingwood') return '#B88A00';
  if (String(key) === 'adelaide') return '#C81E2A';

  const candidates: any[] = [asset?.glow, asset?.accent, asset?.tint, asset?.primary];
  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('#') && (c.length === 7 || c.length === 4)) return c;
  }
  return asset?.colour || '#1D4ED8';
}

function getStatusTone(statusLabel: string, trustState?: string) {
  const trust = String(trustState || '').toLowerCase();
  const status = String(statusLabel || '').toLowerCase();

  if (trust === 'verified') return 'verified';
  if (trust === 'corrected') return 'corrected';
  if (trust === 'disputed') return 'disputed';
  if (trust === 'submitted') return 'submitted';

  if (status === 'final' || status === 'full time') return 'final';
  if (status === 'live') return 'live';
  return 'upcoming';
}

function abbreviation(teamName?: string, fallback = 'TBC') {
  const raw = String(teamName || '').trim();
  if (!raw) return fallback;
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0] || ''}${words[1][0] || ''}`.toUpperCase();
  return raw.slice(0, 3).toUpperCase();
}

export default function HeroHeader({ onBack, model, loading }: Props) {
  const home = model?.home;
  const away = model?.away;

  const homeKey = home ? slugToTeamKey(home.slug) : null;
  const awayKey = away ? slugToTeamKey(away.slug) : null;

  const homeAsset = homeKey ? TEAM_ASSETS[homeKey] : null;
  const awayAsset = awayKey ? TEAM_ASSETS[awayKey] : null;

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
    [homeRgb, awayRgb],
  );

  const statusLabel = model?.statusLabel || (loading ? 'LOADING' : 'UPCOMING');
  const trust = model?.trust;
  const tone = getStatusTone(statusLabel, trust?.state);
  const statusText = trust?.label || statusLabel;

  const isUpcoming = statusLabel === 'UPCOMING';
  const hasScoreValues = Number.isFinite(home?.score) && Number.isFinite(away?.score) && ((home?.score || 0) > 0 || (away?.score || 0) > 0);
  const showScore = !isUpcoming || hasScoreValues;

  const homeScore = showScore ? String(home?.score ?? 0) : '—';
  const awayScore = showScore ? String(away?.score ?? 0) : '—';
  const hasTripleDigits = showScore && (Number(homeScore) >= 100 || Number(awayScore) >= 100);

  const round = model?.round ?? 0;
  const dateText = model?.dateText || 'Time TBA';
  const venue = model?.venue || 'Venue TBA';

  const homeAbbr = home?.abbreviation || home?.shortName || abbreviation(home?.fullName, 'H');
  const awayAbbr = away?.abbreviation || away?.shortName || abbreviation(away?.fullName, 'A');

  return (
    <section className={`mcHero mcHero--${tone}`} style={cssVars}>
      <div className="mcHero__atmo" aria-hidden="true" />

      <div className="mcHero__ghostScore" aria-hidden="true">
        {showScore ? `${homeScore} ${awayScore}` : 'VS'}
      </div>

      {onBack ? (
        <button type="button" onClick={onBack} className="mcHero__back" aria-label="Back">
          <ChevronLeft size={20} />
        </button>
      ) : null}

      <div className="mcHero__inner">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mcHero__metaTop"
        >
          <span className="mcHero__round">ROUND {round || '—'}</span>
          <span className="mcHero__metaDot" aria-hidden="true">•</span>
          <span className="mcHero__date">{dateText}</span>
          <span className="mcHero__metaDot" aria-hidden="true">•</span>
          <span className="mcHero__venue">{venue}</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, delay: 0.05 }}
          className="mcHero__main"
        >
          <div className="mcHero__team mcHero__team--home">
            <div className="mcHero__logoFrame fxBroadcastLogoFrame">
              <SmartImg
                src={homeLogo}
                alt={home?.fullName || 'Home'}
                className="mcHero__logo fxSafeLogo"
                fallbackText={homeAbbr}
              />
            </div>
            <div className="mcHero__teamName">{home?.fullName || 'Home Team'}</div>
            <div className="mcHero__teamAbbr">{homeAbbr}</div>
          </div>

          <div className={`mcHero__scoreWrap ${hasTripleDigits ? 'is-compact' : ''}`}>
            <div className="mcHero__statusPill">
              <span className={`mcHero__statusDot mcHero__statusDot--${tone}`} />
              <span className="mcHero__statusLabel">{statusText}</span>
            </div>

            <div className="mcHero__scoreLine">
              <span className="mcHero__score fxMetalText">{homeScore}</span>
              <span className="mcHero__scoreDash">-</span>
              <span className="mcHero__score fxMetalText">{awayScore}</span>
            </div>

            <div className="mcHero__minorLine">
              <span className="mcHero__minorVal">{home ? `${home.goals}.${home.behinds}` : '—.—'}</span>
              <span className="mcHero__minorSep" aria-hidden="true">|</span>
              <span className="mcHero__minorVal">{away ? `${away.goals}.${away.behinds}` : '—.—'}</span>
            </div>
          </div>

          <div className="mcHero__team mcHero__team--away">
            <div className="mcHero__logoFrame fxBroadcastLogoFrame">
              <SmartImg
                src={awayLogo}
                alt={away?.fullName || 'Away'}
                className="mcHero__logo fxSafeLogo"
                fallbackText={awayAbbr}
              />
            </div>
            <div className="mcHero__teamName">{away?.fullName || 'Away Team'}</div>
            <div className="mcHero__teamAbbr">{awayAbbr}</div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
