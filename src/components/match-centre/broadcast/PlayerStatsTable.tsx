import { type KeyboardEvent, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import SmartImg from '@/components/SmartImg';
import type { MatchCentreModel, PlayerStatRow } from '@/lib/matchCentreRepo';
import '@/styles/match-centre-player-stats.css';

type SortKey = 'D' | 'K' | 'H' | 'M' | 'T' | 'CLR';
type SortDir = 'asc' | 'desc';

const statColumns: { key: SortKey; label: string; optional?: boolean }[] = [
  { key: 'D', label: 'D' },
  { key: 'M', label: 'M' },
  { key: 'T', label: 'T' },
  { key: 'CLR', label: 'CLR' },
  { key: 'K', label: 'K', optional: true },
  { key: 'H', label: 'H', optional: true },
];

function initials(name: string) {
  const parts = name.trim().split(' ').filter(Boolean);
  const a = parts[0]?.[0] ?? '';
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : parts[0]?.[1] ?? '';
  return (a + b).toUpperCase();
}

function numOrNegInf(v: number | null | undefined) {
  if (v === null || v === undefined) return -Infinity;
  const n = Number(v);
  return Number.isFinite(n) ? n : -Infinity;
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

export default function PlayerStatsTable({ model }: { model: MatchCentreModel | null }) {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<SortKey>('D');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const hasOptionalColumn = useMemo(() => {
    const rows = model?.playerStats || [];
    return {
      K: rows.some((r) => r.K !== null && r.K !== undefined),
      H: rows.some((r) => r.H !== null && r.H !== undefined),
    };
  }, [model?.playerStats]);

  const columns = useMemo(() => {
    return statColumns.filter((c) => {
      if (!c.optional) return true;
      if (c.key === 'K') return hasOptionalColumn.K;
      if (c.key === 'H') return hasOptionalColumn.H;
      return true;
    });
  }, [hasOptionalColumn]);

  const rows = useMemo(() => {
    const list = (model?.playerStats || []).slice();

    list.sort((a, b) => {
      const av = numOrNegInf((a as any)[sortKey]);
      const bv = numOrNegInf((b as any)[sortKey]);
      if (av !== bv) return sortDir === 'desc' ? bv - av : av - bv;

      if (a.team !== b.team) return a.team.localeCompare(b.team);
      if (a.number !== b.number) return a.number - b.number;
      return a.name.localeCompare(b.name);
    });

    return list;
  }, [model?.playerStats, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
      return;
    }
    setSortKey(key);
    setSortDir('desc');
  };

  const handleRowClick = (row: PlayerStatRow) => {
    if (!isUuidLike(row.playerId)) return;
    navigate(`/player/${row.playerId}`);
  };

  const handleRowKeyDown = (e: KeyboardEvent<HTMLTableRowElement>, row: PlayerStatRow) => {
    if (!isUuidLike(row.playerId)) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      navigate(`/player/${row.playerId}`);
    }
  };

  return (
    <div className="mc-playerstats">
      <div className="mc-playerstats__header">
        <div className="mc-playerstats__title">PLAYER STATS</div>

        <div className="mc-playerstats__sort">
          <button className="mc-playerstats__sortBtn" type="button">
            SORT <ChevronDown size={16} />
          </button>
          <div className="mc-playerstats__sortGrid">
            {columns.map((c) => (
              <button
                key={c.key}
                className={`mc-playerstats__sortOpt ${sortKey === c.key ? 'is-active' : ''}`}
                type="button"
                onClick={() => handleSort(c.key)}
              >
                {c.label}
                {sortKey === c.key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mc-playerstats__tableWrap">
        <table className="mc-playerstats__table">
          <thead>
            <tr>
              <th className="mc-playerstats__colPlayer">PLAYER</th>
              {columns.map((c) => (
                <th key={c.key} className="mc-playerstats__colStat">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r: PlayerStatRow, idx: number) => {
              const rowClickable = isUuidLike(r.playerId);
              return (
                <tr
                  key={`${r.playerId || r.name}-${idx}`}
                  onClick={rowClickable ? () => handleRowClick(r) : undefined}
                  onKeyDown={(e) => handleRowKeyDown(e, r)}
                  role={rowClickable ? 'button' : undefined}
                  tabIndex={rowClickable ? 0 : undefined}
                  aria-label={rowClickable ? `View ${r.name} profile` : undefined}
                >
                  <td className="mc-playerstats__playerCell">
                    <div className="mc-playerstats__player">
                      <div className="mc-playerstats__avatar">
                        {r.photoUrl ? (
                          <SmartImg src={r.photoUrl} alt={r.name} />
                        ) : (
                          <div className="mc-playerstats__avatarFallback">{initials(r.name)}</div>
                        )}
                      </div>
                      <div className="mc-playerstats__meta">
                        <div className="mc-playerstats__nameRow">
                          <span className="mc-playerstats__name">{r.name}</span>
                          {r.number ? <span className="mc-playerstats__number">#{r.number}</span> : null}
                        </div>
                        <div className="mc-playerstats__subRow">
                          <span className="mc-playerstats__team">{r.team}</span>
                          {r.position ? <span className="mc-playerstats__pos">{r.position}</span> : null}
                        </div>
                      </div>
                    </div>
                  </td>

                  {columns.map((c) => (
                    <td key={c.key} className="mc-playerstats__statCell">
                      {((r as any)[c.key] ?? '—') === null ? '—' : ((r as any)[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              );
            })}

            {rows.length === 0 ? (
              <tr>
                <td className="mc-playerstats__empty" colSpan={1 + columns.length}>
                  No player stats yet. Submit the OCR stat pack to populate this table.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
