import SmartImg from '@/components/SmartImg';
import KeyMatchStats from '@/components/match-centre/broadcast/KeyMatchStats';
import MatchLeaders from '@/components/match-centre/broadcast/MatchLeaders';
import WormGraph from '@/components/match-centre/broadcast/WormGraph';
import type { MatchCentreModel } from '@/lib/matchCentreRepo';
import { resolveTeamKey, resolveTeamLogoUrl } from '@/lib/entityResolvers';
import { TEAM_ASSETS, type TeamKey } from '@/lib/teamAssets';
import '@/styles/mc-summary.css';

type Props = {
  model: MatchCentreModel | null;
  loading?: boolean;
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
  if (words.length >= 2) return `${words[0]?.[0] || ''}${words[1]?.[0] || ''}`.toUpperCase();
  return raw.slice(0, 3).toUpperCase();
}

export default function MatchSummaryTab({ model, loading }: Props) {
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

  const progression = model?.quarterProgression || [];
  const isLoadingShell = !!loading && !model;
  const hasProgression = progression.length > 0;
  const wormDescription = hasProgression
    ? 'Score progression through the published result.'
    : 'Momentum worm publishes here once live scoring data arrives.';
  const waitingLabel = isLoadingShell
    ? 'Preparing the momentum worm.'
    : model?.hasSubmissionData
      ? 'Published scoring detail is still settling in.'
      : 'Momentum worm publishes here on match day.';

  const homeAbbr = home?.abbreviation || home?.shortName || abbreviation(home?.fullName, 'H');
  const awayAbbr = away?.abbreviation || away?.shortName || abbreviation(away?.fullName, 'A');

  return (
    <section className="mcSummaryTab">
      <div className="mcSummaryTab__section mcSummaryTab__section--worm">
        <div className="mcSummaryTab__header">
          <h2 className="mcSummaryTab__title">Momentum Worm</h2>
          <p className="mcSummaryTab__subtext">{wormDescription}</p>
        </div>

        <div className="mcSummaryTab__wormCard">
          <div className="mcSummaryTab__quarters">
            {['Q1', 'Q2', 'Q3', 'Q4'].map((quarter) => (
              <span key={quarter} className="mcSummaryTab__quarter">
                {quarter}
              </span>
            ))}
          </div>

          <div className="mcSummaryTab__wormBody">
            <div className="mcSummaryTab__crestWrap">
              <SmartImg src={homeLogo} alt={home?.fullName || 'Home'} className="mcSummaryTab__crest" fallbackText={homeAbbr} />
            </div>

            <div className="mcSummaryTab__chart">
              <div className="mcSummaryTab__chartMidline" aria-hidden="true" />
              <WormGraph progression={progression} waitingLabel={waitingLabel} />
            </div>

            <div className="mcSummaryTab__crestWrap">
              <SmartImg src={awayLogo} alt={away?.fullName || 'Away'} className="mcSummaryTab__crest" fallbackText={awayAbbr} />
            </div>
          </div>

          <div className="mcSummaryTab__legend">
            <span className="mcSummaryTab__legendItem" title={home?.fullName || 'Home Team'}>
              {home?.fullName || 'Home Team'}
            </span>
            <span className="mcSummaryTab__legendItem mcSummaryTab__legendItem--away" title={away?.fullName || 'Away Team'}>
              {away?.fullName || 'Away Team'}
            </span>
          </div>
        </div>
      </div>

      <div className="mcSummaryTab__section mcSummaryTab__section--leaders">
        <div className="mcSummaryTab__header">
          <h2 className="mcSummaryTab__title">Match Leaders</h2>
          <p className="mcSummaryTab__subtext">Top performers across key individual metrics.</p>
        </div>
        <MatchLeaders model={model} loading={loading} />
      </div>

      <div className="mcSummaryTab__section mcSummaryTab__section--stats">
        <div className="mcSummaryTab__header">
          <h2 className="mcSummaryTab__title">Key Match Stats</h2>
          <p className="mcSummaryTab__subtext">A team-by-team comparison of important stats.</p>
        </div>
        <KeyMatchStats model={model} loading={loading} />
      </div>
    </section>
  );
}
