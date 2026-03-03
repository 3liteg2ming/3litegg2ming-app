import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listTeams } from '@/lib/adminApi';
import { useAdminLayoutContext } from '../AdminLayout';
import { useDebouncedValue } from '../useAdminTools';
import { AdminCard, EmptyState } from './AdminUi';

const PAGE_SIZE = 20;

export default function AdminTeams() {
  const { globalSearch } = useAdminLayoutContext();
  const [localSearch, setLocalSearch] = useState('');
  const [page, setPage] = useState(1);

  const search = useDebouncedValue((localSearch || globalSearch).trim(), 250);

  const teamsQuery = useQuery({
    queryKey: ['admin', 'teams', search],
    queryFn: () => listTeams(search, 500),
    refetchInterval: 60_000,
  });

  const rows = teamsQuery.data || [];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  const currentRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [page, rows]);

  return (
    <AdminCard title="Teams" subtitle="Team directory with search and pagination">
      <div className="eg-admin-toolbar">
        <label className="eg-admin-inline-field">
          <span>Search</span>
          <input
            value={localSearch}
            onChange={(e) => {
              setLocalSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Name, key, or slug"
          />
        </label>
      </div>

      {teamsQuery.isLoading ? <p className="eg-admin-muted">Loading teams…</p> : null}
      {teamsQuery.error ? (
        <p className="eg-admin-error">
          {teamsQuery.error instanceof Error ? teamsQuery.error.message : 'Failed to load teams'}
        </p>
      ) : null}

      {!teamsQuery.isLoading && !rows.length ? (
        <EmptyState title="No teams" description="No matching teams were found." />
      ) : (
        <>
          <div className="eg-admin-table-wrap">
            <table className="eg-admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Short</th>
                  <th>Slug</th>
                  <th>Key</th>
                  <th>ID</th>
                </tr>
              </thead>
              <tbody>
                {currentRows.map((team) => (
                  <tr key={team.id}>
                    <td>{team.name}</td>
                    <td>{team.short_name || '—'}</td>
                    <td>{team.slug || '—'}</td>
                    <td>{team.team_key || '—'}</td>
                    <td className="mono">{team.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="eg-admin-pager">
            <span>{rows.length} teams</span>
            <div>
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                Prev
              </button>
              <span>
                Page {page} / {pages}
              </span>
              <button type="button" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}>
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </AdminCard>
  );
}
