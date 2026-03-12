import { getDataSeasonSlugForCompetition, getStoredCompetitionKey } from '../lib/competitionRegistry';
import { fetchSeasonFixtures, normalizeFixtureStatus } from '../lib/fixturesRepo';

export type ScoreLine = { total: number; goals: number; behinds: number };

export type AflMatch = {
  id: string;
  venue?: string;
  status: 'SCHEDULED' | 'LIVE' | 'FINAL';

  home: string;
  away: string;

  homeCoachName?: string;
  awayCoachName?: string;

  homePsn?: string;
  awayPsn?: string;

  homeScore?: ScoreLine;
  awayScore?: ScoreLine;
};

export type AflRound = {
  round: number;
  matches: AflMatch[];
};

let cache = new Map<string, { at: number; rounds: AflRound[] }>();
const TTL_MS = 60_000;

function normalizeSlug(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function getActiveSeasonSlug() {
  const activeCompetition = getStoredCompetitionKey();
  return getDataSeasonSlugForCompetition(activeCompetition);
}

function toScoreLine(goals: number | null, behinds: number | null, total: number | null): ScoreLine | undefined {
  if (goals == null || behinds == null || total == null) return undefined;
  return { goals, behinds, total };
}

export function invalidateAfl26Cache() {
  cache.clear();
}

export function peekAfl26RoundsCache(seasonSlug?: string): AflRound[] | null {
  const key = normalizeSlug(seasonSlug || getActiveSeasonSlug());
  if (!key) return null;
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at >= TTL_MS) return null;
  return hit.rounds;
}

export async function getAfl26RoundsFromSupabase(opts?: { force?: boolean; seasonSlug?: string }): Promise<AflRound[]> {
  const now = Date.now();
  const requestedSlug = normalizeSlug(opts?.seasonSlug || getActiveSeasonSlug());
  const cacheKey = requestedSlug;
  const cached = cache.get(cacheKey);
  if (!opts?.force && cached && now - cached.at < TTL_MS) return cached.rounds;

  const { fixtures } = await fetchSeasonFixtures(requestedSlug, { limit: 1000, offset: 0 });
  const byRound = new Map<number, AflRound>();

  for (const fixture of fixtures) {
    const roundNo = Number(fixture.round);
    if (!Number.isFinite(roundNo)) continue;

    if (!byRound.has(roundNo)) byRound.set(roundNo, { round: roundNo, matches: [] });

    byRound.get(roundNo)!.matches.push({
      id: fixture.id,
      venue: fixture.venue || undefined,
      status: normalizeFixtureStatus(fixture.status, fixture),
      home: fixture.home_team_key || fixture.home_team_slug || 'unknown',
      away: fixture.away_team_key || fixture.away_team_slug || 'unknown',
      homeScore: toScoreLine(fixture.home_goals, fixture.home_behinds, fixture.home_total),
      awayScore: toScoreLine(fixture.away_goals, fixture.away_behinds, fixture.away_total),
    });
  }

  const out = Array.from(byRound.values()).sort((a, b) => a.round - b.round);
  cache.set(cacheKey, { at: now, rounds: out });
  return out;
}
