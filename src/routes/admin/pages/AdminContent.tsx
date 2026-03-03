import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AdminPermissionError,
  listContentBlocks,
  parseJsonInput,
  upsertContentBlock,
} from '@/lib/adminApi';
import { useAdminLayoutContext } from '../AdminLayout';
import { useDebouncedValue } from '../useAdminTools';
import { AdminCard, EmptyState } from './AdminUi';

const STARTER_KEYS = ['announcement_bar', 'home_hero_notice'];

export default function AdminContent() {
  const queryClient = useQueryClient();
  const { globalSearch, pushToast } = useAdminLayoutContext();

  const [searchInput, setSearchInput] = useState('');
  const [selectedKey, setSelectedKey] = useState('announcement_bar');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [published, setPublished] = useState(false);
  const [payloadText, setPayloadText] = useState('{}');

  const search = useDebouncedValue((searchInput || globalSearch).trim(), 250);

  const contentQuery = useQuery({
    queryKey: ['admin', 'content', search],
    queryFn: () => listContentBlocks(search),
    refetchInterval: 30_000,
  });

  const contentMutation = useMutation({
    mutationFn: async () => {
      const payload = parseJsonInput(payloadText);
      return upsertContentBlock({
        key: selectedKey,
        title,
        body,
        published,
        payload,
      });
    },
    onSuccess: () => {
      pushToast('Content block saved.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'content'] });
    },
    onError: (error) => {
      if (error instanceof AdminPermissionError) {
        pushToast('Admin privileges required for this action.', 'error');
      } else {
        pushToast(error instanceof Error ? error.message : 'Failed to save content', 'error');
      }
    },
  });

  const keyOptions = useMemo(() => {
    const keys = new Set(STARTER_KEYS);
    for (const row of contentQuery.data || []) keys.add(row.key);
    return Array.from(keys).sort();
  }, [contentQuery.data]);

  const selectedRow = useMemo(() => {
    return (contentQuery.data || []).find((row) => row.key === selectedKey);
  }, [contentQuery.data, selectedKey]);

  useEffect(() => {
    if (!selectedRow) return;
    setTitle(selectedRow.title || '');
    setBody(selectedRow.body || '');
    setPublished(Boolean(selectedRow.published));
    setPayloadText(JSON.stringify(selectedRow.payload || {}, null, 2));
  }, [selectedRow]);

  return (
    <div className="eg-admin-grid two">
      <AdminCard title="Content Blocks" subtitle="Manage announcement/cms keys with publish controls">
        <div className="eg-admin-toolbar">
          <label className="eg-admin-inline-field">
            <span>Search</span>
            <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Block key or title" />
          </label>
          <label className="eg-admin-inline-field">
            <span>Block Key</span>
            <select
              value={selectedKey}
              onChange={(event) => {
                const nextKey = event.target.value;
                setSelectedKey(nextKey);
                const row = (contentQuery.data || []).find((item) => item.key === nextKey);
                setTitle(row?.title || '');
                setBody(row?.body || '');
                setPublished(Boolean(row?.published));
                setPayloadText(JSON.stringify(row?.payload || {}, null, 2));
              }}
            >
              {keyOptions.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="eg-admin-stack-field">
          <span>Title</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Headline" />
        </label>
        <label className="eg-admin-stack-field">
          <span>Body</span>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={6} placeholder="Content body" />
        </label>
        <label className="eg-admin-stack-field">
          <span>Payload JSON</span>
          <textarea value={payloadText} onChange={(event) => setPayloadText(event.target.value)} rows={6} />
        </label>

        <div className="eg-admin-inline-buttons">
          <label className="eg-admin-toggle">
            <input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} />
            <span>Published</span>
          </label>
          <button type="button" onClick={() => contentMutation.mutate()} disabled={contentMutation.isPending}>
            Save Block
          </button>
        </div>

        <div className="eg-admin-danger-zone">
          <h4>Danger Zone</h4>
          <p>Publishing content is instantly visible to clients that read `eg_content_blocks`.</p>
        </div>
      </AdminCard>

      <AdminCard title="Live Preview" subtitle="Quick preview of current block values">
        {!selectedRow ? (
          <EmptyState title="No existing block" description="Create this key to start publishing content." />
        ) : (
          <div className="eg-admin-preview">
            <p className="badge">{selectedRow.published ? 'Published' : 'Draft'}</p>
            <h2>{title || selectedRow.title || '(No title)'}</h2>
            <p>{body || selectedRow.body || '(No body)'}</p>
            <pre className="eg-admin-json">{payloadText}</pre>
          </div>
        )}
      </AdminCard>
    </div>
  );
}
