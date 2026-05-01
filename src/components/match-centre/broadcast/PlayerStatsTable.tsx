import { type CSSProperties, useEffect, useMemo, useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';

import type { MatchCentreModel, PlayerStatRow } from '@/lib/matchCentreRepo';
import { resolveKnownPlayerHeadshot } from '@/lib/playerHeadshots';
import '@/styles/mc-player-table.css';

type TeamFilter = 'all' | 'home' | 'away';
type SortKey = 'FP' | 'G' | 'D' | 'K' | 'H' | 'M' | 'T' | 'HO';
type SortDirection = 'desc' | 'asc';

type PlayerDisplayRow = {
  key: string;
  row: PlayerStatRow;
  teamKey: 'home' | 'away';
};

type StatColumn = {
  key: SortKey;
  label: string;
  getValue: (row: PlayerStatRow) => number;
};

const STAT_COLUMNS: StatColumn[] = [
  { key: 'FP', label: 'FP', getValue: fantasyPoints },
  { key: 'G', label: 'G', getValue: (row) => safeStat(row.G) },
  { key: 'D', label: 'D', getValue: (row) => safeStat(row.D) },
  { key: 'K', label: 'K', getValue: (row) => safeStat(row.K) },
  { key: 'H', label: 'H', getValue: (row) => safeStat(row.H) },
  { key: 'M', label: 'M', getValue: (row) => safeStat(row.M) },
  { key: 'T', label: 'T', getValue: (row) => safeStat(row.T) },
  { key: 'HO', label: 'HO', getValue: (row) => safeStat(row.HO) },
];

function initials(name: string) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const second = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : parts[0]?.[1] ?? '';
  return (first + second).toUpperCase() || 'EG';
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function safeStat(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function fantasyPoints(row: PlayerStatRow) {
  if (row.FP !== null && row.FP !== undefined) return safeStat(row.FP);
  return safeStat(row.D) + safeStat(row.M) * 3 + safeStat(row.T) * 4 + safeStat(row.G) * 6;
}

function normalizeText(value?: string | null) {
  return String(value || '').trim().toLowerCase();
}

function resolveSideKey(row: PlayerStatRow, model: MatchCentreModel): 'home' | 'away' {
  const rowTeamId = String(row.teamId || '').trim();
  const homeTeamId = String(model.home.id || '').trim();
  const awayTeamId = String(model.away.id || '').trim();

  if (rowTeamId && awayTeamId && rowTeamId === awayTeamId) return 'away';
  if (rowTeamId && homeTeamId && rowTeamId === homeTeamId) return 'home';

  const rowTeam = normalizeText(row.team);
  if (rowTeam && rowTeam === normalizeText(model.away.fullName)) return 'away';
  if (rowTeam && rowTeam === normalizeText(model.home.fullName)) return 'home';

  return 'home';
}

function PlayerStatsTableComponent({ model }: { model: MatchCentreModel | null }) {
  const navigate = useNavigate();
  const [teamFilter, setTeamFilter] = useState<TeamFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('FP');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const playerRows = model?.playerStats ?? [];

  if (import.meta.env.DEV) {
    console.log('[PlayerStatsTable] incoming data', {
      modelExists: !!model,
      playerRowsCount: playerRows.length,
      homeTeam: model?.home.fullName,
      awayTeam: model?.away.fullName,
      homeCount: playerRows.filter(r => r.team === model?.home.fullName).length,
      awayCount: playerRows.filter(r => r.team === model?.away.fullName).length,
    });
  }

  const rowsByTeam = useMemo(() => {
    if (!model) {
      return {
        home: [] as PlayerStatRow[],
        away: [] as PlayerStatRow[],
      };
    }

    return playerRows.reduce(
      (acc, row) => {
        const teamKey = resolveSideKey(row, model);
        acc[teamKey].push(row);
        return acc;
      },
      {
        home: [] as PlayerStatRow[],
        away: [] as PlayerStatRow[],
      },
    );
  }, [model, playerRows]);

  if (import.meta.env.DEV) {
    console.log('[PlayerStatsTable] rowsByTeam after split', {
      homeCount: rowsByTeam.home.length,
      awayCount: rowsByTeam.away.length,
    });
  }

  const displayRows = useMemo<PlayerDisplayRow[]>(() => {
    if (!model) return [];

    const homeRows = rowsByTeam.home.map((row, index) => ({
      key: `${row.playerId || row.name}-home-${index}`,
      row,
      teamKey: 'home' as const,
      originalIndex: index,
    }));

    const awayRows = rowsByTeam.away.map((row, index) => ({
      key: `${row.playerId || row.name}-away-${index}`,
      row,
      teamKey: 'away' as const,
      originalIndex: rowsByTeam.home.length + index,
    }));

    const filtered = teamFilter === 'home' ? homeRows : teamFilter === 'away' ? awayRows : [...homeRows, ...awayRows];
    const activeColumn = STAT_COLUMNS.find((column) => column.key === sortKey) ?? STAT_COLUMNS[0];
    const hasSortableStats = filtered.some((item) => activeColumn.getValue(item.row) > 0);

    if (import.meta.env.DEV) {
    const allRowsUnfiltered = [...homeRows, ...awayRows];
    console.log('[PlayerStatsTable] rows debug', {
      incomingRowsCount: playerRows.length,
      homeRowsCount: homeRows.length,
      awayRowsCount: awayRows.length,
      allRowsUnfiltered: allRowsUnfiltered.length,
      teamFilter,
      filteredRowsForTab: filtered.length,
      hasSortableStats,
    });
  }

    if (!hasSortableStats) {
      return filtered.map(({ originalIndex: _originalIndex, ...item }) => item);
    }

    return [...filtered]
      .sort((a, b) => {
        const diff =
          sortDirection === 'desc'
            ? activeColumn.getValue(b.row) - activeColumn.getValue(a.row)
            : activeColumn.getValue(a.row) - activeColumn.getValue(b.row);

        if (diff !== 0) return diff;
        return a.originalIndex - b.originalIndex;
      })
      .map(({ originalIndex: _originalIndex, ...item }) => item);
  }, [model, rowsByTeam.away, rowsByTeam.home, sortDirection, sortKey, teamFilter]);

  if (import.meta.env.DEV) {
    console.log('[PlayerStatsTable] FINAL displayRows', {
      count: displayRows.length,
      empty: displayRows.length === 0,
      sample: displayRows.slice(0, 3).map(d => ({ name: d.row.name, team: d.row.team })),
    });
  }

  const filters = [
    { key: 'all' as const, label: 'All' },
    { key: 'home' as const, label: model?.home.abbreviation || 'Home' },
    { key: 'away' as const, label: model?.away.abbreviation || 'Away' },
  ];

  return (
    <section className="mcPlayerTable" aria-label="Player stats">
      <div className="mcPlayerTable__header">
        <div className="mcPlayerTable__titleBlock">
          <h2 className="mcPlayerTable__title">Player Stats</h2>
          <p className="mcPlayerTable__subtext">Sort by tapping a stat column. Player names stay wider on mobile for easier scanning.</p>
        </div>

        <div className="mcPlayerTable__filters" aria-label="Filter player stats by team">
          {filters.map((option) => {
            const isActive = option.key === teamFilter;
            return (
              <button
                key={option.key}
                type="button"
                className={`mcPlayerTable__filter ${isActive ? 'mcPlayerTable__filter--active' : ''}`}
                onClick={() => setTeamFilter(option.key)}
                aria-pressed={isActive}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {!model ? (
        <div className="mcPlayerTable__empty">Loading player stats...</div>
      ) : displayRows.length === 0 ? (
        <div className="mcPlayerTable__empty">Player stats are not available for this fixture yet.</div>
      ) : (
        <div className="mcPlayerTable__shell">
          <table className="mcPlayerTable__table">
            <thead>
              <tr>
                <th scope="col" className="mcPlayerTable__headCell mcPlayerTable__headCell--player">
                  Player
                </th>
                {STAT_COLUMNS.map((column) => {
                  const isActive = sortKey === column.key;
                  return (
                    <th key={column.key} scope="col" className={`mcPlayerTable__headCell mcPlayerTable__headCell--stat ${isActive ? 'is-active' : ''}`}>
                      <button
                        type="button"
                        className="mcPlayerTable__sortButton"
                        aria-pressed={isActive}
                        aria-label={`Sort by ${column.label}, ${isActive && sortDirection === 'desc' ? 'lowest to highest' : 'highest to lowest'}`}
                        onClick={() => {
                          if (sortKey === column.key) {
                            setSortDirection((current) => (current === 'desc' ? 'asc' : 'desc'));
                            return;
                          }
                          setSortKey(column.key);
                          setSortDirection('desc');
                        }}
                      >
                        {column.label}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {displayRows.map((item) => {
                const row = item.row;
                const canOpenProfile = isUuidLike(row.playerId);
                const teamMeta =
                  item.teamKey === 'away'
                    ? { label: model.away.abbreviation || 'Away', accent: model.away.colour || model.away.color || '#b9c7dd' }
                    : { label: model.home.abbreviation || 'Home', accent: model.home.colour || model.home.color || '#d7b56d' };
                const accentStyle = { '--mc-player-accent': teamMeta.accent } as CSSProperties;
                const tileText = initials(row.name);

                const identity = (
                  <>
                    <PlayerMedia photoUrl={row.photoUrl || ''} name={row.name} tileText={tileText} accentStyle={accentStyle} />
                    <span className="mcPlayerTable__identityMeta">
                      <span className="mcPlayerTable__name" title={row.name}>
                        {row.name}
                      </span>
                      <span className="mcPlayerTable__teamPill" style={accentStyle}>
                        <span className="mcPlayerTable__teamDot" aria-hidden="true" />
                        {teamMeta.label}
                      </span>
                    </span>
                  </>
                );

                return (
                  <tr key={item.key} className="mcPlayerTable__row">
                    <td className="mcPlayerTable__cell mcPlayerTable__cell--player">
                      {canOpenProfile ? (
                        <button
                          type="button"
                          className="mcPlayerTable__playerButton"
                          onClick={() => navigate(`/player/${row.playerId}`)}
                          aria-label={`Open ${row.name}`}
                        >
                          {identity}
                        </button>
                      ) : (
                        <div className="mcPlayerTable__playerButton mcPlayerTable__playerButton--static">
                          {identity}
                        </div>
                      )}
                    </td>

                    {STAT_COLUMNS.map((column) => (
                      <td key={`${item.key}-${column.key}`} className="mcPlayerTable__cell mcPlayerTable__cell--stat">
                        {column.getValue(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const PlayerMedia = memo(function PlayerMedia({
  photoUrl,
  name,
  tileText,
  accentStyle,
}: {
  photoUrl: string;
  name: string;
  tileText: string;
  accentStyle: CSSProperties;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const src = useMemo(() => resolveKnownPlayerHeadshot({ name, photoUrl }), [name, photoUrl]);
  const hasPhoto = Boolean(src) && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [src, name]);

  return (
    <span className="mcPlayerTable__media" style={accentStyle}>
      {hasPhoto ? (
        <img
          src={src || ''}
          alt={name}
          className="mcPlayerTable__photo"
          width={44}
          height={44}
          loading="eager"
          decoding="async"
          {...({ fetchpriority: 'high' } as any)}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="mcPlayerTable__numberTile" aria-hidden="true">
          {tileText}
        </span>
      )}
    </span>
  );
});

export default memo(PlayerStatsTableComponent);
