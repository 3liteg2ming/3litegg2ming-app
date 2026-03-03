import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminPermissionError, listFeatureFlags, parseJsonInput, upsertFeatureFlag } from '@/lib/adminApi';
import { useAdminLayoutContext } from '../AdminLayout';
import { useDebouncedValue } from '../useAdminTools';
import { AdminCard, EmptyState } from './AdminUi';

const STARTER_FLAGS = ['preseason_enabled', 'afl26_coming_soon', 'admin_tools_beta'];

export default function AdminFlags() {
  const queryClient = useQueryClient();
  const { globalSearch, pushToast } = useAdminLayoutContext();
  const [searchInput, setSearchInput] = useState('');
  const [selectedKey, setSelectedKey] = useState('preseason_enabled');
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [payloadText, setPayloadText] = useState('{}');

  const search = useDebouncedValue((searchInput || globalSearch).trim(), 250);

  const flagsQuery = useQuery({
    queryKey: ['admin', 'flags', search],
    queryFn: () => listFeatureFlags(search),
    refetchInterval: 30_000,
  });

  const flagMutation = useMutation({
    mutationFn: async () => {
      return upsertFeatureFlag({
        key: selectedKey,
        enabled,
        description,
        payload: parseJsonInput(payloadText),
      });
    },
    onSuccess: () => {
      pushToast('Feature flag saved.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'flags'] });
    },
    onError: (error) => {
      if (error instanceof AdminPermissionError) {
        pushToast('Admin privileges required for this action.', 'error');
      } else {
        pushToast(error instanceof Error ? error.message : 'Failed to save flag', 'error');
      }
    },
  });

  const flagOptions = useMemo(() => {
    const keys = new Set(STARTER_FLAGS);
    for (const flag of flagsQuery.data || []) keys.add(flag.key);
    return Array.from(keys).sort();
  }, [flagsQuery.data]);

  const current = useMemo(
    () => (flagsQuery.data || []).find((flag) => flag.key === selectedKey),
    [flagsQuery.data, selectedKey],
  );

  useEffect(() => {
    if (!current) return;
    setDescription(current.description || '');
    setEnabled(Boolean(current.enabled));
    setPayloadText(JSON.stringify(current.payload || {}, null, 2));
  }, [current]);

  return (
    <div className="eg-admin-grid two">
      <AdminCard title="Feature Flags" subtitle="Toggle runtime behavior and edit JSON payloads">
        <div className="eg-admin-toolbar">
          <label className="eg-admin-inline-field">
            <span>Search</span>
            <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Flag key" />
          </label>
          <label className="eg-admin-inline-field">
            <span>Flag Key</span>
            <select
              value={selectedKey}
              onChange={(event) => {
                const next = event.target.value;
                setSelectedKey(next);
                const row = (flagsQuery.data || []).find((flag) => flag.key === next);
                setDescription(row?.description || '');
                setEnabled(Boolean(row?.enabled));
                setPayloadText(JSON.stringify(row?.payload || {}, null, 2));
              }}
            >
              {flagOptions.map((key) => (
                <option value={key} key={key}>
                  {key}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="eg-admin-stack-field">
          <span>Description</span>
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What this flag controls" />
        </label>
        <label className="eg-admin-stack-field">
          <span>Payload JSON</span>
          <textarea value={payloadText} onChange={(event) => setPayloadText(event.target.value)} rows={7} />
        </label>

        <div className="eg-admin-inline-buttons">
          <label className="eg-admin-toggle">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            <span>Enabled</span>
          </label>
          <button type="button" onClick={() => flagMutation.mutate()} disabled={flagMutation.isPending}>
            Save Flag
          </button>
        </div>
      </AdminCard>

      <AdminCard title="Current Value" subtitle="Preview current flag state">
        {!current ? (
          <EmptyState title="Flag not created" description="Saving this key will create the flag." />
        ) : (
          <div className="eg-admin-preview">
            <p className="badge">{current.enabled ? 'Enabled' : 'Disabled'}</p>
            <h2>{current.key}</h2>
            <p>{description || current.description || '(No description)'}</p>
            <pre className="eg-admin-json">{payloadText}</pre>
          </div>
        )}
      </AdminCard>
    </div>
  );
}
