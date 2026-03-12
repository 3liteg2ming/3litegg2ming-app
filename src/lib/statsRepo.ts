import { getDataSeasonSlugForCompetition, getStoredCompetitionKey } from './competitionRegistry';
import { fetchLeaderCategories, type Mode, type StatLeaderCategory } from './stats-leaders-cache';

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: StatLeaderCategory[] }>();

function isFresh(at: number) {
  return Date.now() - at < TTL_MS;
}

export async function fetchStatsLeaderCategories(mode: Mode): Promise<StatLeaderCategory[]> {
  const cacheKey = `${getStoredCompetitionKey()}:${getDataSeasonSlugForCompetition(getStoredCompetitionKey())}:${mode}`;
  const cached = cache.get(cacheKey);
  if (cached && isFresh(cached.at)) return cached.value;

  const rows = await fetchLeaderCategories(mode);
  const value = Array.isArray(rows) ? rows : [];
  cache.set(cacheKey, { at: Date.now(), value });
  return value;
}

export function clearStatsCategoriesCache() {
  cache.clear();
}
