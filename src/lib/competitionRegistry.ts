export type CompetitionKey = 'preseason' | 'afl26';
export type CompetitionStatus = 'OPEN' | 'COMING_SOON';

export type CompetitionConfig = {
  key: CompetitionKey;
  label: string;
  status: CompetitionStatus;
  seasonSlug: string;
  dataFallbackSeasonSlug?: string;
};

export const ACTIVE_COMPETITION_STORAGE_KEY = 'eg_active_competition';
export const PRESEASON_PRIMARY_SEASON_SLUG = 'preseason-2026';
export const PRESEASON_FALLBACK_SEASON_SLUG = 'preseason';

export const COMPETITIONS: CompetitionConfig[] = [
  {
    key: 'preseason',
    label: 'Knockout Preseason',
    status: 'OPEN',
    seasonSlug: PRESEASON_PRIMARY_SEASON_SLUG,
    dataFallbackSeasonSlug: PRESEASON_FALLBACK_SEASON_SLUG,
  },
  {
    key: 'afl26',
    label: 'AFL 26',
    status: 'COMING_SOON',
    seasonSlug: 'afl26-season-two',
  },
];

export function getDefaultCompetitionKey(): CompetitionKey {
  return 'preseason';
}

export function getCompetitionByKey(key: CompetitionKey): CompetitionConfig {
  return COMPETITIONS.find((c) => c.key === key) || COMPETITIONS[0];
}

export function isSelectable(key: CompetitionKey): boolean {
  const comp = getCompetitionByKey(key);
  return comp.status === 'OPEN';
}

export function getUiCompetition(key: CompetitionKey): CompetitionConfig {
  return getCompetitionByKey(key);
}

export function coerceCompetitionKey(value: string | null | undefined): CompetitionKey {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'preseason') return 'preseason';
  if (raw === 'afl26') return 'afl26';
  if (raw === 'proteam' || raw === 'pro-team') return getDefaultCompetitionKey();
  return getDefaultCompetitionKey();
}

export function getStoredCompetitionKey(): CompetitionKey {
  if (typeof window === 'undefined') return getDefaultCompetitionKey();
  const stored = window.localStorage.getItem(ACTIVE_COMPETITION_STORAGE_KEY);
  const key = coerceCompetitionKey(stored);
  if (stored !== key) {
    window.localStorage.setItem(ACTIVE_COMPETITION_STORAGE_KEY, key);
  }
  return key;
}

export function setStoredCompetitionKey(key: CompetitionKey): CompetitionKey {
  const safe = coerceCompetitionKey(key);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(ACTIVE_COMPETITION_STORAGE_KEY, safe);
  }
  return safe;
}

export function getDataSeasonSlugForCompetition(key: CompetitionKey): string {
  const comp = getCompetitionByKey(key);
  return comp.seasonSlug;
}
