import {
  PRESEASON_FALLBACK_SEASON_SLUG,
  PRESEASON_PRIMARY_SEASON_SLUG,
} from './competitionRegistry';

type SeasonRecord = {
  id: string;
  slug: string;
};

type ResolveSeasonOptions = {
  preferFixtureRows?: boolean;
};

const seasonRecordCache = new Map<string, SeasonRecord>();
const fixtureRowPresenceCache = new Map<string, boolean>();
const STRICT_SEASON_SLUGS = new Set([
  PRESEASON_PRIMARY_SEASON_SLUG,
  PRESEASON_FALLBACK_SEASON_SLUG,
  'knockout-preseason',
  'afl26',
  'afl-26',
  'afl26-season-two',
]);

export function normalizeSeasonSlug(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

export function getSeasonSlugCandidatesForSlug(seasonSlug: string): string[] {
  const normalized = normalizeSeasonSlug(seasonSlug);
  if (!normalized) return [];

  if (
    normalized === PRESEASON_PRIMARY_SEASON_SLUG ||
    normalized === PRESEASON_FALLBACK_SEASON_SLUG ||
    normalized === 'knockout-preseason'
  ) {
    return [PRESEASON_PRIMARY_SEASON_SLUG, PRESEASON_FALLBACK_SEASON_SLUG];
  }

  if (normalized === 'afl26' || normalized === 'afl-26' || normalized === 'afl26-season-two') {
    return ['afl26-season-two'];
  }

  return [normalized];
}

export function getCanonicalSeasonSlug(seasonSlug: string): string {
  const candidates = getSeasonSlugCandidatesForSlug(seasonSlug);
  return candidates[0] || normalizeSeasonSlug(seasonSlug);
}

function shouldAllowLooseFallback(requested: string, candidates: string[]): boolean {
  if (!requested) return false;
  if (STRICT_SEASON_SLUGS.has(requested)) return false;
  if (candidates.length !== 1) return false;
  return candidates[0] === requested;
}

async function fetchSeasonBySlug(supabase: any, slug: string): Promise<SeasonRecord | null> {
  const normalized = normalizeSeasonSlug(slug);
  if (!normalized) return null;

  const cached = seasonRecordCache.get(normalized);
  if (cached) return cached;

  const { data, error } = await supabase.from('eg_seasons').select('id, slug').eq('slug', normalized).maybeSingle();
  if (error || !data?.id) return null;

  const record = {
    id: String(data.id),
    slug: normalizeSeasonSlug((data as any).slug || normalized),
  };

  seasonRecordCache.set(normalized, record);
  seasonRecordCache.set(record.slug, record);
  return record;
}

async function fetchSeasonByFuzzySlug(supabase: any, slug: string): Promise<SeasonRecord | null> {
  const normalized = normalizeSeasonSlug(slug);
  if (!normalized) return null;

  const { data, error } = await supabase.from('eg_seasons').select('id, slug').ilike('slug', `%${normalized}%`).limit(1);
  if (error || !Array.isArray(data) || !data[0]?.id) return null;

  const record = {
    id: String(data[0].id),
    slug: normalizeSeasonSlug((data[0] as any).slug || normalized),
  };

  seasonRecordCache.set(normalized, record);
  seasonRecordCache.set(record.slug, record);
  return record;
}

async function fetchLatestSeasonRecord(supabase: any): Promise<SeasonRecord | null> {
  const { data, error } = await supabase
    .from('eg_seasons')
    .select('id, slug')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;

  const record = {
    id: String(data.id),
    slug: normalizeSeasonSlug((data as any).slug || ''),
  };

  if (record.slug) {
    seasonRecordCache.set(record.slug, record);
  }
  return record;
}

async function hasFixtureRowsForSeason(supabase: any, seasonId: string): Promise<boolean> {
  const cached = fixtureRowPresenceCache.get(seasonId);
  if (cached === true) return true;

  const { count, error } = await supabase
    .from('eg_fixtures')
    .select('id', { count: 'exact', head: true })
    .eq('season_id', seasonId);

  const hasRows = !error && Number(count || 0) > 0;
  if (hasRows) fixtureRowPresenceCache.set(seasonId, true);
  return hasRows;
}

export async function resolveSeasonRecord(
  supabase: any,
  seasonSlug: string,
  options: ResolveSeasonOptions = {},
): Promise<SeasonRecord> {
  const requested = normalizeSeasonSlug(seasonSlug);
  const candidates = getSeasonSlugCandidatesForSlug(requested);
  if (!requested || !candidates.length) {
    throw new Error('seasonSlug is required');
  }

  let firstResolved: SeasonRecord | null = null;

  for (const candidate of candidates) {
    const record = await fetchSeasonBySlug(supabase, candidate);
    if (!record) continue;
    if (!firstResolved) firstResolved = record;
    if (!options.preferFixtureRows) return record;

    const hasRows = await hasFixtureRowsForSeason(supabase, record.id);
    if (hasRows) return record;
  }

  if (firstResolved) return firstResolved;

  if (!shouldAllowLooseFallback(requested, candidates)) {
    throw new Error(`Season not found for slug "${requested}"`);
  }

  for (const candidate of candidates) {
    const record = await fetchSeasonByFuzzySlug(supabase, candidate);
    if (record) return record;
  }

  const latest = await fetchLatestSeasonRecord(supabase);
  if (latest) return latest;

  throw new Error(`Season not found for slug "${requested}"`);
}

export async function resolveSeasonId(
  supabase: any,
  seasonSlug: string,
  options: ResolveSeasonOptions = {},
): Promise<string> {
  const record = await resolveSeasonRecord(supabase, seasonSlug, options);
  return record.id;
}
