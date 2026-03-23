/**
 * Premiership odds data layer.
 *
 * Stored in eg_content_blocks with key "melvin_prem_odds".
 * Payload shape: { odds: Record<teamKey, number> }
 * where the value is a decimal odd (e.g. 3.50).
 */
import { requireSupabaseClient } from './supabaseClient';

export type PremOddsMap = Record<string, number>;

const CONTENT_KEY = 'melvin_prem_odds';

let cachedOdds: PremOddsMap | null = null;
let fetchPromise: Promise<PremOddsMap> | null = null;

export async function fetchPremOdds(): Promise<PremOddsMap> {
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

      const map: PremOddsMap = {};
      for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof val === 'number' && val > 0) {
          map[key] = val;
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

export function invalidatePremOddsCache() {
  cachedOdds = null;
  fetchPromise = null;
}
