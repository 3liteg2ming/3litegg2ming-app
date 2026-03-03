import { useMemo, useState } from 'react';
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
import { useAdminLayoutContext } from '../AdminLayout';
import { formatDateTime, useDebouncedValue, usePagination } from '../useAdminTools';
import { AdminCard, EmptyState, Pager } from './AdminUi';

const PAGE_SIZE = 20;

export default function AdminFixtures() {
  const queryClient = useQueryClient();
  const { globalSearch, pushToast } = useAdminLayoutContext();

  const [page, setPage] = useState(1);
  const [seasonId, setSeasonId] = useState<'all' | string>('all');
  const [teamId, setTeamId] = useState<'all' | string>('all');
  const [status, setStatus] = useState<'all' | string>('all');
  const [roundInput, setRoundInput] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const search = useDebouncedValue((searchInput || globalSearch).trim(), 300);
  const round = roundInput ? Number(roundInput) : null;

  const fixturesQuery = useQuery({
    queryKey: ['admin', 'fixtures', page, seasonId, teamId, status, round, search],
    queryFn: () =>
      listFixtures({
        page,
        pageSize: PAGE_SIZE,
        seasonId,
        teamId,
        status,
        round,
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

  const pager = usePagination(fixturesQuery.data?.total ?? 0, PAGE_SIZE);

  return (
    <div className="eg-admin-grid">
      <AdminCard title="Fixtures & Results Control" subtitle="Admin RPC-backed controls with confirmation on dangerous operations">
        <div className="eg-admin-toolbar">
          <label className="eg-admin-inline-field">
            <span>Search venue</span>
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

        {fixturesQuery.isLoading ? <p className="eg-admin-muted">Loading fixtures…</p> : null}
        {fixturesQuery.error ? (
          <p className="eg-admin-error">
            {fixturesQuery.error instanceof Error ? fixturesQuery.error.message : 'Failed to load fixtures'}
          </p>
        ) : null}

        {!fixturesQuery.isLoading && !(fixturesQuery.data?.rows.length || 0) ? (
          <EmptyState title="No fixtures" description="No fixtures matched your filters." />
        ) : (
          <>
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
                  {(fixturesQuery.data?.rows || []).map((fixture) => {
                    const home = fixture.home_team_id ? teamById.get(fixture.home_team_id) || fixture.home_team_id : 'TBD';
                    const away = fixture.away_team_id ? teamById.get(fixture.away_team_id) || fixture.away_team_id : 'TBD';

                    return (
                      <tr key={fixture.id}>
                        <td>
                          <strong>
                            R{fixture.round ?? '?'}: {home} vs {away}
                          </strong>
                          <p className="mono">{fixture.id}</p>
                        </td>
                        <td>
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
                        <td>
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
                        <td>
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
                        <td>
                          {fixture.home_total ?? '—'} - {fixture.away_total ?? '—'}
                        </td>
                        <td>
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
            <Pager page={page} pages={pager.pages} onPage={setPage} totalLabel={pager.label} />
          </>
        )}
      </AdminCard>
    </div>
  );
}
