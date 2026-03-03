import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { listAuditLogs } from '@/lib/adminApi';
import { useAdminLayoutContext } from '../AdminLayout';
import { formatDateTime, useDebouncedValue, usePagination } from '../useAdminTools';
import { AdminCard, EmptyState, Pager } from './AdminUi';

const PAGE_SIZE = 30;

export default function AdminAudit() {
  const { globalSearch } = useAdminLayoutContext();
  const [page, setPage] = useState(1);
  const [actorUserId, setActorUserId] = useState('');
  const [action, setAction] = useState('all');
  const [entityTable, setEntityTable] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const keyword = useDebouncedValue((keywordInput || globalSearch).trim(), 350);

  const auditQuery = useQuery({
    queryKey: ['admin', 'audit', page, actorUserId, action, entityTable, keyword, dateFrom, dateTo],
    queryFn: () =>
      listAuditLogs({
        page,
        pageSize: PAGE_SIZE,
        actorUserId,
        action,
        entityTable,
        keyword,
        dateFrom,
        dateTo,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  const pager = usePagination(auditQuery.data?.total ?? 0, PAGE_SIZE);

  const exportRows = () => {
    const rows = auditQuery.data?.rows || [];
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `eg-audit-export-${new Date().toISOString().slice(0, 19)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const actorIds = useMemo(() => {
    return Array.from(new Set((auditQuery.data?.rows || []).map((row) => row.actor_user_id).filter(Boolean)));
  }, [auditQuery.data?.rows]);

  return (
    <AdminCard
      title="Audit Log"
      subtitle="Immutable admin activity stream with filters and JSON export"
      actions={
        <button type="button" onClick={exportRows} disabled={!(auditQuery.data?.rows.length || 0)}>
          Export JSON
        </button>
      }
    >
      <div className="eg-admin-toolbar wrap">
        <label className="eg-admin-inline-field">
          <span>Actor</span>
          <input value={actorUserId} onChange={(event) => setActorUserId(event.target.value)} placeholder="user UUID" list="actor-id-list" />
          <datalist id="actor-id-list">
            {actorIds.map((id) => (
              <option value={id || ''} key={id || ''} />
            ))}
          </datalist>
        </label>
        <label className="eg-admin-inline-field">
          <span>Action</span>
          <select value={action} onChange={(event) => setAction(event.target.value)}>
            <option value="all">All</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="DELETE">DELETE</option>
            <option value="UPSERT">UPSERT</option>
            <option value="RPC">RPC</option>
            <option value="REBUILD">REBUILD</option>
            <option value="BULK">BULK</option>
            <option value="PUBLISH">PUBLISH</option>
            <option value="UNPUBLISH">UNPUBLISH</option>
            <option value="OTHER">OTHER</option>
          </select>
        </label>
        <label className="eg-admin-inline-field">
          <span>Table</span>
          <input value={entityTable} onChange={(event) => setEntityTable(event.target.value)} placeholder="eg_profiles" />
        </label>
        <label className="eg-admin-inline-field">
          <span>Keyword</span>
          <input value={keywordInput} onChange={(event) => setKeywordInput(event.target.value)} placeholder="summary or id" />
        </label>
        <label className="eg-admin-inline-field">
          <span>Date from</span>
          <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </label>
        <label className="eg-admin-inline-field">
          <span>Date to</span>
          <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </label>
      </div>

      {auditQuery.isLoading ? <p className="eg-admin-muted">Loading audit log…</p> : null}
      {auditQuery.error ? (
        <p className="eg-admin-error">
          {auditQuery.error instanceof Error ? auditQuery.error.message : 'Failed to load audit log'}
        </p>
      ) : null}

      {!auditQuery.isLoading && !(auditQuery.data?.rows.length || 0) ? (
        <EmptyState title="No events" description="No audit events matched your filters." />
      ) : (
        <>
          <div className="eg-admin-table-wrap">
            <table className="eg-admin-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Summary</th>
                  <th>Metadata</th>
                </tr>
              </thead>
              <tbody>
                {(auditQuery.data?.rows || []).map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.created_at)}</td>
                    <td className="mono">{row.actor_user_id || '—'}</td>
                    <td>{row.action}</td>
                    <td>
                      {(row.entity_table || '—') + (row.entity_id ? `:${row.entity_id}` : '')}
                    </td>
                    <td>{row.summary || '—'}</td>
                    <td>
                      <pre className="eg-admin-json compact">{JSON.stringify(row.metadata || {}, null, 2)}</pre>
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
