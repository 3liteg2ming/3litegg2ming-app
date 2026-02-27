import { useMemo } from 'react';
import { assetUrl, TEAM_ASSETS, type TeamKey } from '@/lib/teamAssets';
import SmartImg from '@/components/SmartImg';
import type { MatchCentreModel } from '@/lib/matchCentreRepo';
import '@/styles/match-centre-momentum.css';

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

export default function MatchTimeline({ model, loading }: { model: MatchCentreModel | null; loading?: boolean }) {
  const home = model?.home;
  const away = model?.away;

  const homeKey = home ? slugToTeamKey(home.slug) : null;
  const awayKey = away ? slugToTeamKey(away.slug) : null;

  const homeLogo =
    home?.logoUrl ||
    (homeKey ? assetUrl(TEAM_ASSETS[homeKey].logoFile ?? '') : '');

  const awayLogo =
    away?.logoUrl ||
    (awayKey ? assetUrl(TEAM_ASSETS[awayKey].logoFile ?? '') : '');

  const progression = model?.quarterProgression || [];
  const wormData = useMemo(() => {
    if (!progression.length) return null;
    const points = progression.map((q) => ({ q: q.q, diff: q.home - q.away }));
    const maxAbs = Math.max(1, ...points.map((p) => Math.abs(p.diff)));
    const width = 520;
    const height = 120;
    const padX = 12;
    const padY = 12;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2;
    const stepX = innerW / Math.max(1, points.length - 1);

    const toXY = (diff: number, idx: number) => {
      const x = padX + idx * stepX;
      const y = padY + innerH * (0.5 - (diff / (maxAbs * 2)));
      return { x, y };
    };

    const homePts = [{ x: padX, y: padY + innerH / 2 }, ...points.map((p, i) => toXY(p.diff, i))];
    const awayPts = [{ x: padX, y: padY + innerH / 2 }, ...points.map((p, i) => toXY(-p.diff, i))];

    const toPath = (pts: Array<{ x: number; y: number }>) =>
      pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

    return {
      width,
      height,
      homePath: toPath(homePts),
      awayPath: toPath(awayPts),
      markers: points.map((p, i) => ({ ...toXY(p.diff, i), q: p.q, diff: p.diff })),
    };
  }, [progression]);

  return (
    <section className="mcMomentum">
      <div className="mcMomentum__header">
        <h2 className="mcMomentum__title">Momentum Worm</h2>
        <p className="mcMomentum__desc">Score progression through quarters</p>
      </div>

      <div className="mcMomentum__card">
        {/* Quarter backgrounds */}
        <div className="mcMomentum__quarters">
          {['Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => (
            <div key={i} className="mcMomentum__quarter">
              <span className="mcMomentum__quarterLabel">{q}</span>
            </div>
          ))}
        </div>

        {/* Main worm chart area */}
        <div className="mcMomentum__chartContainer">
          {/* Team logos (left & right) */}
          <div className="mcMomentum__logoLeft">
            {homeLogo && (
              <SmartImg
                src={homeLogo}
                alt={home?.fullName || 'Home'}
                className="mcMomentum__logoImg"
                fallbackText={home?.abbreviation || 'H'}
              />
            )}
          </div>

          <div className="mcMomentum__worm">
            {/* Centre midline */}
            <div className="mcMomentum__midline" />

            {/* Placeholder message */}
            {loading || !model ? (
              <div className="mcMomentum__placeholder">
                <div className="mcMomentum__placeholderDot" />
              </div>
            ) : wormData ? (
              <div className="mcMomentum__wormSvgWrap">
                <svg
                  className="mcMomentum__svg"
                  viewBox={`0 0 ${wormData.width} ${wormData.height}`}
                  preserveAspectRatio="none"
                  aria-label="Momentum worm chart"
                >
                  <defs>
                    <linearGradient id="mcWormHome" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="rgba(255,210,24,0.95)" />
                      <stop offset="100%" stopColor="rgba(255,210,24,0.6)" />
                    </linearGradient>
                    <linearGradient id="mcWormAway" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="rgba(123,214,255,0.95)" />
                      <stop offset="100%" stopColor="rgba(123,214,255,0.6)" />
                    </linearGradient>
                  </defs>

                  <path d={wormData.homePath} className="mcMomentum__wormLine mcMomentum__wormLine--home" />
                  <path d={wormData.awayPath} className="mcMomentum__wormLine mcMomentum__wormLine--away" />

                  {wormData.markers.map((m, i) => (
                    <g key={m.q}>
                      <circle cx={m.x} cy={m.y} r={i === wormData.markers.length - 1 ? 3.6 : 2.6} className="mcMomentum__marker" />
                    </g>
                  ))}
                </svg>
              </div>
            ) : (
              <div className="mcMomentum__placeholder">
                <p className="mcMomentum__placeholderText">
                  {model?.statusLabel === 'FULL TIME'
                    ? 'Match finished'
                    : 'Quarter data coming'}
                </p>
              </div>
            )}
          </div>

          <div className="mcMomentum__logoRight">
            {awayLogo && (
              <SmartImg
                src={awayLogo}
                alt={away?.fullName || 'Away'}
                className="mcMomentum__logoImg"
                fallbackText={away?.abbreviation || 'A'}
              />
            )}
          </div>
        </div>

        {/* Team names below */}
        <div className="mcMomentum__legend">
          <div className="mcMomentum__legendTeam">
            <span className="mcMomentum__legendLabel">{home?.fullName || '—'}</span>
          </div>
          <div className="mcMomentum__legendTeam" style={{ textAlign: 'right' }}>
            <span className="mcMomentum__legendLabel">{away?.fullName || '—'}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
