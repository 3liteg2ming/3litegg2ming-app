import { useMemo, useRef, useState } from 'react';
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

  const fallbackLeaders = useMemo(() => {
    if (!model) return [];
    const rows = Array.isArray(model.playerStats) ? model.playerStats : [];
    const homeRows = rows.filter((p) => p.team === model.home.fullName);
    const awayRows = rows.filter((p) => p.team === model.away.fullName);
    const categories = ['GOALS', 'DISPOSALS', 'TACKLES'];
    return categories.map((cat) => {
      const homePick = pickSeeded(homeRows, `${model.fixtureId}:${cat}:home`) || homeRows[0] || null;
      const awayPick = pickSeeded(awayRows, `${model.fixtureId}:${cat}:away`) || awayRows[0] || null;
      return {
        stat: cat,
        home: {
          value: 0,
          player: homePick?.name || 'Awaiting coach submission',
          team: model.home.fullName,
          photoUrl: homePick?.photoUrl,
          seasonAvg: null,
        },
        away: {
          value: 0,
          player: awayPick?.name || 'Awaiting coach submission',
          team: model.away.fullName,
          photoUrl: awayPick?.photoUrl,
          seasonAvg: null,
        },
      };
    });
  }, [model]);

  const leaders = (model?.leaders && model.leaders.length > 0) ? model.leaders : fallbackLeaders;
  const awaitingSubmission = !!model && !model.hasSubmissionData;
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
        <p className="mcLeaders__desc">
          {awaitingSubmission ? 'Awaiting coach submission' : 'Top performers this match'}
        </p>
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
              <LeaderCard key={i} leader={leader} model={model} isLoading={!!loading && !model} />
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
  const homeTeam = model?.home;
  const awayTeam = model?.away;
  const awaitingSubmission = !!model && !model.hasSubmissionData;

  const homeKey = homeTeam ? slugToTeamKey(homeTeam.slug) : null;
  const awayKey = awayTeam ? slugToTeamKey(awayTeam.slug) : null;
  const homeAsset = homeKey ? TEAM_ASSETS[homeKey] : null;
  const awayAsset = awayKey ? TEAM_ASSETS[awayKey] : null;

  const homeColor = homeTeam?.color || '#0B3A8D';
  const awayColor = awayTeam?.color || '#8A1C2B';
  const rgbColor = hexToRgb(homeColor);

  const cssVars: React.CSSProperties = useMemo(
    () => ({
      ['--mlR' as any]: String(rgbColor.r),
      ['--mlG' as any]: String(rgbColor.g),
      ['--mlB' as any]: String(rgbColor.b),
    }),
    [rgbColor]
  );

  const homeLogo =
    homeTeam?.logoUrl || (homeAsset ? assetUrl(homeAsset.logoFile ?? '') : assetUrl('elite-gaming-logo.png'));
  const awayLogo =
    awayTeam?.logoUrl || (awayAsset ? assetUrl(awayAsset.logoFile ?? '') : assetUrl('elite-gaming-logo.png'));
  const badge = String(leader?.stat || 'STAT').toUpperCase();

  const homeValue = isLoading || awaitingSubmission ? '—' : leader?.home?.value ?? 0;
  const awayValue = isLoading || awaitingSubmission ? '—' : leader?.away?.value ?? 0;
  const homeName = isLoading ? 'Loading…' : leader?.home?.player || 'Awaiting coach submission';
  const awayName = isLoading ? 'Loading…' : leader?.away?.player || 'Awaiting coach submission';
  const homeSub = isLoading ? '—' : leader?.home?.team || homeTeam?.fullName || '';
  const awaySub = isLoading ? '—' : leader?.away?.team || awayTeam?.fullName || '';
  const homePhoto = leader?.home?.photoUrl;
  const awayPhoto = leader?.away?.photoUrl;

  return (
    <div className="mcLeaderCard" style={cssVars}>
      {/* Watermark logo background */}
      <div className="mcLeaderCard__watermark">
        <SmartImg
          key={`leaders-mark-${homeLogo}`}
          src={homeLogo}
          alt={homeTeam?.fullName || ''}
          className="mcLeaderCard__watermarkImg"
          fallbackText={homeTeam?.abbreviation || ''}
        />
      </div>

      {/* Stat label bar */}
      <div className="mcLeaderCard__bar">
        <span className="mcLeaderCard__barText">{badge}</span>
        <div className="mcLeaderCard__barLogos">
          <SmartImg
            key={`leaders-bar-home-${homeLogo}`}
            src={homeLogo}
            alt={homeTeam?.fullName || ''}
            className="mcLeaderCard__crest"
            fallbackText={homeTeam?.abbreviation || ''}
          />
          <SmartImg
            key={`leaders-bar-away-${awayLogo}`}
            src={awayLogo}
            alt={awayTeam?.fullName || ''}
            className="mcLeaderCard__crest"
            fallbackText={awayTeam?.abbreviation || ''}
          />
        </div>
      </div>

      <div className="mcLeaderCard__content mcLeaderCard__content--split">
        <div className="mcLeaderSide" style={{ ['--lsR' as any]: String(hexToRgb(homeColor).r), ['--lsG' as any]: String(hexToRgb(homeColor).g), ['--lsB' as any]: String(hexToRgb(homeColor).b) }}>
          <div className="mcLeaderSide__head">
            <span className="mcLeaderSide__label">{homeTeam?.name || 'Home'}</span>
            <span className="mcLeaderSide__value">{homeValue}</span>
          </div>
          <div className="mcLeaderSide__body">
            {homePhoto ? (
              <img src={homePhoto} alt={homeName} className="mcLeaderSide__photo" />
            ) : (
              <SmartImg
                key={`leaders-ph-home-${homeLogo}`}
                src={homeLogo}
                alt={homeTeam?.fullName || ''}
                className="mcLeaderSide__photoFallback"
                fallbackText={(homeName[0] || 'H').toUpperCase()}
              />
            )}
            <div className="mcLeaderSide__meta">
              <p className="mcLeaderSide__name">{homeName}</p>
              <p className="mcLeaderSide__sub">{homeSub}</p>
            </div>
          </div>
        </div>

        <div className="mcLeaderSide mcLeaderSide--away" style={{ ['--lsR' as any]: String(hexToRgb(awayColor).r), ['--lsG' as any]: String(hexToRgb(awayColor).g), ['--lsB' as any]: String(hexToRgb(awayColor).b) }}>
          <div className="mcLeaderSide__head">
            <span className="mcLeaderSide__label">{awayTeam?.name || 'Away'}</span>
            <span className="mcLeaderSide__value">{awayValue}</span>
          </div>
          <div className="mcLeaderSide__body">
            {awayPhoto ? (
              <img src={awayPhoto} alt={awayName} className="mcLeaderSide__photo" />
            ) : (
              <SmartImg
                key={`leaders-ph-away-${awayLogo}`}
                src={awayLogo}
                alt={awayTeam?.fullName || ''}
                className="mcLeaderSide__photoFallback"
                fallbackText={(awayName[0] || 'A').toUpperCase()}
              />
            )}
            <div className="mcLeaderSide__meta">
              <p className="mcLeaderSide__name">{awayName}</p>
              <p className="mcLeaderSide__sub">{awaySub}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
