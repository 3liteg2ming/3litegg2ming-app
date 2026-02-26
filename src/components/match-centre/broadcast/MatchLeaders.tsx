import { useMemo, useRef, useState } from 'react';
import { assetUrl, TEAM_ASSETS, type TeamKey } from '@/lib/teamAssets';
import SmartImg from '@/components/SmartImg';
import type { MatchCentreModel } from '@/lib/matchCentreRepo';
import '@/styles/match-centre-leaders.css';

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

export default function MatchLeaders({ model, loading }: { model: MatchCentreModel | null; loading?: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const leaders = model?.leaders || [];
  const isEmpty = !loading && leaders.length === 0;

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const scrollLeft = scrollRef.current.scrollLeft;
    const cardWidth = scrollRef.current.children[0]?.clientWidth || 300;
    setActiveIdx(Math.round(scrollLeft / (cardWidth + 20)));
  };

  const scrollTo = (idx: number) => {
    if (!scrollRef.current) return;
    const cardWidth = scrollRef.current.children[0]?.clientWidth || 300;
    scrollRef.current.scrollTo({ left: idx * (cardWidth + 20), behavior: 'smooth' });
  };

  return (
    <section className="mcLeaders">
      <div className="mcLeaders__header">
        <h2 className="mcLeaders__title">Match Leaders</h2>
        <p className="mcLeaders__desc">Top performers this match</p>
      </div>

      {isEmpty ? (
        <div className="mcLeaders__empty">
          <div className="mcLeaders__emptyText">No submissions yet</div>
          <p className="mcLeaders__emptyDesc">Stats will appear once submitted</p>
        </div>
      ) : (
        <>
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="mcLeaders__scroll"
          >
            {(loading && !model ? Array.from({ length: 3 }) : leaders).map((leader: any, i: number) => (
              <LeaderCard key={i} leader={leader} model={model} isLoading={loading && !model} />
            ))}
          </div>

          <div className="mcLeaders__dots">
            {(loading && !model ? Array.from({ length: 3 }) : leaders).map((_: any, i: number) => (
              <button
                key={i}
                onClick={() => scrollTo(i)}
                className={`mcLeaders__dot ${i === activeIdx ? 'mcLeaders__dot--active' : ''}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function LeaderCard({ leader, model, isLoading }: { leader: any; model: MatchCentreModel | null; isLoading: boolean }) {
  const teamName = leader?.team || '';
  const isHome = teamName && model?.home?.fullName ? teamName === model.home.fullName : true;

  const team = isHome ? model?.home : model?.away;
  const teamKey = team ? slugToTeamKey(team.slug) : null;
  const teamAsset = teamKey ? TEAM_ASSETS[teamKey] : null;

  const teamColor = team?.color || '#0B3A8D';
  const rgbColor = hexToRgb(teamColor);

  const cssVars: React.CSSProperties = useMemo(
    () => ({
      ['--mlR' as any]: String(rgbColor.r),
      ['--mlG' as any]: String(rgbColor.g),
      ['--mlB' as any]: String(rgbColor.b),
    }),
    [rgbColor]
  );

  const logoUrl = team?.logoUrl || (teamAsset ? assetUrl(teamAsset.logoFile) : undefined);
  const statValue = isLoading ? '—' : leader?.matchTotal ?? 0;
  const playerName = isLoading ? 'Loading…' : leader?.player || '—';
  const [firstName, ...lastNameParts] = String(playerName).split(' ');
  const lastName = lastNameParts.join(' ').toUpperCase();

  return (
    <div className="mcLeaderCard" style={cssVars}>
      {/* Watermark logo background */}
      <div className="mcLeaderCard__watermark">
        {logoUrl && (
          <SmartImg
            src={logoUrl}
            alt={team?.fullName || ''}
            className="mcLeaderCard__watermarkImg"
            fallbackText={team?.abbreviation || ''}
          />
        )}
      </div>

      {/* Stat label bar */}
      <div className="mcLeaderCard__bar">
        <span className="mcLeaderCard__barText">{isLoading ? '—' : leader?.stat || 'STAT'}</span>
      </div>

      {/* Content grid: left (text) + right (photo) */}
      <div className="mcLeaderCard__content">
        <div className="mcLeaderCard__left">
          {/* Match total */}
          <div className="mcLeaderCard__stat">
            <p className="mcLeaderCard__statLabel">Match Total</p>
            <p className="mcLeaderCard__statValue">{statValue}</p>
          </div>

          {/* Season average */}
          <div className="mcLeaderCard__season">
            <span className="mcLeaderCard__seasonLabel">Season Avg</span>
            <span className="mcLeaderCard__seasonValue">{isLoading ? '—' : leader?.seasonAvg ?? '—'}</span>
          </div>

          {/* Player name */}
          <div className="mcLeaderCard__player">
            <p className="mcLeaderCard__firstName">{firstName}</p>
            <p className="mcLeaderCard__lastName">{lastName}</p>
            {leader?.position && <p className="mcLeaderCard__role">{leader.position}</p>}
          </div>
        </div>

        {/* Right: player photo */}
        <div className="mcLeaderCard__right">
          {leader?.photoUrl ? (
            <img
              src={leader.photoUrl}
              alt={playerName}
              className="mcLeaderCard__photo"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="mcLeaderCard__placeholder">
              <span className="mcLeaderCard__placeholderText">{firstName.slice(0, 1)}{lastName.slice(0, 1)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
