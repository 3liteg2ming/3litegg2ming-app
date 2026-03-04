function normalizeBaseUrl(input: string): string | null {
  const raw = String(input || '').trim();
  if (!raw) return null;

  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(withProtocol);
    return parsed.origin;
  } catch {
    return null;
  }
}

function isLocalhostOrigin(origin: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(origin);
}

export function getSafeAppOrigin(): string {
  const envPublicUrl = normalizeBaseUrl(String(import.meta.env.VITE_PUBLIC_SITE_URL || ''));
  const browserOrigin = typeof window !== 'undefined' ? String(window.location.origin || '').trim() : '';
  const isProdBuild = Boolean(import.meta.env.PROD);

  if (browserOrigin) {
    if (isProdBuild && isLocalhostOrigin(browserOrigin) && envPublicUrl) {
      return envPublicUrl;
    }
    return browserOrigin;
  }

  if (envPublicUrl) return envPublicUrl;
  return 'http://localhost:5173';
}

export function buildAuthRedirect(path = '/auth/callback'): string {
  const targetPath = path.startsWith('/') ? path : `/${path}`;
  return new URL(targetPath, getSafeAppOrigin()).toString();
}
