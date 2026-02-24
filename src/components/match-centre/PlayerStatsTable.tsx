// src/components/match-centre/PlayerStatsTable.tsx
import { ChevronDown } from 'lucide-react';

export type PlayerStatRow = {
  guernsey: number;
  playerName: string;
  photoUrl?: string;

  AF: number;
  G: number;
  B: number;
  D: number;
  K: number;
  H: number;
  M: number;
  T: number;
  HO: number;
  CLR: number;
  MG: number;
  GA: number;
  ToG: number;
};

export default function PlayerStatsTable({
  title,
  subtitle,
  rows,
  onImgError,
}: {
  title: string;
  subtitle?: string;
  rows: PlayerStatRow[];
  onImgError?: (e: any) => void;
}) {
  return (
    <section className="mc-section">
      <div className="mc-card mc-playerCard">
        <div className="mc-playerHeader">
          <div className="mc-h1 mc-playerTitle">
            ★ {title}
          </div>
          {subtitle ? <div className="mc-subtitle">{subtitle}</div> : null}
        </div>

        <div className="mc-playerFilters">
          <div className="mc-filter">
            <div className="mc-filterLabel">Stats</div>
            <div className="mc-filterValue">
              Basic <ChevronDown size={16} />
            </div>
          </div>
          <div className="mc-filter">
            <div className="mc-filterLabel">Teams</div>
            <div className="mc-filterValue">
              Both <ChevronDown size={16} />
            </div>
          </div>

          <div className="mc-toggleRight">
            <button className="mc-pillBtn is-active" type="button">
              Match
            </button>
            <button className="mc-pillBtn" type="button">
              Season avg.
            </button>
          </div>
        </div>

        <div className="mc-tableWrap">
          <table className="mc-table">
            <thead>
              <tr>
                <th className="mc-thNum">#</th>
                <th className="mc-thPlayer">
                  Player <span className="mc-sort">▲</span>
                </th>
                {['AF', 'G', 'B', 'D', 'K', 'H', 'M', 'T', 'HO', 'CLR', 'MG', 'GA', 'ToG%'].map((c) => (
                  <th key={c} className="mc-th">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.playerName}-${r.guernsey}`}>
                  <td className="mc-tdNum">
                    <div className="mc-numBadge">{r.guernsey}</div>
                  </td>
                  <td className="mc-tdPlayer">
                    <div className="mc-playerCell">
                      <div className="mc-headshot">
                        {r.photoUrl ? (
                          <img src={r.photoUrl} alt={r.playerName} onError={onImgError} />
                        ) : (
                          <div className="mc-headshotPh" />
                        )}
                      </div>
                      <div className="mc-playerName">{r.playerName}</div>
                    </div>
                  </td>
                  <td className="mc-td">{r.AF}</td>
                  <td className="mc-td">{r.G}</td>
                  <td className="mc-td">{r.B}</td>
                  <td className="mc-td">{r.D}</td>
                  <td className="mc-td">{r.K}</td>
                  <td className="mc-td">{r.H}</td>
                  <td className="mc-td">{r.M}</td>
                  <td className="mc-td">{r.T}</td>
                  <td className="mc-td">{r.HO}</td>
                  <td className="mc-td">{r.CLR}</td>
                  <td className="mc-td">{r.MG}</td>
                  <td className="mc-td">{r.GA}</td>
                  <td className="mc-td">{r.ToG}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
