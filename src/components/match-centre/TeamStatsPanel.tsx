// src/components/match-centre/TeamStatsPanel.tsx
export type TeamStatRow = {
  label: string;
  home: number;
  away: number;

  // Optional season context (used in broadcast layout)
  homeAvg?: number;
  homeTotal?: number;
  awayAvg?: number;
  awayTotal?: number;

  isPercent?: boolean;
};

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

export default function TeamStatsPanel({
  title,
  homeName,
  awayName,
  homeLogo,
  awayLogo,
  homeColor,
  awayColor,
  rows,
  onImgError,
}: {
  title: string;
  homeKey?: any;
  awayKey?: any;
  homeName: string;
  awayName: string;
  homeLogo: string;
  awayLogo: string;
  homeColor: string;
  awayColor: string;
  rows: TeamStatRow[];
  onImgError?: (e: any) => void;
}) {
  return (
    <section className="mc-section">
      <div className="mc-card mc-teamCard">
        <div className="mc-teamHeader">
          <div className="mc-h1">▮▮ {title}</div>
          <div className="mc-subtitle">See how the teams are performing...</div>
        </div>

        <div className="mc-teamLogos">
          <img className="mc-teamLogo" src={homeLogo} alt={homeName} onError={onImgError as any} />
          <img className="mc-teamLogo" src={awayLogo} alt={awayName} onError={onImgError as any} />
        </div>

        <div className="mc-teamTitle">Disposals</div>
        <div className="mc-teamDivider" />

        {rows.map((r, idx) => {
          const max = Math.max(Number(r.home) || 0, Number(r.away) || 0, 1);
          const hPct = (Number(r.home) / max) * 100;
          const aPct = (Number(r.away) / max) * 100;

          const isPct = !!r.isPercent;

          return (
            <div className="mc-statRow" key={`${r.label}-${idx}`}>
              <div className="mc-statLabel">{r.label}</div>

              <div className="mc-statGrid">
                <div className="mc-statSide">
                  {typeof r.homeAvg === 'number' ? (
                    <div>
                      <strong>{r.homeAvg}</strong> <span>2025 AVG.</span>
                    </div>
                  ) : null}
                  {typeof r.homeTotal === 'number' ? (
                    <div>
                      <strong>{r.homeTotal}</strong> <span>2025 TOTAL</span>
                    </div>
                  ) : null}
                </div>

                <div className="mc-statMatch">
                  <div className="mc-statBig">{r.home}</div>

                  {isPct ? (
                    <div className="mc-ringRow">
                      <div className="mc-ring" style={{ ['--p' as any]: `${clamp01(Number(r.home))}%`, background: `conic-gradient(${homeColor} ${clamp01(Number(r.home))}%, rgba(0,0,0,.08) 0)` }}>
                        <div className="mc-ringInner">{r.home}%</div>
                      </div>
                      <div className="mc-ring" style={{ ['--p' as any]: `${clamp01(Number(r.away))}%`, background: `conic-gradient(${awayColor} ${clamp01(Number(r.away))}%, rgba(0,0,0,.08) 0)` }}>
                        <div className="mc-ringInner">{r.away}%</div>
                      </div>
                    </div>
                  ) : (
                    <div className="mc-bars" aria-label="Comparison bars">
                      <div className="mc-bar" aria-label={`${homeName} bar`}>
                        <div className="mc-barFill" style={{ height: `${hPct}%`, background: homeColor }} />
                      </div>
                      <div className="mc-bar" aria-label={`${awayName} bar`}>
                        <div className="mc-barFill" style={{ height: `${aPct}%`, background: awayColor }} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="mc-statSide" style={{ textAlign: 'right' }}>
                  {typeof r.awayAvg === 'number' ? (
                    <div>
                      <span>2025 AVG.</span> <strong>{r.awayAvg}</strong>
                    </div>
                  ) : null}
                  {typeof r.awayTotal === 'number' ? (
                    <div>
                      <span>2025 TOTAL</span> <strong>{r.awayTotal}</strong>
                    </div>
                  ) : null}
                  <div className="mc-statBig" style={{ fontSize: 56, marginTop: 8 }}>
                    {r.away}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
