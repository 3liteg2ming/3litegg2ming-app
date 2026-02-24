import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import SmartImg from '@/components/SmartImg';
import type { MatchCentreModel, PlayerStatRow } from '@/lib/matchCentreRepo';
import '@/styles/match-centre-player-stats.css';

type SortKey = keyof PlayerStatRow;
type SortDir = 'asc' | 'desc';

const statColumns: { key: SortKey; label: string }[] = [
  { key: 'AF', label: 'AF' },
  { key: 'G', label: 'G' },
  { key: 'B', label: 'B' },
  { key: 'D', label: 'D' },
  { key: 'K', label: 'K' },
  { key: 'H', label: 'H' },
  { key: 'M', label: 'M' },
  { key: 'T', label: 'T' },
  { key: 'HO', label: 'HO' },
  { key: 'CLR', label: 'CLR' },
  { key: 'MG', label: 'MG' },
  { key: 'GA', label: 'GA' },
  { key: 'TOG', label: 'ToG%' },
];

function initials(name: string) {
  const parts = name.trim().split(' ').filter(Boolean);
  const a = parts[0]?.[0] ?? '';
  const b = parts[parts.length - 1]?.[0] ?? '';
  return (a + b).toUpperCase();
}

export default function PlayerStatsTable({ model, loading }: { model: MatchCentreModel | null; loading?: boolean }) {
  const homeName = model?.home?.fullName || 'Home';
  const awayName = model?.away?.fullName || 'Away';

  const teamOptions = useMemo(() => ['Both', homeName, awayName], [homeName, awayName]);

  const [teamFilter, setTeamFilter] = useState<string>('Both');
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('G');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [viewMode, setViewMode] = useState<'match' | 'season'>('match');

  const base = model?.playerStats || [];

  const filtered = useMemo(() => {
    let data = [...base];
    if (teamFilter !== 'Both') data = data.filter((p) => p.team === teamFilter);

    data.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'desc' ? bv - av : av - bv;
      }
      return String(av).localeCompare(String(bv)) * (sortDir === 'desc' ? -1 : 1);
    });

    return data;
  }, [base, teamFilter, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  return (
    <section className="mcPlayerStats">
      <div className="mcPlayerStats__header">
        <h2 className="mcPlayerStats__title">Player Stats</h2>
        <p className="mcPlayerStats__desc">Detailed match breakdown</p>
      </div>

      {/* Controls */}
      <div className="mcPlayerStats__controls">
        <div className="mcPlayerStats__left">
          <div className="mcPlayerStats__filterDropdown">
            <label className="mcPlayerStats__label">Teams</label>
            <div className="mcPlayerStats__dropdownButton" onClick={() => setShowTeamDropdown((s) => !s)}>
              <span>{teamFilter}</span>
              <ChevronDown className="mcPlayerStats__dropdownIcon" />
            </div>

            {showTeamDropdown && (
              <div className="mcPlayerStats__dropdownMenu">
                {teamOptions.map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setTeamFilter(t);
                      setShowTeamDropdown(false);
                    }}
                    className={`mcPlayerStats__dropdownItem ${teamFilter === t ? 'mcPlayerStats__dropdownItem--active' : ''}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mcPlayerStats__right">
          <div className="mcPlayerStats__toggle">
            <button
              onClick={() => setViewMode('match')}
              className={`mcPlayerStats__toggleBtn ${viewMode === 'match' ? 'mcPlayerStats__toggleBtn--active' : ''}`}
            >
              Match
            </button>
            <button
              onClick={() => setViewMode('season')}
              className={`mcPlayerStats__toggleBtn ${viewMode === 'season' ? 'mcPlayerStats__toggleBtn--active' : ''}`}
            >
              Season
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="mcPlayerStats__tableWrapper">
        {loading && !model ? (
          <div className="mcPlayerStats__placeholder">
            <div className="mcPlayerStats__placeholderText">Loading player stats…</div>
            <p className="mcPlayerStats__placeholderDesc">Fetching match centre data.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mcPlayerStats__placeholder">
            <div className="mcPlayerStats__placeholderText">No player stats yet</div>
            <p className="mcPlayerStats__placeholderDesc">
              This will populate after match submissions (goal kickers + OCR stats).
            </p>
          </div>
        ) : (
          <div className="mcPlayerStats__scroll">
            <table className="mcPlayerStats__table">
              <thead className="mcPlayerStats__head">
                <tr className="mcPlayerStats__headerRow">
                  <th className="mcPlayerStats__headerCell mcPlayerStats__headerCell--number">#</th>
                  <th className="mcPlayerStats__headerCell mcPlayerStats__headerCell--player">Player</th>
                  {statColumns.map((col) => (
                    <th
                      key={col.key}
                      className="mcPlayerStats__headerCell mcPlayerStats__headerCell--stat"
                      onClick={() => handleSort(col.key)}
                    >
                      <span>{col.label}</span>
                      {sortKey === col.key && (
                        <span className="mcPlayerStats__sortIndicator">
                          {sortDir === 'asc' ? '▲' : '▼'}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="mcPlayerStats__body">
                {filtered.map((player) => {
                  const isHome = player.team === homeName;
                  const badgeColor = isHome ? (model?.home?.color || '#4a7fe1') : (model?.away?.color || '#e14a4a');

                  const first = player.name.split(' ')[0] ?? player.name;
                  const last = player.name.split(' ').slice(1).join(' ');

                  return (
                    <tr
                      key={`${player.name}-${player.team}`}
                      className="mcPlayerStats__row"
                    >
                      <td className="mcPlayerStats__cell mcPlayerStats__cell--number">
                        <span className="mcPlayerStats__badge" style={{ background: badgeColor }}>
                          {player.number || '—'}
                        </span>
                      </td>

                      <td className="mcPlayerStats__cell mcPlayerStats__cell--player">
                        <div className="mcPlayerStats__playerInfo">
                          <div className="mcPlayerStats__avatar">
                            {player.photoUrl ? (
                              <SmartImg
                                src={player.photoUrl}
                                alt={player.name}
                                className="mcPlayerStats__avatarImg"
                                fallbackText={initials(player.name)}
                              />
                            ) : (
                              <span className="mcPlayerStats__avatarFallback">{initials(player.name)}</span>
                            )}
                          </div>

                          <div className="mcPlayerStats__playerName">
                            <span className="mcPlayerStats__firstName">{first}</span>
                            <span className="mcPlayerStats__lastName">{last}</span>
                          </div>
                        </div>
                      </td>

                      {statColumns.map((col) => (
                        <td key={col.key} className="mcPlayerStats__cell mcPlayerStats__cell--stat">
                          <span className="mcPlayerStats__statValue">
                            {viewMode === 'match' ? (player[col.key] as number) : (player[col.key] as number)}
                          </span>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
