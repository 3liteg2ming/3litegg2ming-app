import { assetUrl, TEAM_ASSETS, type TeamKey } from '@/lib/teamAssets';
import SmartImg from '@/components/SmartImg';
import type { MatchCentreModel } from '@/lib/matchCentreRepo';
import WormGraph from '@/components/match-centre/broadcast/WormGraph';
import '@/styles/match-centre-momentum.css';

function slugToTeamKey(slug: string): TeamKey | null {
  const normalized = String(slug || '').toLowerCase().trim();
  const keys = Object.keys(TEAM_ASSETS) as TeamKey[];
  if (keys.includes(normalized as TeamKey)) return normalized as TeamKey;
  const compact = normalized.replace(/[^a-z0-9]/g, '');
  if (keys.includes(compact as TeamKey)) return compact as TeamKey;
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

export default function MatchTimeline({ model, loading }: { model: MatchCentreModel | null; loading?: boolean }) {
  const home = model?.home;
  const away = model?.away;

  const homeKey = home ? slugToTeamKey(home.slug) : null;
  const awayKey = away ? slugToTeamKey(away.slug) : null;

  const homeLogo = home?.logoUrl || (homeKey ? assetUrl(TEAM_ASSETS[homeKey].logoFile ?? '') : assetUrl('elite-gaming-logo.png'));
  const awayLogo = away?.logoUrl || (awayKey ? assetUrl(TEAM_ASSETS[awayKey].logoFile ?? '') : assetUrl('elite-gaming-logo.png'));

  const progression = model?.quarterProgression || [];
  const isLoadingShell = !!loading && !model;
  const hasProgression = progression.length > 0;
  const wormDesc = hasProgression
    ? 'Score progression through the published result.'
    : 'Momentum worm publishes here once live scoring data arrives.';
  const waitingLabel = isLoadingShell
    ? 'Preparing the momentum worm.'
    : model?.hasSubmissionData
      ? 'Published scoring detail is still settling in.'
      : 'Momentum worm publishes here on match day.';

  return (
    <section className="mcMomentum">
      <div className="mcMomentum__header">
        <h2 className="mcMomentum__title">Momentum Worm</h2>
        <p className="mcMomentum__desc">{wormDesc}</p>
      </div>

      <div className="mcMomentum__card">
        <div className="mcMomentum__quarters">
          {['Q1', 'Q2', 'Q3', 'Q4'].map((quarter) => (
            <div key={quarter} className="mcMomentum__quarter">
              <span className="mcMomentum__quarterLabel">{quarter}</span>
            </div>
          ))}
        </div>

        <div className="mcMomentum__chartContainer">
          <div className="mcMomentum__logoLeft">
            <SmartImg
              key={`timeline-home-${homeLogo}`}
              src={homeLogo}
              alt={home?.fullName || 'Home'}
              className="mcMomentum__logoImg"
              fallbackText={home?.abbreviation || 'H'}
            />
          </div>

          <div className="mcMomentum__worm">
            <div className="mcMomentum__midline" />
            <WormGraph progression={progression} waitingLabel={waitingLabel} />
          </div>

          <div className="mcMomentum__logoRight">
            <SmartImg
              key={`timeline-away-${awayLogo}`}
              src={awayLogo}
              alt={away?.fullName || 'Away'}
              className="mcMomentum__logoImg"
              fallbackText={away?.abbreviation || 'A'}
            />
          </div>
        </div>

        <div className="mcMomentum__legend">
          <div className="mcMomentum__legendTeam">
            <span className="mcMomentum__legendLabel">{home?.fullName || 'Home Team'}</span>
          </div>
          <div className="mcMomentum__legendTeam">
            <span className="mcMomentum__legendLabel">{away?.fullName || 'Away Team'}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
