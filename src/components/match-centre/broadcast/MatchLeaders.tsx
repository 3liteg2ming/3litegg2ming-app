import { assetUrl, TEAM_ASSETS, type TeamKey } from '@/lib/teamAssets';
import SmartImg from '@/components/SmartImg';
import type { MatchCentreModel } from '@/lib/matchCentreRepo';
import '@/styles/match-centre-leaders.css';

function stableHash(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h >>> 0);
}

function pickSeeded<T>(rows: T[], seed: string): T | null {
  if (!rows.length) return null;
  return rows[stableHash(seed) % rows.length] || rows[0] || null;
}

function slugToTeamKey(slug: string): TeamKey | null {
  const s = String(slug || '').toLowerCase().trim();
  const keys = Object.keys(TEAM_ASSETS) as TeamKey[];
  if (keys.includes(s as TeamKey)) return s as TeamKey;
  const compact = s.replace(/[^a-z0-9]/g, '');
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

function initials(name: string) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? '';
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : parts[0]?.[1] ?? '';
  return (a + b).toUpperCase() || 'EG';
}

export default function MatchLeaders({ model, loading }: { model: MatchCentreModel | null; loading?: boolean }) {
  const fallbackLeaders = !model
    ? []
    : ['GOALS', 'DISPOSALS', 'TACKLES'].map((cat) => {
        const rows = Array.isArray(model.playerStats) ? model.playerStats : [];
        const homeRows = rows.filter((p) => p.team === model.home.fullName);
        const awayRows = rows.filter((p) => p.team === model.away.fullName);
        const homePick = pickSeeded(homeRows, `${model.fixtureId}:${cat}:home`) || homeRows[0] || null;
        const awayPick = pickSeeded(awayRows, `${model.fixtureId}:${cat}:away`) || awayRows[0] || null;
        return {
          stat: cat,
          home: {
            value: 0,
            player: homePick?.name || 'Squad ready',
            team: model.home.fullName,
            photoUrl: homePick?.photoUrl,
            seasonAvg: null,
          },
          away: {
            value: 0,
            player: awayPick?.name || 'Squad ready',
            team: model.away.fullName,
            photoUrl: awayPick?.photoUrl,
            seasonAvg: null,
          },
        };
      });

  const leaders = model?.leaders?.length ? model.leaders : fallbackLeaders;
  const awaitingSubmission = !!model && !model.hasSubmissionData;
  const isLoadingShell = !!loading && !model;
  const isEmpty = !loading && leaders.length === 0;

  return (
    <section className="mcLeaders">
      <div className="mcLeaders__header">
        <h2 className="mcLeaders__title">Match Leaders</h2>
        <p className="mcLeaders__desc">
          {awaitingSubmission ? 'Squads are live. Match leaders will publish after a result is submitted.' : 'Top performers from the published result.'}
        </p>
      </div>

      {isLoadingShell ? (
        <div className="mcLeaders__empty">
          <div className="mcLeaders__emptyText">Loading match leaders…</div>
          <p className="mcLeaders__emptyDesc">Player leaders will appear as soon as the fixture feed resolves.</p>
        </div>
      ) : isEmpty ? (
        <div className="mcLeaders__empty">
          <div className="mcLeaders__emptyText">No leaders available yet</div>
          <p className="mcLeaders__emptyDesc">Once a result includes player stats, this section updates automatically.</p>
        </div>
      ) : (
        <div className="mcLeaders__grid">
          {leaders.slice(0, 3).map((leader: any, i: number) => (
            <LeaderCard key={leader?.stat || i} leader={leader} model={model} isLoading={false} awaitingSubmission={awaitingSubmission} />
          ))}
        </div>
      )}
    </section>
  );
}

function LeaderCard({
  leader,
  model,
  isLoading,
  awaitingSubmission,
}: {
  leader: any;
  model: MatchCentreModel | null;
  isLoading: boolean;
  awaitingSubmission: boolean;
}) {
  const homeTeam = model?.home;
  const awayTeam = model?.away;

  const homeKey = homeTeam ? slugToTeamKey(homeTeam.slug) : null;
  const awayKey = awayTeam ? slugToTeamKey(awayTeam.slug) : null;

  const homeLogo = homeTeam?.logoUrl || (homeKey ? assetUrl(TEAM_ASSETS[homeKey].logoFile ?? '') : assetUrl('elite-gaming-logo.png'));
  const awayLogo = awayTeam?.logoUrl || (awayKey ? assetUrl(TEAM_ASSETS[awayKey].logoFile ?? '') : assetUrl('elite-gaming-logo.png'));

  const homeValue = isLoading || awaitingSubmission ? '—' : String(leader?.home?.value ?? 0);
  const awayValue = isLoading || awaitingSubmission ? '—' : String(leader?.away?.value ?? 0);
  const homeName = isLoading ? 'Loading…' : String(leader?.home?.player || 'Squad ready');
  const awayName = isLoading ? 'Loading…' : String(leader?.away?.player || 'Squad ready');
  const homeSub = isLoading ? '—' : String(leader?.home?.team || homeTeam?.fullName || '');
  const awaySub = isLoading ? '—' : String(leader?.away?.team || awayTeam?.fullName || '');

  return (
    <article className="mcLeaderCard">
      <div className="mcLeaderCard__head">
        <span className="mcLeaderCard__stat">{String(leader?.stat || 'Stat')}</span>
      </div>

      <div className="mcLeaderCard__split">
        <div className="mcLeaderCard__side">
          <div className="mcLeaderCard__sideHead">
            <SmartImg src={homeLogo} alt={homeTeam?.fullName || 'Home'} className="mcLeaderCard__crest" fallbackText={homeTeam?.abbreviation || 'H'} />
            <span>{homeTeam?.abbreviation || homeTeam?.shortName || 'HOME'}</span>
          </div>
          <div className="mcLeaderCard__value">{homeValue}</div>
          <div className="mcLeaderCard__person">
            <div className="mcLeaderCard__avatar">
              {leader?.home?.photoUrl ? (
                <img src={leader.home.photoUrl} alt={homeName} className="mcLeaderCard__avatarImg" />
              ) : (
                <div className="mcLeaderCard__avatarFallback">{initials(homeName)}</div>
              )}
            </div>
            <div className="mcLeaderCard__meta">
              <div className="mcLeaderCard__name">{homeName}</div>
              <div className="mcLeaderCard__sub">{homeSub}</div>
            </div>
          </div>
        </div>

        <div className="mcLeaderCard__divider" aria-hidden="true" />

        <div className="mcLeaderCard__side mcLeaderCard__side--away">
          <div className="mcLeaderCard__sideHead">
            <SmartImg src={awayLogo} alt={awayTeam?.fullName || 'Away'} className="mcLeaderCard__crest" fallbackText={awayTeam?.abbreviation || 'A'} />
            <span>{awayTeam?.abbreviation || awayTeam?.shortName || 'AWAY'}</span>
          </div>
          <div className="mcLeaderCard__value">{awayValue}</div>
          <div className="mcLeaderCard__person">
            <div className="mcLeaderCard__avatar">
              {leader?.away?.photoUrl ? (
                <img src={leader.away.photoUrl} alt={awayName} className="mcLeaderCard__avatarImg" />
              ) : (
                <div className="mcLeaderCard__avatarFallback">{initials(awayName)}</div>
              )}
            </div>
            <div className="mcLeaderCard__meta">
              <div className="mcLeaderCard__name">{awayName}</div>
              <div className="mcLeaderCard__sub">{awaySub}</div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
