import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AdminPermissionError,
  clearFixtureScores,
  listFixtures,
  listSeasons,
  listTeams,
  swapFixtureTeams,
  updateFixture,
} from '@/lib/adminApi';
import { isRoundVisible } from '@/lib/visibleRounds';
import { useAdminLayoutContext } from '../AdminLayout';
import { formatDateTime, useDebouncedValue } from '../useAdminTools';
import { AdminCard, EmptyState } from './AdminUi';

type ViewMode = 'rounds' | 'table';

export default function AdminFixtures() {
  const queryClient = useQueryClient();
  const { globalSearch, pushToast } = useAdminLayoutContext();

  const [seasonId, setSeasonId] = useState<'all' | string>('all');
  const [teamId, setTeamId] = useState<'all' | string>('all');
  const [status, setStatus] = useState<'all' | string>('all');
  const [roundInput, setRoundInput] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('rounds');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const search = useDebouncedValue((searchInput || globalSearch).trim(), 300);
  const roundFilter = roundInput ? Number(roundInput) : null;

  const fixturesQuery = useQuery({
    queryKey: ['admin', 'fixtures', 1, seasonId, teamId, status, roundFilter, search],
    queryFn: () =>
      listFixtures({
        page: 1,
        pageSize: 500,
        seasonId,
        teamId,
        status,
        round: roundFilter,
        search,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: 25_000,
  });

  const seasonsQuery = useQuery({
    queryKey: ['admin', 'seasons', 'lookup'],
    queryFn: () => listSeasons(''),
    staleTime: 10 * 60_000,
  });

  const teamsQuery = useQuery({
    queryKey: ['admin', 'teams', 'lookup'],
    queryFn: () => listTeams('', 250),
    staleTime: 10 * 60_000,
  });

  const teamById = useMemo(() => {
    const map = new Map<string, string>();
    for (const team of teamsQuery.data || []) {
      map.set(team.id, team.short_name || team.name);
    }
    return map;
  }, [teamsQuery.data]);

  const fixtureMutation = useMutation({
    mutationFn: async (
      args:
        | { mode: 'status'; fixtureId: string; status: string }
        | { mode: 'startTime'; fixtureId: string; startTime: string }
        | { mode: 'venue'; fixtureId: string; venue: string }
        | { mode: 'swap'; fixtureId: string }
        | { mode: 'clear'; fixtureId: string },
    ) => {
      if (args.mode === 'status') return updateFixture({ fixtureId: args.fixtureId, status: args.status });
      if (args.mode === 'startTime') return updateFixture({ fixtureId: args.fixtureId, startTime: args.startTime });
      if (args.mode === 'venue') return updateFixture({ fixtureId: args.fixtureId, venue: args.venue });
      if (args.mode === 'swap') return swapFixtureTeams(args.fixtureId);
      return clearFixtureScores(args.fixtureId);
    },
    onError: (error) => {
      if (error instanceof AdminPermissionError) {
        pushToast('Admin privileges required for this action.', 'error');
      } else {
        pushToast(error instanceof Error ? error.message : 'Fixture update failed', 'error');
      }
    },
    onSuccess: () => {
      pushToast('Fixture updated.', 'success');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'fixtures'] });
    },
  });

  const allFixtures = fixturesQuery.data?.rows || [];

  const roundsGrouped = useMemo(() => {
    const map = new Map<number, typeof allFixtures>();
    for (const f of allFixtures) {
      const r = f.round ?? 0;
      if (!map.has(r)) map.set(r, []);
      map.get(r)!.push(f);
    }
    const entries = Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
    return entries.filter(([round]) => isRoundVisible(round));
  }, [allFixtures]);

  const hasActiveFilters = seasonId !== 'all' || teamId !== 'all' || status !== 'all' || roundInput !== '' || searchInput !== '';

  function scoreLabel(f: typeof allFixtures[0]) {
    if (f.home_total != null && f.away_total != null) {
      return `${f.home_total} - ${f.away_total}`;
    }
    return null;
  }

  function statusBadge(s: string | null) {
    if (s === 'FINAL') return { bg: 'rgba(52,211,153,0.18)', color: '#6ee7b7', label: 'FINAL' };
    if (s === 'LIVE') return { bg: 'rgba(251,191,36,0.18)', color: '#fcd34d', label: 'LIVE' };
    if (s === 'PENDING_RESULTS') return { bg: 'rgba(251,146,60,0.18)', color: '#fdba74', label: 'PENDING' };
    return { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8', label: 'SCHED' };
  }

  function hasStats(f: typeof allFixtures[0]) {
    return f.home_total != null || f.away_total != null;
  }

  return (
    <div className="eg-admin-grid">
      <AdminCard title="Fixtures & Results" subtitle="Tap any fixture to edit scores, stats, and data">
        {/* ─── FILTER TOGGLE + VIEW MODE ──────────────── */}
        <div className="eg-fx-controls">
          <button
            type="button"
            className="eg-fx-filter-toggle"
            onClick={() => setFiltersOpen((p) => !p)}
          >
            {filtersOpen ? 'Hide Filters' : 'Filters'}
            {hasActiveFilters ? (
              <span className="eg-fx-filter-dot" />
            ) : null}
          </button>
          <div className="eg-fx-view-toggle">
            <button
              type="button"
              className={`eg-fx-view-btn${viewMode === 'rounds' ? ' is-active' : ''}`}
              onClick={() => setViewMode('rounds')}
            >
              Rounds
            </button>
            <button
              type="button"
              className={`eg-fx-view-btn${viewMode === 'table' ? ' is-active' : ''}`}
              onClick={() => setViewMode('table')}
            >
              Table
            </button>
          </div>
          {hasActiveFilters ? (
            <button
              type="button"
              className="eg-fx-clear-btn"
              onClick={() => {
                setSeasonId('all');
                setTeamId('all');
                setStatus('all');
                setRoundInput('');
                setSearchInput('');
              }}
            >
              Clear
            </button>
          ) : null}
        </div>

        {/* ─── COLLAPSIBLE FILTERS ────────────────────── */}
        {filtersOpen ? (
          <div className="eg-fx-filters">
            <label className="eg-admin-inline-field">
              <span>Venue search</span>
              <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="MCG" />
            </label>
            <label className="eg-admin-inline-field">
              <span>Season</span>
              <select value={seasonId} onChange={(event) => setSeasonId(event.target.value)}>
                <option value="all">All seasons</option>
                {(seasonsQuery.data || []).map((season) => (
                  <option value={season.id} key={season.id}>
                    {season.name || season.slug || season.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="eg-admin-inline-field">
              <span>Team</span>
              <select value={teamId} onChange={(event) => setTeamId(event.target.value)}>
                <option value="all">All teams</option>
                {(teamsQuery.data || []).map((team) => (
                  <option value={team.id} key={team.id}>
                    {team.short_name || team.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="eg-admin-inline-field">
              <span>Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="all">Any</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="LIVE">Live</option>
                <option value="FINAL">Final</option>
              </select>
            </label>
            <label className="eg-admin-inline-field narrow">
              <span>Round</span>
              <input value={roundInput} onChange={(event) => setRoundInput(event.target.value)} placeholder="e.g. 4" />
            </label>
          </div>
        ) : null}

        {fixturesQuery.isLoading ? <p className="eg-admin-muted">Loading fixtures...</p> : null}
        {fixturesQuery.error ? (
          <p className="eg-admin-error">
            {fixturesQuery.error instanceof Error ? fixturesQuery.error.message : 'Failed to load fixtures'}
          </p>
        ) : null}

        {!fixturesQuery.isLoading && !allFixtures.length ? (
          <EmptyState title="No fixtures" description="No fixtures matched your filters." />
        ) : null}

        {/* ─── ROUNDS VIEW ────────────────────────────── */}
        {viewMode === 'rounds' && roundsGrouped.length > 0 ? (
          <div className="eg-fx-rounds">
            {roundsGrouped.map(([round, fixtures]) => {
              const finalCount = fixtures.filter((f) => f.status === 'FINAL').length;
              const totalCount = fixtures.length;
              const allFinal = finalCount === totalCount;
              return (
                <div key={round} className="eg-fx-round">
                  <div className={`eg-fx-round-header${allFinal ? ' eg-fx-round-header--done' : ''}`}>
                    <strong>Round {round || '?'}</strong>
                    <span className={allFinal ? 'eg-fx-round-complete' : ''}>
                      {finalCount}/{totalCount} final
                    </span>
                  </div>
                  <div className="eg-fx-round-fixtures">
                    {fixtures.map((f) => {
                      const home = f.home_team_id ? teamById.get(f.home_team_id) || 'TBD' : 'TBD';
                      const away = f.away_team_id ? teamById.get(f.away_team_id) || 'TBD' : 'TBD';
                      const badge = statusBadge(f.status);
                      const scored = hasStats(f);
                      const score = scoreLabel(f);
                      return (
                        <Link
                          key={f.id}
                          to={`/admin/fixtures/${f.id}`}
                          className={`eg-fx-card${scored ? ' eg-fx-card--scored' : ''}`}
                        >
                          <div className="eg-fx-card-top">
                            <div className="eg-fx-card-teams">
                              <span className="eg-fx-card-team">{home}</span>
                              <span className="eg-fx-card-vs">v</span>
                              <span className="eg-fx-card-team">{away}</span>
                            </div>
                            <span
                              className="eg-admin-status-chip"
                              style={{
                                background: badge.bg,
                                color: badge.color,
                              }}
                            >
                              {badge.label}
                            </span>
                          </div>
                          <div className="eg-fx-card-bottom">
                            {score ? (
                              <span className="eg-fx-card-score">{score}</span>
                            ) : (
                              <span className="eg-fx-card-noscore">No score</span>
                            )}
                            <span className="eg-fx-card-venue">{f.venue || '—'}</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* ─── TABLE VIEW ─────────────────────────────── */}
        {viewMode === 'table' && allFixtures.length > 0 ? (
          <div className="eg-admin-table-wrap">
            <table className="eg-admin-table">
              <thead>
                <tr>
                  <th>Fixture</th>
                  <th>Status</th>
                  <th>Start Time</th>
                  <th>Venue</th>
                  <th>Score</th>
                  <th>Danger Zone</th>
                </tr>
              </thead>
              <tbody>
                {allFixtures.map((fixture) => {
                  const home = fixture.home_team_id ? teamById.get(fixture.home_team_id) || fixture.home_team_id : 'TBD';
                  const away = fixture.away_team_id ? teamById.get(fixture.away_team_id) || fixture.away_team_id : 'TBD';

                  return (
                    <tr key={fixture.id}>
                      <td data-label="Fixture">
                        <Link to={`/admin/fixtures/${fixture.id}`} style={{ color: '#def0ff', textDecoration: 'none' }}>
                          <strong>
                            R{fixture.round ?? '?'}: {home} vs {away}
                          </strong>
                        </Link>
                        <p className="mono">{fixture.id}</p>
                      </td>
                      <td data-label="Status">
                        <select
                          value={fixture.status || ''}
                          onChange={(event) =>
                            fixtureMutation.mutate({
                              mode: 'status',
                              fixtureId: fixture.id,
                              status: event.target.value,
                            })
                          }
                        >
                          <option value="SCHEDULED">Scheduled</option>
                          <option value="LIVE">Live</option>
                          <option value="FINAL">Final</option>
                        </select>
                      </td>
                      <td data-label="Start Time">
                        <div className="eg-admin-inline-action">
                          <input
                            type="datetime-local"
                            defaultValue={
                              fixture.start_time
                                ? new Date(fixture.start_time).toISOString().slice(0, 16)
                                : ''
                            }
                            onBlur={(event) => {
                              if (!event.target.value) return;
                              fixtureMutation.mutate({
                                mode: 'startTime',
                                fixtureId: fixture.id,
                                startTime: new Date(event.target.value).toISOString(),
                              });
                            }}
                          />
                        </div>
                        <p>{formatDateTime(fixture.start_time)}</p>
                      </td>
                      <td data-label="Venue">
                        <div className="eg-admin-inline-action">
                          <input
                            defaultValue={fixture.venue || ''}
                            onBlur={(event) => {
                              const value = event.target.value.trim();
                              if (!value) return;
                              fixtureMutation.mutate({
                                mode: 'venue',
                                fixtureId: fixture.id,
                                venue: value,
                              });
                            }}
                          />
                        </div>
                      </td>
                      <td data-label="Score">
                        {fixture.home_total ?? '—'} - {fixture.away_total ?? '—'}
                      </td>
                      <td data-label="Danger Zone">
                        <div className="eg-admin-danger-actions">
                          <button
                            type="button"
                            onClick={() => {
                              if (!window.confirm(`Swap home/away teams for fixture ${fixture.id}?`)) return;
                              fixtureMutation.mutate({ mode: 'swap', fixtureId: fixture.id });
                            }}
                          >
                            Swap Teams
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!window.confirm(`Clear scores for fixture ${fixture.id}? This is destructive.`)) return;
                              fixtureMutation.mutate({ mode: 'clear', fixtureId: fixture.id });
                            }}
                          >
                            Clear Scores
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </AdminCard>
    </div>
  );
}
