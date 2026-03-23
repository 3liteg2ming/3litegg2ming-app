/**
 * Melvin Bet odds data layer.
 *
 * Odds are stored in an eg_content_blocks row with key "melvin_bet_odds".
 * The payload shape is: { odds: Record<fixtureId, { home: number; away: number }> }
 * where home/away are decimal odds (e.g. 1.85).
 *
 * Falls back to deterministic seeded odds when no admin data exists.
 */
import { requireSupabaseClient } from './supabaseClient';

export type FixtureOdds = { home: number; away: number };
export type OddsMap = Record<string, FixtureOdds>;

const CONTENT_KEY = 'melvin_bet_odds';

let cachedOdds: OddsMap | null = null;
let fetchPromise: Promise<OddsMap> | null = null;

export async function fetchMelvinOdds(): Promise<OddsMap> {
  if (cachedOdds) return cachedOdds;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    try {
      const supabase = requireSupabaseClient();
      const { data, error } = await supabase
        .from('eg_content_blocks')
        .select('payload')
        .eq('key', CONTENT_KEY)
        .maybeSingle();

      if (error || !data?.payload) {
        cachedOdds = {};
        return cachedOdds;
      }

      const raw = (data.payload as Record<string, unknown>)?.odds;
      if (!raw || typeof raw !== 'object') {
        cachedOdds = {};
        return cachedOdds;
      }

      const map: OddsMap = {};
      for (const [id, val] of Object.entries(raw as Record<string, unknown>)) {
        const v = val as Record<string, unknown>;
        if (v && typeof v.home === 'number' && typeof v.away === 'number') {
          map[id] = { home: v.home, away: v.away };
        }
      }
      cachedOdds = map;
      return cachedOdds;
    } catch {
      cachedOdds = {};
      return cachedOdds;
    } finally {
      fetchPromise = null;
    }
  })();

  return fetchPromise;
}

export function peekMelvinOdds(): OddsMap | null {
  return cachedOdds;
}

export function invalidateMelvinOddsCache() {
  cachedOdds = null;
  fetchPromise = null;
}
