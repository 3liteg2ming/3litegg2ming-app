import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listPlayers, listTeams } from '@/lib/adminApi';
import { requireSupabaseClient } from '@/lib/supabaseClient';
import { useAdminLayoutContext } from '../AdminLayout';
import { useDebouncedValue, usePagination } from '../useAdminTools';
import { AdminCard, EmptyState, Pager } from './AdminUi';

const supabase = requireSupabaseClient();

const PAGE_SIZE = 25;

type MissingPlayerRow = {
  id: string;
  name?: string | null;
  full_name?: string | null;
  display_name?: string | null;
  team_id?: string | null;
  team_key?: string | null;
  team_name?: string | null;
  number?: number | null;
};

function pickPlayerName(row: MissingPlayerRow) {
  return String(row.full_name || row.display_name || row.name || 'Unnamed').trim();
}

export default function AdminPlayers() {
  const queryClient = useQueryClient();
  const { globalSearch } = useAdminLayoutContext();
  const [searchInput, setSearchInput] = useState('');
  const [teamId, setTeamId] = useState<'all' | string>('all');
  const [page, setPage] = useState(1);
  const [missingSearch, setMissingSearch] = useState('');
  const [selectedTeamByPlayer, setSelectedTeamByPlayer] = useState<Record<string, string>>({});

  const search = useDebouncedValue((searchInput || globalSearch).trim(), 300);
  const missingSearchDebounced = useDebouncedValue(missingSearch.trim(), 250);

  const playersQuery = useQuery({
    queryKey: ['admin', 'players', page, search, teamId],
    queryFn: () => listPlayers({ page, pageSize: PAGE_SIZE, search, teamId }),
    placeholderData: keepPreviousData,
  });

  const teamsQuery = useQuery({
    queryKey: ['admin', 'teams', 'lookup'],
    queryFn: () => listTeams('', 250),
    staleTime: 10 * 60_000,
  });

  const missingPlayersQuery = useQuery({
    queryKey: ['admin', 'players', 'missing-team', missingSearchDebounced],
    queryFn: async () => {
      let query = supabase
        .from('eg_players')
        .select('id,name,full_name,display_name,team_id,team_key,team_name,number')
        .is('team_id', null)
        .order('name', { ascending: true })
        .limit(400);

      if (missingSearchDebounced) {
        const q = missingSearchDebounced;
        query = query.or(`name.ilike.%${q}%,full_name.ilike.%${q}%,display_name.ilike.%${q}%`);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data || []) as MissingPlayerRow[];
    },
  });

  const assignTeamMutation = useMutation({
    mutationFn: async ({ playerId, targetTeamId }: { playerId: string; targetTeamId: string }) => {
      const team = (teamsQuery.data || []).find((row) => row.id === targetTeamId);
      if (!team) throw new Error('Select a valid team before saving.');

      const { error } = await supabase
        .from('eg_players')
        .update({
          team_id: team.id,
          team_key: team.team_key || team.slug || null,
          team_name: team.name,
        })
        .eq('id', playerId);

      if (error) throw new Error(error.message);
      return playerId;
    },
    onSuccess: async (playerId) => {
      setSelectedTeamByPlayer((prev) => {
        const next = { ...prev };
        delete next[playerId];
        return next;
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'players'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'players', 'missing-team'] }),
      ]);
    },
  });

  const teamById = useMemo(() => {
    const map = new Map<string, string>();
    for (const team of teamsQuery.data || []) {
      map.set(team.id, team.short_name || team.name);
    }
    return map;
  }, [teamsQuery.data]);

  const pager = usePagination(playersQuery.data?.total ?? 0, PAGE_SIZE);

  return (
    <div className="eg-admin-stack">
      <AdminCard title="Players" subtitle="Search, filter, and inspect player records">
        <div className="eg-admin-toolbar">
          <label className="eg-admin-inline-field">
            <span>Search</span>
            <input
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.target.value);
                setPage(1);
              }}
              placeholder="Name"
            />
          </label>
          <label className="eg-admin-inline-field">
            <span>Team</span>
            <select
              value={teamId}
              onChange={(event) => {
                setTeamId(event.target.value as 'all' | string);
                setPage(1);
              }}
            >
              <option value="all">All teams</option>
              {(teamsQuery.data || []).map((team) => (
                <option key={team.id} value={team.id}>
                  {team.short_name || team.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {playersQuery.isLoading ? <p className="eg-admin-muted">Loading players…</p> : null}
        {playersQuery.error ? (
          <p className="eg-admin-error">
            {playersQuery.error instanceof Error ? playersQuery.error.message : 'Failed to load players'}
          </p>
        ) : null}

        {!playersQuery.isLoading && !(playersQuery.data?.rows.length || 0) ? (
          <EmptyState title="No players found" description="Try a different name/team filter." />
        ) : (
          <>
            <div className="eg-admin-table-wrap">
              <table className="eg-admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Display</th>
                    <th>Team</th>
                    <th>Goals</th>
                    <th>ID</th>
                  </tr>
                </thead>
                <tbody>
                  {(playersQuery.data?.rows || []).map((player) => (
                    <tr key={player.id}>
                      <td>{player.full_name || player.name || 'Unnamed'}</td>
                      <td>{player.display_name || '—'}</td>
                      <td>{(player.team_id && teamById.get(player.team_id)) || '—'}</td>
                      <td>{player.goals ?? 0}</td>
                      <td className="mono">{player.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              page={page}
              pages={pager.pages}
              onPage={setPage}
              totalLabel={pager.label}
            />
          </>
        )}
      </AdminCard>

      <AdminCard
        title="Missing Team Assignments"
        subtitle="Assign players with NULL team_id to the correct team"
      >
        <div className="eg-admin-toolbar">
          <label className="eg-admin-inline-field" style={{ minWidth: 260 }}>
            <span>Search unassigned players</span>
            <input
              value={missingSearch}
              onChange={(event) => setMissingSearch(event.target.value)}
              placeholder="Name"
            />
          </label>
        </div>

        {missingPlayersQuery.isLoading ? <p className="eg-admin-muted">Loading unassigned players…</p> : null}
        {missingPlayersQuery.error ? (
          <p className="eg-admin-error">
            {missingPlayersQuery.error instanceof Error ? missingPlayersQuery.error.message : 'Failed to load unassigned players'}
          </p>
        ) : null}

        {!missingPlayersQuery.isLoading && !(missingPlayersQuery.data?.length || 0) ? (
          <EmptyState
            title="No unassigned players"
            description="All players currently have a team_id."
          />
        ) : (
          <div className="eg-admin-table-wrap">
            <table className="eg-admin-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>#</th>
                  <th>Current</th>
                  <th>Assign Team</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {(missingPlayersQuery.data || []).map((player) => {
                  const selected = selectedTeamByPlayer[player.id] || '';
                  const isSaving = assignTeamMutation.isPending && assignTeamMutation.variables?.playerId === player.id;
                  return (
                    <tr key={player.id}>
                      <td>{pickPlayerName(player)}</td>
                      <td>{player.number ?? '—'}</td>
                      <td>{player.team_name || 'NULL'}</td>
                      <td>
                        <select
                          value={selected}
                          onChange={(event) => {
                            const value = event.target.value;
                            setSelectedTeamByPlayer((prev) => ({ ...prev, [player.id]: value }));
                          }}
                        >
                          <option value="">Select team</option>
                          {(teamsQuery.data || []).map((team) => (
                            <option key={`${player.id}-${team.id}`} value={team.id}>
                              {team.short_name || team.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="eg-admin-btn"
                          disabled={!selected || isSaving}
                          onClick={() => {
                            if (!selected) return;
                            assignTeamMutation.mutate({ playerId: player.id, targetTeamId: selected });
                          }}
                        >
                          {isSaving ? 'Saving…' : 'Save'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {assignTeamMutation.error ? (
          <p className="eg-admin-error" style={{ marginTop: 12 }}>
            {assignTeamMutation.error instanceof Error ? assignTeamMutation.error.message : 'Failed to update player team'}
          </p>
        ) : null}
      </AdminCard>
    </div>
  );
}
