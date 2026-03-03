import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listStorageObjects } from '@/lib/adminApi';
import { useAdminLayoutContext } from '../AdminLayout';
import { formatDateTime } from '../useAdminTools';
import { AdminCard, EmptyState } from './AdminUi';

export default function AdminAssets() {
  const { pushToast } = useAdminLayoutContext();
  const [bucket, setBucket] = useState('uploads');
  const [prefix, setPrefix] = useState('');
  const [submittedBucket, setSubmittedBucket] = useState('uploads');
  const [submittedPrefix, setSubmittedPrefix] = useState('');

  const objectsQuery = useQuery({
    queryKey: ['admin', 'assets', submittedBucket, submittedPrefix],
    queryFn: () => listStorageObjects(submittedBucket, submittedPrefix),
    retry: 1,
  });

  return (
    <AdminCard title="Storage / Assets Browser" subtitle="Browse bucket objects with prefix filters">
      <form
        className="eg-admin-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmittedBucket(bucket.trim());
          setSubmittedPrefix(prefix.trim());
        }}
      >
        <label className="eg-admin-inline-field">
          <span>Bucket</span>
          <input value={bucket} onChange={(event) => setBucket(event.target.value)} placeholder="uploads" />
        </label>
        <label className="eg-admin-inline-field">
          <span>Prefix</span>
          <input value={prefix} onChange={(event) => setPrefix(event.target.value)} placeholder="fixtures/" />
        </label>
        <button type="submit">Load Assets</button>
      </form>

      {objectsQuery.isLoading ? <p className="eg-admin-muted">Loading assets…</p> : null}
      {objectsQuery.error ? (
        <p className="eg-admin-error">
          {objectsQuery.error instanceof Error ? objectsQuery.error.message : 'Failed to load objects'}
        </p>
      ) : null}

      {!objectsQuery.isLoading && !(objectsQuery.data?.length || 0) ? (
        <EmptyState title="No objects" description="No files matched this bucket/prefix." />
      ) : (
        <div className="eg-admin-table-wrap">
          <table className="eg-admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Updated</th>
                <th>Created</th>
                <th>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {(objectsQuery.data || []).map((obj) => (
                <tr key={obj.name + obj.updated_at}>
                  <td>{obj.name}</td>
                  <td>{formatDateTime(obj.updated_at)}</td>
                  <td>{formatDateTime(obj.created_at)}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => pushToast(JSON.stringify(obj.metadata || {}, null, 2), 'info')}
                    >
                      View Metadata
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminCard>
  );
}
