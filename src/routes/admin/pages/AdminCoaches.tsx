import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AdminPermissionError,
  listProfiles,
  listTeams,
  setUserBan,
  setUserRoleAndTeam,
} from '@/lib/adminApi';
import type { EgRole } from '@/lib/adminTypes';
import { useAdminLayoutContext } from '../AdminLayout';
import { useDebouncedValue, usePagination } from '../useAdminTools';
import { AdminCard, EmptyState, Pager } from './AdminUi';

const PAGE_SIZE = 20;

export default function AdminCoaches() {
  const queryClient = useQueryClient();
  const { globalSearch, pushToast } = useAdminLayoutContext();

  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [role, setRole] = useState<EgRole | 'all'>('all');
  const [teamId, setTeamId] = useState<'all' | string>('all');
  const [banned, setBanned] = useState<'all' | 'active' | 'banned'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkRole, setBulkRole] = useState<EgRole>('user');
  const [bulkTeamId, setBulkTeamId] = useState('');

  const search = useDebouncedValue((searchInput || globalSearch).trim(), 300);

  const profilesQuery = useQuery({
    queryKey: ['admin', 'profiles', page, search, role, teamId, banned],
    queryFn: () => listProfiles({ page, pageSize: PAGE_SIZE, search, role, teamId, banned }),
    placeholderData: keepPreviousData,
  });

  const teamsQuery = useQuery({
    queryKey: ['admin', 'teams', 'lookup'],
    queryFn: () => listTeams('', 250),
    staleTime: 10 * 60_000,
  });

  const pager = usePagination(profilesQuery.data?.total ?? 0, PAGE_SIZE);

  const mutateProfile = useMutation({
    mutationFn: async (args: {
      userId: string;
      nextRole: EgRole;
      nextTeamId: string | null;
      nextBan: boolean;
      mode: 'roleTeam' | 'ban';
    }) => {
      if (args.mode === 'ban') {
        await setUserBan(args.userId, args.nextBan);
      } else {
        await setUserRoleAndTeam(args.userId, args.nextRole, args.nextTeamId);
      }
      return args;
    },
    onMutate: async (args) => {
      await queryClient.cancelQueries({ queryKey: ['admin', 'profiles'] });
      const previous = queryClient.getQueriesData({ queryKey: ['admin', 'profiles'] });

      queryClient.setQueriesData(
        { queryKey: ['admin', 'profiles'] },
        (old: { rows: Array<any>; total: number } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            rows: old.rows.map((row) => {
              if (row.user_id !== args.userId) return row;
              return {
                ...row,
                role: args.mode === 'roleTeam' ? args.nextRole : row.role,
                team_id: args.mode === 'roleTeam' ? args.nextTeamId : row.team_id,
                is_banned: args.mode === 'ban' ? args.nextBan : row.is_banned,
              };
            }),
          };
        },
      );

      return { previous };
    },
    onError: (error, _args, context) => {
      if (context?.previous) {
        for (const [key, value] of context.previous) {
          queryClient.setQueryData(key, value);
        }
      }
      if (error instanceof AdminPermissionError) {
        pushToast('Admin privileges required for this action.', 'error');
      } else {
        pushToast(error instanceof Error ? error.message : 'Failed to update profile', 'error');
      }
    },
    onSuccess: () => {
      pushToast('Profile updated', 'success');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'profiles'] });
    },
  });

  const selectedOnPage = useMemo(() => {
    const idsOnPage = new Set((profilesQuery.data?.rows || []).map((row) => row.user_id));
    return selectedIds.filter((id) => idsOnPage.has(id));
  }, [selectedIds, profilesQuery.data?.rows]);

  const allOnPageSelected =
    (profilesQuery.data?.rows || []).length > 0 &&
    selectedOnPage.length === (profilesQuery.data?.rows || []).length;

  const applyBulkRoleTeam = async (nextRole: EgRole, nextTeamId: string | null) => {
    if (!selectedIds.length) {
      pushToast('Select at least one user.', 'info');
      return;
    }

    if (!window.confirm(`Apply role/team to ${selectedIds.length} selected users?`)) return;

    for (const userId of selectedIds) {
      await mutateProfile.mutateAsync({
        userId,
        nextRole,
        nextTeamId,
        nextBan: false,
        mode: 'roleTeam',
      });
    }

    pushToast(`Updated ${selectedIds.length} user(s).`, 'success');
    setSelectedIds([]);
  };

  const applyBulkBan = async (nextBan: boolean) => {
    if (!selectedIds.length) {
      pushToast('Select at least one user.', 'info');
      return;
    }

    if (!window.confirm(`${nextBan ? 'Ban' : 'Unban'} ${selectedIds.length} selected users?`)) return;

    for (const userId of selectedIds) {
      await mutateProfile.mutateAsync({
        userId,
        nextRole: 'user',
        nextTeamId: null,
        nextBan,
        mode: 'ban',
      });
    }

    pushToast(`${nextBan ? 'Banned' : 'Unbanned'} ${selectedIds.length} user(s).`, 'success');
    setSelectedIds([]);
  };

  return (
    <AdminCard title="Coaches & Roles" subtitle="Admin-managed user permissions with full audit trail">
      <div className="eg-admin-toolbar">
        <label className="eg-admin-inline-field">
          <span>Search</span>
          <input
            value={searchInput}
            onChange={(event) => {
              setSearchInput(event.target.value);
              setPage(1);
            }}
            placeholder="Display name, PSN, email"
          />
        </label>
        <label className="eg-admin-inline-field">
          <span>Role</span>
          <select value={role} onChange={(event) => setRole(event.target.value as EgRole | 'all')}>
            <option value="all">All roles</option>
            <option value="user">User</option>
            <option value="coach">Coach</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super admin</option>
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
          <select value={banned} onChange={(event) => setBanned(event.target.value as 'all' | 'active' | 'banned')}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="banned">Banned</option>
          </select>
        </label>
      </div>

      <div className="eg-admin-toolbar">
        <label className="eg-admin-inline-field">
          <span>Bulk role</span>
          <select value={bulkRole} onChange={(event) => setBulkRole(event.target.value as EgRole)}>
            <option value="user">User</option>
            <option value="coach">Coach</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super admin</option>
          </select>
        </label>
        <label className="eg-admin-inline-field">
          <span>Bulk team</span>
          <select value={bulkTeamId} onChange={(event) => setBulkTeamId(event.target.value)}>
            <option value="">No team</option>
            {(teamsQuery.data || []).map((team) => (
              <option value={team.id} key={team.id}>
                {team.short_name || team.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            applyBulkRoleTeam(bulkRole, bulkTeamId || null);
          }}
          disabled={!selectedIds.length || mutateProfile.isPending}
        >
          Apply Bulk Role/Team
        </button>
        <button type="button" onClick={() => applyBulkBan(true)} disabled={!selectedIds.length || mutateProfile.isPending}>
          Bulk Ban
        </button>
        <button type="button" onClick={() => applyBulkBan(false)} disabled={!selectedIds.length || mutateProfile.isPending}>
          Bulk Unban
        </button>
      </div>

      <p className="eg-admin-muted">{selectedIds.length} user(s) selected for bulk actions.</p>

      {profilesQuery.isLoading ? <p className="eg-admin-muted">Loading profiles…</p> : null}
      {profilesQuery.error ? (
        <div className="eg-admin-error" style={{ padding: '12px 16px', borderRadius: 8, marginBottom: 12 }}>
          <strong>Failed to load profiles.</strong> This is usually caused by a recursive RLS policy on the{' '}
          <code>eg_profiles</code> table ("stack depth limit exceeded"). Run{' '}
          <code>supabase/fix_profiles_coaches_rls_recursion.sql</code> in the Supabase SQL Editor to fix it.
          <br />
          <span style={{ opacity: 0.7, fontSize: 12 }}>
            Error: {profilesQuery.error instanceof Error ? profilesQuery.error.message : String(profilesQuery.error)}
          </span>
        </div>
      ) : null}

      {!profilesQuery.isLoading && !profilesQuery.error && !(profilesQuery.data?.rows.length || 0) ? (
        <EmptyState title="No users found" description="Adjust filters or search to find profiles." />
      ) : (
        <>
          <div className="eg-admin-table-wrap">
            <table className="eg-admin-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={(event) => {
                        const idsOnPage = (profilesQuery.data?.rows || []).map((row) => row.user_id);
                        if (event.target.checked) {
                          setSelectedIds((prev) => Array.from(new Set([...prev, ...idsOnPage])));
                        } else {
                          setSelectedIds((prev) => prev.filter((id) => !idsOnPage.includes(id)));
                        }
                      }}
                    />
                  </th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>PSN</th>
                  <th>Role</th>
                  <th>Team</th>
                  <th>Banned</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {(profilesQuery.data?.rows || []).map((profile) => (
                  <tr key={profile.user_id}>
                    <td data-label="Select">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(profile.user_id)}
                        onChange={(event) => {
                          setSelectedIds((prev) =>
                            event.target.checked
                              ? Array.from(new Set([...prev, profile.user_id]))
                              : prev.filter((id) => id !== profile.user_id),
                          );
                        }}
                      />
                    </td>
                    <td data-label="Name">{profile.display_name || '—'}</td>
                    <td data-label="Email">{profile.email || '—'}</td>
                    <td data-label="PSN">{profile.psn || '—'}</td>
                    <td data-label="Role">
                      <select
                        value={profile.role}
                        onChange={(event) =>
                          mutateProfile.mutate({
                            userId: profile.user_id,
                            nextRole: event.target.value as EgRole,
                            nextTeamId: profile.team_id,
                            nextBan: profile.is_banned,
                            mode: 'roleTeam',
                          })
                        }
                      >
                        <option value="user">User</option>
                        <option value="coach">Coach</option>
                        <option value="admin">Admin</option>
                        <option value="super_admin">Super admin</option>
                      </select>
                    </td>
                    <td data-label="Team">
                      <select
                        value={profile.team_id || ''}
                        onChange={(event) =>
                          mutateProfile.mutate({
                            userId: profile.user_id,
                            nextRole: profile.role,
                            nextTeamId: event.target.value || null,
                            nextBan: profile.is_banned,
                            mode: 'roleTeam',
                          })
                        }
                      >
                        <option value="">No team</option>
                        {(teamsQuery.data || []).map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.short_name || team.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td data-label="Banned">{profile.is_banned ? 'Yes' : 'No'}</td>
                    <td data-label="Actions">
                      <button
                        type="button"
                        onClick={() => {
                          const label = profile.is_banned ? 'unban' : 'ban';
                          if (!window.confirm(`Confirm ${label} for ${profile.email || profile.user_id}?`)) return;
                          mutateProfile.mutate({
                            userId: profile.user_id,
                            nextRole: profile.role,
                            nextTeamId: profile.team_id,
                            nextBan: !profile.is_banned,
                            mode: 'ban',
                          });
                        }}
                      >
                        {profile.is_banned ? 'Unban' : 'Ban'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pager page={page} pages={pager.pages} onPage={setPage} totalLabel={pager.label} />
        </>
      )}
    </AdminCard>
  );
}
