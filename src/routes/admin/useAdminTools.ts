import { useEffect, useMemo, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}

export function usePagination(total: number, pageSize: number) {
  return useMemo(() => {
    const safeSize = Math.max(1, pageSize);
    const pages = Math.max(1, Math.ceil(total / safeSize));
    return {
      pages,
      label: `${total} item${total === 1 ? '' : 's'}`,
    };
  }, [total, pageSize]);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}
