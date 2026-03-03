import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listAuditLogs, listJobs, listProfiles } from '@/lib/adminApi';
import { formatDateTime } from '../useAdminTools';
import { AdminCard, EmptyState } from './AdminUi';

export default function AdminDashboard() {
  const profilesQuery = useQuery({
    queryKey: ['admin', 'dashboard', 'profiles-count'],
    queryFn: () => listProfiles({ page: 1, pageSize: 1 }),
    refetchInterval: 60_000,
  });

  const jobsQuery = useQuery({
    queryKey: ['admin', 'dashboard', 'jobs'],
    queryFn: () => listJobs({ page: 1, pageSize: 6, status: 'all' }),
    refetchInterval: 20_000,
  });

  const auditQuery = useQuery({
    queryKey: ['admin', 'dashboard', 'audit'],
    queryFn: () => listAuditLogs({ page: 1, pageSize: 8 }),
    refetchInterval: 30_000,
  });

  const loading = profilesQuery.isLoading || jobsQuery.isLoading || auditQuery.isLoading;
  const hasError = profilesQuery.error || jobsQuery.error || auditQuery.error;

  return (
    <div className="eg-admin-grid two">
      <AdminCard title="Overview" subtitle="Live system snapshot">
        {loading ? <p className="eg-admin-muted">Loading dashboard…</p> : null}
        {hasError ? (
          <p className="eg-admin-error">
            {profilesQuery.error instanceof Error
              ? profilesQuery.error.message
              : jobsQuery.error instanceof Error
                ? jobsQuery.error.message
                : auditQuery.error instanceof Error
                  ? auditQuery.error.message
                  : 'Failed to load dashboard'}
          </p>
        ) : null}
        {!loading && !hasError ? (
          <div className="eg-admin-stat-grid">
            <article>
              <h4>{profilesQuery.data?.total ?? 0}</h4>
              <p>Profiles</p>
            </article>
            <article>
              <h4>{jobsQuery.data?.total ?? 0}</h4>
              <p>Admin Jobs</p>
            </article>
            <article>
              <h4>{auditQuery.data?.total ?? 0}</h4>
              <p>Audit Events</p>
            </article>
            <article>
              <h4>{jobsQuery.data?.rows.filter((job) => job.status === 'failed').length ?? 0}</h4>
              <p>Failed Jobs (current page)</p>
            </article>
          </div>
        ) : null}
      </AdminCard>

      <AdminCard title="Quick Actions" subtitle="Jump to key admin areas">
        <div className="eg-admin-link-grid">
          <Link to="/admin/rebuild">Queue rebuild jobs</Link>
          <Link to="/admin/coaches">Manage coach roles</Link>
          <Link to="/admin/fixtures">Control fixtures</Link>
          <Link to="/admin/content">Edit announcement content</Link>
          <Link to="/admin/flags">Toggle feature flags</Link>
          <Link to="/admin/audit">Inspect audit trail</Link>
        </div>
      </AdminCard>

      <AdminCard title="Recent Jobs" subtitle="Background processing">
        {!jobsQuery.data?.rows.length ? (
          <EmptyState title="No jobs" description="Queue rebuild/OCR jobs from Rebuild tools." />
        ) : (
          <div className="eg-admin-list">
            {jobsQuery.data?.rows.map((job) => (
              <article key={job.id}>
                <div>
                  <strong>{job.type}</strong>
                  <span>{job.status}</span>
                </div>
                <p>
                  {job.progress}% • {formatDateTime(job.created_at)}
                </p>
              </article>
            ))}
          </div>
        )}
      </AdminCard>

      <AdminCard title="Latest Audit Events" subtitle="Immutable access history">
        {!auditQuery.data?.rows.length ? (
          <EmptyState title="No audit entries" description="Entries appear as admins perform write operations." />
        ) : (
          <div className="eg-admin-list">
            {auditQuery.data?.rows.map((row) => (
              <article key={row.id}>
                <div>
                  <strong>{row.action}</strong>
                  <span>{row.entity_table || 'n/a'}</span>
                </div>
                <p>
                  {row.summary || 'No summary'} • {formatDateTime(row.created_at)}
                </p>
              </article>
            ))}
          </div>
        )}
      </AdminCard>
    </div>
  );
}
