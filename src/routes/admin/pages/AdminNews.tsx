import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminLayoutContext } from '../AdminLayout';
import { AdminCard, EmptyState } from './AdminUi';

type NewsRow = {
  id: string;
  title: string;
  category: string;
  image_url: string;
  caption: string;
  display_order: number;
  published_at: string;
  is_published?: boolean;
};

type NewsFormState = {
  title: string;
  category: string;
  image_url: string;
  caption: string;
  display_order: number;
  is_published: boolean;
};

const EMPTY_FORM: NewsFormState = {
  title: '',
  category: '',
  image_url: '',
  caption: '',
  display_order: 0,
  is_published: true,
};

export default function AdminNews() {
  const { pushToast } = useAdminLayoutContext();

  const [items, setItems] = useState<NewsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<NewsFormState>(EMPTY_FORM);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadNews = useCallback(async () => {
    setLoading(true);
    try {
      const repo = await import('@/lib/homeRepo');
      const rows = await repo.fetchAllHomepageNews();
      setItems(rows as NewsRow[]);
    } catch (err) {
      console.error('[AdminNews] Failed to load news:', err);
      pushToast('Failed to load news items.', 'error');
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    loadNews();
  }, [loadNews]);

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const startEdit = (item: NewsRow) => {
    setEditingId(item.id);
    setForm({
      title: item.title,
      category: item.category,
      image_url: item.image_url,
      caption: item.caption,
      display_order: item.display_order,
      is_published: item.is_published !== false,
    });
  };

  const handleSave = async () => {
    if (!form.title || !form.image_url) {
      pushToast('Title and image URL are required.', 'error');
      return;
    }
    setSaving(true);
    try {
      const repo = await import('@/lib/homeRepo');
      const result = await repo.upsertHomepageNews({
        ...form,
        id: editingId || undefined,
      });
      if (result) {
        pushToast(editingId ? 'News item updated.' : 'News item created.', 'success');
        resetForm();
        await loadNews();
      } else {
        pushToast('Failed to save news item. Check console for details.', 'error');
      }
    } catch (err: any) {
      console.error('[AdminNews] Save failed:', err);
      pushToast(`Save failed: ${err?.message || 'Unknown error'}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const repo = await import('@/lib/homeRepo');
      const result = await repo.deleteHomepageNews(id);
      if (result.ok) {
        pushToast('News item deleted.', 'success');
        if (editingId === id) resetForm();
        await loadNews();
      } else {
        pushToast(`Delete failed: ${result.error || 'Unknown error'}`, 'error');
      }
    } catch (err: any) {
      console.error('[AdminNews] Delete failed:', err);
      pushToast(`Delete failed: ${err?.message || 'Unknown error'}`, 'error');
    }
  };

  const handleImageUpload = async (file: File) => {
    setUploading(true);
    try {
      const repo = await import('@/lib/homeRepo');
      const result = await repo.uploadNewsImage(file);
      if (result.url) {
        setForm((prev) => ({ ...prev, image_url: result.url! }));
        pushToast('Image uploaded.', 'success');
      } else {
        pushToast(`Image upload failed: ${result.error || 'Storage rejected the file. Are you logged in as admin?'}`, 'error');
      }
    } catch (err: any) {
      console.error('[AdminNews] Upload failed:', err);
      pushToast(`Upload failed: ${err?.message || 'Unknown error'}`, 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const updateField = <K extends keyof NewsFormState>(key: K, value: NewsFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="eg-admin-grid two">
      <AdminCard
        title={editingId ? 'Edit News Item' : 'Create News Item'}
        subtitle="Homepage news cards shown below the Season Live hero"
      >
        <label className="eg-admin-stack-field">
          <span>Title *</span>
          <input
            value={form.title}
            onChange={(e) => updateField('title', e.target.value)}
            placeholder="News headline"
          />
        </label>

        <label className="eg-admin-stack-field">
          <span>Category</span>
          <input
            value={form.category}
            onChange={(e) => updateField('category', e.target.value)}
            placeholder="e.g. Transfer, Match Day, Announcement"
          />
        </label>

        <div className="eg-admin-stack-field">
          <span>Image *</span>
          <div className="eg-admin-toolbar" style={{ gap: 8 }}>
            <input
              value={form.image_url}
              onChange={(e) => updateField('image_url', e.target.value)}
              placeholder="https://... or upload"
              style={{ flex: 1 }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading\u2026' : 'Upload'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImageUpload(f);
              }}
            />
          </div>
          {form.image_url && (
            <img
              src={form.image_url}
              alt="Preview"
              style={{
                width: '100%',
                maxWidth: 280,
                borderRadius: 10,
                marginTop: 8,
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            />
          )}
        </div>

        <label className="eg-admin-stack-field">
          <span>Caption</span>
          <input
            value={form.caption}
            onChange={(e) => updateField('caption', e.target.value)}
            placeholder="Short description"
          />
        </label>

        <div className="eg-admin-toolbar" style={{ gap: 12 }}>
          <label className="eg-admin-inline-field" style={{ flex: '0 0 auto' }}>
            <span>Order</span>
            <input
              type="number"
              value={form.display_order}
              onChange={(e) => updateField('display_order', Number(e.target.value) || 0)}
              style={{ width: 70 }}
            />
          </label>
          <label className="eg-admin-toggle">
            <input
              type="checkbox"
              checked={form.is_published}
              onChange={(e) => updateField('is_published', e.target.checked)}
            />
            <span>Published</span>
          </label>
        </div>

        <div className="eg-admin-inline-buttons">
          <button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving\u2026' : editingId ? 'Update Item' : 'Create Item'}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} style={{ opacity: 0.7 }}>
              Cancel Edit
            </button>
          )}
        </div>
      </AdminCard>

      <AdminCard title="All News Items" subtitle={`${items.length} total items`}>
        {loading ? (
          <p style={{ color: 'var(--admin-muted)', padding: '16px 0' }}>Loading\u2026</p>
        ) : items.length === 0 ? (
          <EmptyState
            title="No news items"
            description="Create your first news item using the form. It will appear on the homepage."
          />
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: 10,
                  borderRadius: 10,
                  border: '1px solid var(--admin-border)',
                  background: 'var(--admin-surface)',
                  alignItems: 'flex-start',
                }}
              >
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt={item.title}
                    style={{
                      width: 80,
                      height: 54,
                      borderRadius: 6,
                      objectFit: 'cover',
                      flexShrink: 0,
                      border: '1px solid var(--admin-border)',
                    }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, fontSize: '0.70rem', color: 'var(--admin-muted)', marginBottom: 4 }}>
                    {item.category && (
                      <span style={{ color: 'var(--admin-accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.62rem' }}>
                        {item.category}
                      </span>
                    )}
                    <span>Order: {item.display_order}</span>
                    <span style={{ color: item.is_published !== false ? 'var(--admin-success)' : 'var(--admin-danger)' }}>
                      {item.is_published !== false ? 'Published' : 'Draft'}
                    </span>
                  </div>
                  <strong style={{ fontSize: '0.85rem' }}>{item.title}</strong>
                  {item.caption && (
                    <p style={{ margin: '2px 0 0', opacity: 0.5, fontSize: '0.78rem' }}>{item.caption}</p>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button type="button" onClick={() => startEdit(item)} style={{ fontSize: '0.72rem' }}>
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      style={{ fontSize: '0.72rem', color: 'var(--admin-danger)' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminCard>
    </div>
  );
}
