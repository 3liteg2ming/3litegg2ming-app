// src/components/match-centre/WormTimelineCard.tsx
import { Activity, LayoutGrid, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';

export default function WormTimelineCard({
  home,
  away,
  getTeamLogo,
  lineColor = '#0B4B94',
}: {
  home: any;
  away: any;
  getTeamLogo: (t: any) => string;
  lineColor?: string;
}) {
  const [mode, setMode] = useState<'worm' | 'grid'>('worm');

  // Sample “lead” worm values (wire to real data later)
  const points = useMemo(() => {
    const base = [0, 2, 4, 6, 5, 8, 10, 7, 9, 12, 15, 13, 16, 18, 17, 20, 22, 25, 27, 30, 33, 35, 34, 36];
    return base.map((v, i) => v + Math.sin(i / 3) * 2);
  }, []);

  const w = 1000;
  const h = 380;
  const pad = 60;
  const mid = h / 2;

  const maxAbs = 45;
  const xStep = (w - pad * 2) / (points.length - 1);

  const path = points
    .map((v, i) => {
      const x = pad + i * xStep;
      const y = mid - (v / maxAbs) * (mid - pad);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  const homeLogo = getTeamLogo(home);
  const awayLogo = getTeamLogo(away);

  return (
    <section className="mc-section">
      <div className="mc-card mc-timelineCard">
        <div className="mc-timelineHeader">
          <div className="mc-h2">Timeline</div>
          <button className="mc-linkBtn" type="button">
            Full Timeline <ChevronRight size={18} />
          </button>
        </div>

        <div className="mc-timelineModes">
          <button
            className={mode === 'worm' ? 'mc-modeBtn is-active' : 'mc-modeBtn'}
            onClick={() => setMode('worm')}
            type="button"
            aria-label="Worm"
          >
            <Activity size={18} />
          </button>
          <button
            className={mode === 'grid' ? 'mc-modeBtn is-active' : 'mc-modeBtn'}
            onClick={() => setMode('grid')}
            type="button"
            aria-label="Grid"
          >
            <LayoutGrid size={18} />
          </button>
        </div>

        <div className="mc-wormWrap">
          <div className="mc-wormSide mc-wormSideLeft">
            <img src={homeLogo} alt="" className="mc-wormTeamLogo" />
            <img src={awayLogo} alt="" className="mc-wormTeamLogo is-bottom" />
          </div>

          <div className="mc-wormChart">
            <svg viewBox={`0 0 ${w} ${h}`} className="mc-wormSvg" role="img" aria-label="Match timeline worm">
              {/* Quarter bands */}
              {[0, 1, 2, 3].map((q) => {
                const x = pad + (q * (w - pad * 2)) / 4;
                const qw = (w - pad * 2) / 4;
                return (
                  <g key={q}>
                    <rect
                      x={x}
                      y={pad}
                      width={qw}
                      height={h - pad * 2}
                      fill={q % 2 === 0 ? 'rgba(0,0,0,0.02)' : 'rgba(0,0,0,0.00)'}
                    />
                    <text
                      x={x + qw / 2}
                      y={mid + 52}
                      textAnchor="middle"
                      fontSize="96"
                      fill="rgba(0,0,0,0.06)"
                      fontFamily="ui-serif, Georgia, 'Times New Roman', serif"
                      fontWeight="800"
                    >
                      Q{q + 1}
                    </text>
                  </g>
                );
              })}

              {/* Grid */}
              {Array.from({ length: 7 }).map((_, i) => {
                const y = pad + (i * (h - pad * 2)) / 6;
                return <line key={i} x1={pad} x2={w - pad} y1={y} y2={y} stroke="rgba(0,0,0,0.10)" strokeWidth="1" />;
              })}

              {/* Midline */}
              <line x1={pad} x2={w - pad} y1={mid} y2={mid} stroke="rgba(0,0,0,0.14)" strokeWidth="2" />

              {/* Worm */}
              <path d={path} fill="none" stroke={lineColor} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <div className="mc-wormSide mc-wormSideRight">
            <img src={homeLogo} alt="" className="mc-wormTeamLogo" />
            <img src={awayLogo} alt="" className="mc-wormTeamLogo is-bottom" />
          </div>
        </div>
      </div>
    </section>
  );
}
