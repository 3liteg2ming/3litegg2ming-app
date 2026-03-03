import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listCompetitions, listSeasons } from '@/lib/adminApi';
import { useAdminLayoutContext } from '../AdminLayout';
import { useDebouncedValue } from '../useAdminTools';
import { AdminCard, EmptyState } from './AdminUi';

export default function AdminSeasons() {
  const { globalSearch } = useAdminLayoutContext();
  const [localSearch, setLocalSearch] = useState('');
  const search = useDebouncedValue((localSearch || globalSearch).trim(), 250);

  const seasonsQuery = useQuery({
    queryKey: ['admin', 'seasons', search],
    queryFn: () => listSeasons(search),
    refetchInterval: 60_000,
  });

  const competitionsQuery = useQuery({
    queryKey: ['admin', 'competitions', search],
    queryFn: () => listCompetitions(search),
    refetchInterval: 60_000,
  });

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; comps: string[] }>();
    const seasons = seasonsQuery.data || [];
    for (const season of seasons) {
      map.set(season.id, {
        name: season.name || season.slug || season.id,
        comps: [],
      });
    }
    for (const comp of competitionsQuery.data || []) {
      const key = comp.season_id || 'unassigned';
      if (!map.has(key)) {
        map.set(key, { name: key === 'unassigned' ? 'Unassigned' : key, comps: [] });
      }
      map.get(key)?.comps.push(comp.name || comp.slug || comp.id);
    }
    return Array.from(map.entries());
  }, [seasonsQuery.data, competitionsQuery.data]);

  return (
    <div className="eg-admin-grid two">
      <AdminCard title="Season Explorer" subtitle="Read-only overview by default">
        <label className="eg-admin-inline-field">
          <span>Search</span>
          <input value={localSearch} onChange={(e) => setLocalSearch(e.target.value)} placeholder="Season name or slug" />
        </label>
        {seasonsQuery.isLoading ? <p className="eg-admin-muted">Loading seasons…</p> : null}
        {seasonsQuery.error ? (
          <p className="eg-admin-error">
            {seasonsQuery.error instanceof Error ? seasonsQuery.error.message : 'Failed to load seasons'}
          </p>
        ) : null}
        {!seasonsQuery.isLoading && !(seasonsQuery.data || []).length ? (
          <EmptyState title="No seasons" description="No matching seasons were found." />
        ) : (
          <div className="eg-admin-list">
            {(seasonsQuery.data || []).map((season) => (
              <article key={season.id}>
                <div>
                  <strong>{season.name || 'Untitled season'}</strong>
                  <span>{season.slug || season.id}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </AdminCard>

      <AdminCard title="Competitions by Season" subtitle="Mapped from eg_competitions when available">
        {competitionsQuery.isLoading ? <p className="eg-admin-muted">Loading competitions…</p> : null}
        {competitionsQuery.error ? (
          <p className="eg-admin-error">
            {competitionsQuery.error instanceof Error
              ? competitionsQuery.error.message
              : 'Failed to load competitions'}
          </p>
        ) : null}

        {grouped.length === 0 ? (
          <EmptyState title="No competition data" description="`eg_competitions` may not be present in this environment." />
        ) : (
          <div className="eg-admin-list">
            {grouped.map(([seasonId, data]) => (
              <article key={seasonId}>
                <div>
                  <strong>{data.name}</strong>
                  <span>{seasonId}</span>
                </div>
                <p>{data.comps.length ? data.comps.join(', ') : 'No competitions mapped'}</p>
              </article>
            ))}
          </div>
        )}
      </AdminCard>
    </div>
  );
}
