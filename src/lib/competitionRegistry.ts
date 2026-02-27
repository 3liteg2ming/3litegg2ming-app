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

export const COMPETITIONS: CompetitionConfig[] = [
  {
    key: 'preseason',
    label: 'Knockout Preseason',
    status: 'OPEN',
    seasonSlug: 'preseason',
    dataFallbackSeasonSlug: 'afl26-season-two',
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
  // Explicitly coerce any legacy/blocked values to preseason.
  if (raw === 'afl26' || raw === 'proteam' || raw === 'pro-team') return getDefaultCompetitionKey();
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
  // Preseason soft-launch: UI stays preseason, data uses seeded AFL26 season until preseason exists.
  if (comp.key === 'preseason') return comp.dataFallbackSeasonSlug || comp.seasonSlug;
  return comp.seasonSlug;
}

