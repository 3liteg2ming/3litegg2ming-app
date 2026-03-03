import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AdminPermissionError,
  listFixtureSubmissions,
  listOcrQueue,
  setOcrQueueStatus,
} from '@/lib/adminApi';
import type { AdminOcrQueueItem, EgJobStatus } from '@/lib/adminTypes';
import { useAdminLayoutContext } from '../AdminLayout';
import { formatDateTime, useDebouncedValue, usePagination } from '../useAdminTools';
import { AdminCard, EmptyState, Pager } from './AdminUi';

const PAGE_SIZE = 15;

export default function AdminSubmissions() {
  const queryClient = useQueryClient();
  const { globalSearch, pushToast } = useAdminLayoutContext();

  const [submissionPage, setSubmissionPage] = useState(1);
  const [ocrPage, setOcrPage] = useState(1);
  const [status, setStatus] = useState<'all' | string>('all');
  const [ocrStatus, setOcrStatus] = useState<EgJobStatus | 'all'>('all');
  const [searchInput, setSearchInput] = useState('');

  const search = useDebouncedValue((searchInput || globalSearch).trim(), 300);

  const submissionsQuery = useQuery({
    queryKey: ['admin', 'fixture-submissions', submissionPage, status, search],
    queryFn: () => listFixtureSubmissions({ page: submissionPage, pageSize: PAGE_SIZE, status, search }),
    placeholderData: keepPreviousData,
    refetchInterval: 20_000,
  });

  const ocrQuery = useQuery({
    queryKey: ['admin', 'ocr-queue', ocrPage, ocrStatus, search],
    queryFn: () => listOcrQueue({ page: ocrPage, pageSize: PAGE_SIZE, status: ocrStatus, search }),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  });

  const ocrMutation = useMutation({
    mutationFn: (args: { id: string; status: EgJobStatus; error?: string }) =>
      setOcrQueueStatus({ queueId: args.id, status: args.status, error: args.error }),
    onSuccess: () => {
      pushToast('OCR item updated.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'ocr-queue'] });
    },
    onError: (error) => {
      if (error instanceof AdminPermissionError) {
        pushToast('Admin privileges required for this action.', 'error');
      } else {
        pushToast(error instanceof Error ? error.message : 'Failed to update OCR item', 'error');
      }
    },
  });

  const submissionPager = usePagination(submissionsQuery.data?.total ?? 0, PAGE_SIZE);
  const ocrPager = usePagination(ocrQuery.data?.total ?? 0, PAGE_SIZE);

  const selectedOcrJson = useMemo(() => {
    const map = new Map<string, AdminOcrQueueItem>();
    for (const row of ocrQuery.data?.rows || []) map.set(row.id, row);
    return map;
  }, [ocrQuery.data?.rows]);

  const [expandedOcrId, setExpandedOcrId] = useState<string>('');

  return (
    <div className="eg-admin-grid two">
      <AdminCard title="Fixture Submissions" subtitle="Incoming match submissions from coaches">
        <div className="eg-admin-toolbar">
          <label className="eg-admin-inline-field">
            <span>Search</span>
            <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Fixture ID or notes" />
          </label>
          <label className="eg-admin-inline-field">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
        </div>

        {submissionsQuery.isLoading ? <p className="eg-admin-muted">Loading submissions…</p> : null}
        {submissionsQuery.error ? (
          <p className="eg-admin-error">
            {submissionsQuery.error instanceof Error
              ? submissionsQuery.error.message
              : 'Failed to load submissions'}
          </p>
        ) : null}

        {!submissionsQuery.isLoading && !(submissionsQuery.data?.rows.length || 0) ? (
          <EmptyState title="No submissions" description="No fixture submissions match the current filters." />
        ) : (
          <>
            <div className="eg-admin-list">
              {(submissionsQuery.data?.rows || []).map((submission) => (
                <article key={submission.id}>
                  <div>
                    <strong>{submission.fixture_id}</strong>
                    <span>{submission.status || 'unknown'}</span>
                  </div>
                  <p>{submission.notes || 'No notes'}</p>
                  <p>{formatDateTime(submission.updated_at)}</p>
                </article>
              ))}
            </div>
            <Pager
              page={submissionPage}
              pages={submissionPager.pages}
              onPage={setSubmissionPage}
              totalLabel={submissionPager.label}
            />
          </>
        )}
      </AdminCard>

      <AdminCard title="OCR Queue" subtitle="Retry, mark failed, and inspect JSON results">
        <div className="eg-admin-toolbar">
          <label className="eg-admin-inline-field">
            <span>Status</span>
            <select value={ocrStatus} onChange={(event) => setOcrStatus(event.target.value as EgJobStatus | 'all')}>
              <option value="all">All</option>
              <option value="queued">Queued</option>
              <option value="running">Running</option>
              <option value="succeeded">Succeeded</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
        </div>

        {ocrQuery.isLoading ? <p className="eg-admin-muted">Loading OCR queue…</p> : null}
        {ocrQuery.error ? (
          <p className="eg-admin-error">
            {ocrQuery.error instanceof Error ? ocrQuery.error.message : 'Failed to load OCR queue'}
          </p>
        ) : null}

        {!ocrQuery.isLoading && !(ocrQuery.data?.rows.length || 0) ? (
          <EmptyState title="No OCR items" description="Queue OCR jobs to populate this list." />
        ) : (
          <>
            <div className="eg-admin-list">
              {(ocrQuery.data?.rows || []).map((row) => (
                <article key={row.id}>
                  <div>
                    <strong>{row.fixture_id || 'No fixture'}</strong>
                    <span>{row.status}</span>
                  </div>
                  <p>{row.error || 'No error'}</p>
                  <p>{formatDateTime(row.updated_at)}</p>
                  <div className="eg-admin-inline-buttons">
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm(`Retry OCR item ${row.id}?`)) return;
                        ocrMutation.mutate({ id: row.id, status: 'queued', error: '' });
                      }}
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm(`Mark OCR item ${row.id} as failed?`)) return;
                        ocrMutation.mutate({ id: row.id, status: 'failed', error: 'Marked failed by admin' });
                      }}
                    >
                      Mark Failed
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedOcrId((prev) => (prev === row.id ? '' : row.id))}
                    >
                      {expandedOcrId === row.id ? 'Hide JSON' : 'View JSON'}
                    </button>
                  </div>
                  {expandedOcrId === row.id ? (
                    <pre className="eg-admin-json">{JSON.stringify(selectedOcrJson.get(row.id)?.result || {}, null, 2)}</pre>
                  ) : null}
                </article>
              ))}
            </div>
            <Pager page={ocrPage} pages={ocrPager.pages} onPage={setOcrPage} totalLabel={ocrPager.label} />
          </>
        )}
      </AdminCard>
    </div>
  );
}
