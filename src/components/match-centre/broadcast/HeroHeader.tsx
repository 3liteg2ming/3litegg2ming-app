import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import SmartImg from '@/components/SmartImg';
import { TEAM_ASSETS, type TeamKey } from '@/lib/teamAssets';
import type { MatchCentreModel } from '@/lib/matchCentreRepo';
import { resolveTeamKey, resolveTeamLogoUrl } from '@/lib/entityResolvers';
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

  if (trust === 'live') return 'final';
  if (trust === 'corrected') return 'corrected';
  if (trust === 'disputed') return 'disputed';

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

function hasMeaningfulVenue(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  const upper = raw.toUpperCase();
  return upper !== 'TBA' && upper !== 'TBC' && upper !== 'VENUE TBA';
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
  const isLoadingShell = !!loading && !model;
  const isUpcoming = statusLabel === 'UPCOMING';
  const hasScoreValues =
    Number.isFinite(home?.score) &&
    Number.isFinite(away?.score) &&
    ((home?.score || 0) > 0 || (away?.score || 0) > 0);
  const showScore = !isLoadingShell && (!isUpcoming || hasScoreValues);
  const showMinor =
    showScore &&
    Number.isFinite(home?.goals) &&
    Number.isFinite(home?.behinds) &&
    Number.isFinite(away?.goals) &&
    Number.isFinite(away?.behinds) &&
    ((home?.goals || 0) + (home?.behinds || 0) + (away?.goals || 0) + (away?.behinds || 0) > 0);

  const statusText = isLoadingShell ? 'Loading' : statusLabel === 'FINAL' ? 'Final' : trust?.label || statusLabel;
  const homeScore = showScore ? String(home?.score ?? 0) : '—';
  const awayScore = showScore ? String(away?.score ?? 0) : '—';
  const hasTripleDigits = showScore && (Number(homeScore) >= 100 || Number(awayScore) >= 100);
  const homeMinor = showMinor ? `${home?.goals}.${home?.behinds}` : '';
  const awayMinor = showMinor ? `${away?.goals}.${away?.behinds}` : '';

  const round = model?.round ?? 0;
  const dateText = String(model?.dateText || '').trim();
  const venue = String(model?.venue || '').trim();
  const hasDateText = Boolean(dateText && dateText.toUpperCase() !== 'TIME TBA');
  const hasVenue = hasMeaningfulVenue(venue);

  const homeAbbr = home?.abbreviation || home?.shortName || abbreviation(home?.fullName, 'H');
  const awayAbbr = away?.abbreviation || away?.shortName || abbreviation(away?.fullName, 'A');

  const scheduledHint = isLoadingShell
    ? 'Fetching fixture details'
    : hasDateText && hasVenue
      ? `${dateText} • ${venue}`
      : hasDateText
        ? dateText
        : hasVenue
          ? venue
          : 'Line-ups and the live result publish here on match day';

  const metaParts = [round ? `Round ${round}` : '', hasDateText ? dateText : '', hasVenue ? venue : ''].filter(Boolean);
  const showGhostScore = showScore && statusLabel === 'FINAL';

  return (
    <section className={`mcHero mcHero--${tone}`} style={cssVars}>
      <div className="mcHero__atmo" aria-hidden="true" />

      {showGhostScore ? (
        <div className="mcHero__ghostScore" aria-hidden="true">
          {`${homeScore} ${awayScore}`}
        </div>
      ) : null}

      {onBack ? (
        <button type="button" onClick={onBack} className="mcHero__back" aria-label="Back">
          <ChevronLeft size={20} />
        </button>
      ) : null}

      <div className="mcHero__inner">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24 }}
          className="mcHero__metaTop"
        >
          {metaParts.length ? (
            metaParts.map((part, index) => (
              <span key={`${part}-${index}`} className={index === 0 ? 'mcHero__round' : index === 1 && hasDateText ? 'mcHero__date' : 'mcHero__venue'}>
                {index > 0 ? <span className="mcHero__metaDot" aria-hidden="true">•</span> : null}
                {part}
              </span>
            ))
          ) : (
            <span className="mcHero__round">{isLoadingShell ? 'Match Centre' : 'Fixture'}</span>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.03 }}
          className="mcHero__main"
        >
          <div className="mcHero__team mcHero__team--home">
            <div className="mcHero__logoFrame">
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

          <div className="mcHero__centre">
            <div className="mcHero__statusPill">
              <span className={`mcHero__statusDot mcHero__statusDot--${tone}`} />
              <span className="mcHero__statusLabel">{statusText}</span>
            </div>

            {showScore ? (
              <div className={`mcHero__scoreWrap ${hasTripleDigits ? 'is-compact' : ''}`}>
                <div className="mcHero__scoreLine">
                  <span className="mcHero__score fxMetalText">{homeScore}</span>
                  <span className="mcHero__scoreDash">-</span>
                  <span className="mcHero__score fxMetalText">{awayScore}</span>
                </div>

                {showMinor ? (
                  <div className="mcHero__minorLine">
                    <span className="mcHero__minorVal">{homeMinor}</span>
                    <span className="mcHero__minorSep" aria-hidden="true">|</span>
                    <span className="mcHero__minorVal">{awayMinor}</span>
                  </div>
                ) : null}

                {scheduledHint && !showMinor ? <div className="mcHero__scoreMeta">{scheduledHint}</div> : null}
              </div>
            ) : (
              <div className="mcHero__statusDeck">
                <div className="mcHero__statusHeadline">
                  {isLoadingShell ? 'Loading fixture' : 'Match Scheduled'}
                </div>
                <div className="mcHero__statusHint">{scheduledHint}</div>
              </div>
            )}
          </div>

          <div className="mcHero__team mcHero__team--away">
            <div className="mcHero__logoFrame">
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
