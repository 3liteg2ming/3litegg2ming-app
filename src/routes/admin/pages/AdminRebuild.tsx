import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminPermissionError, enqueueAdminJob, listJobs, setAdminJobStatus } from '@/lib/adminApi';
import type { EgJobStatus } from '@/lib/adminTypes';
import { useAdminLayoutContext } from '../AdminLayout';
import { formatDateTime, usePagination } from '../useAdminTools';
import { AdminCard, EmptyState, Pager } from './AdminUi';

const PAGE_SIZE = 15;
const REBUILD_TYPES = ['rebuild_ladder', 'rebuild_player_totals', 'rebuild_team_stats', 'rebuild_everything'];

export default function AdminRebuild() {
  const queryClient = useQueryClient();
  const { pushToast } = useAdminLayoutContext();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<EgJobStatus | 'all'>('all');

  const jobsQuery = useQuery({
    queryKey: ['admin', 'jobs', page, status],
    queryFn: () => listJobs({ page, pageSize: PAGE_SIZE, status }),
    placeholderData: keepPreviousData,
    refetchInterval: 12_000,
  });

  const queueMutation = useMutation({
    mutationFn: (type: string) => enqueueAdminJob(type, {}),
    onSuccess: () => {
      pushToast('Job enqueued.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'jobs'] });
    },
    onError: (error) => {
      if (error instanceof AdminPermissionError) {
        pushToast('Admin privileges required for this action.', 'error');
      } else {
        pushToast(error instanceof Error ? error.message : 'Failed to enqueue job', 'error');
      }
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (jobId: string) =>
      setAdminJobStatus({
        jobId,
        status: 'cancelled',
        progress: 0,
        message: 'Cancelled by admin',
      }),
    onSuccess: () => {
      pushToast('Job marked cancelled.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'jobs'] });
    },
    onError: (error) => {
      if (error instanceof AdminPermissionError) {
        pushToast('Admin privileges required for this action.', 'error');
      } else {
        pushToast(error instanceof Error ? error.message : 'Failed to cancel job', 'error');
      }
    },
  });

  const pager = usePagination(jobsQuery.data?.total ?? 0, PAGE_SIZE);

  return (
    <div className="eg-admin-grid two">
      <AdminCard title="Rebuild Queue" subtitle="Create background jobs for ladder and stats rebuilds">
        <div className="eg-admin-action-grid">
          {REBUILD_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              disabled={queueMutation.isPending}
              onClick={() => {
                if (!window.confirm(`Queue ${type}?`)) return;
                queueMutation.mutate(type);
              }}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="eg-admin-danger-zone">
          <h4>Danger Zone</h4>
          <p>Rebuilding all data can temporarily increase load and delay live updates.</p>
        </div>
      </AdminCard>

      <AdminCard title="Job Monitor" subtitle="Live statuses with cancellation">
        <div className="eg-admin-toolbar">
          <label className="eg-admin-inline-field">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as EgJobStatus | 'all')}>
              <option value="all">All</option>
              <option value="queued">Queued</option>
              <option value="running">Running</option>
              <option value="succeeded">Succeeded</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
        </div>

        {jobsQuery.isLoading ? <p className="eg-admin-muted">Loading jobs…</p> : null}
        {jobsQuery.error ? (
          <p className="eg-admin-error">
            {jobsQuery.error instanceof Error ? jobsQuery.error.message : 'Failed to load jobs'}
          </p>
        ) : null}

        {!jobsQuery.isLoading && !(jobsQuery.data?.rows.length || 0) ? (
          <EmptyState title="No jobs" description="Queue rebuild jobs to populate this view." />
        ) : (
          <>
            <div className="eg-admin-list">
              {(jobsQuery.data?.rows || []).map((job) => (
                <article key={job.id}>
                  <div>
                    <strong>{job.type}</strong>
                    <span>{job.status}</span>
                  </div>
                  <p>
                    {job.progress}% • {formatDateTime(job.created_at)}
                  </p>
                  <p>{job.message || job.error || 'No message'}</p>
                  {(job.status === 'queued' || job.status === 'running') && (
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm(`Cancel job ${job.id}?`)) return;
                        cancelMutation.mutate(job.id);
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </article>
              ))}
            </div>
            <Pager page={page} pages={pager.pages} onPage={setPage} totalLabel={pager.label} />
          </>
        )}
      </AdminCard>
    </div>
  );
}
