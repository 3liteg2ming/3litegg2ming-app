import { supabase } from '../lib/supabase';

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

const AFL26_SEASON_ID = '55184ee9-4e96-496d-8d19-ca65d13ca28c';

// small cache so Home + Fixtures don’t refetch back-to-back
let cache: { at: number; rounds: AflRound[] } | null = null;
const TTL_MS = 60_000;

function toNum(v: any): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function coerceStatus(v: any): 'SCHEDULED' | 'LIVE' | 'FINAL' {
  const s = String(v || '').toUpperCase();
  if (s === 'LIVE') return 'LIVE';
  if (s === 'FINAL' || s === 'FULL_TIME' || s === 'FULLTIME') return 'FINAL';
  return 'SCHEDULED';
}

export function invalidateAfl26Cache() {
  cache = null;
}

export function peekAfl26RoundsCache(): AflRound[] | null {
  if (!cache) return null;
  if (Date.now() - cache.at >= TTL_MS) return null;
  return cache.rounds;
}

export async function getAfl26RoundsFromSupabase(opts?: { force?: boolean }): Promise<AflRound[]> {
  const now = Date.now();
  if (!opts?.force && cache && now - cache.at < TTL_MS) return cache.rounds;

  // The eg_fixture_cards view has changed a few times during the build.
  // Try a few select shapes (and finally fallback to eg_fixtures) so the page never hard-crashes
  // just because a column or view was renamed.
  const attempts: Array<{ table: 'eg_fixture_cards' | 'eg_fixtures'; select: string }> = [
    {
      table: 'eg_fixture_cards',
      select: [
        'id',
        'season_id',
        'round',
        'status',
        'venue',
        'home_team_slug',
        'away_team_slug',
        'home_goals',
        'home_behinds',
        'home_total',
        'away_goals',
        'away_behinds',
        'away_total',
        'home_coach_name',
        'away_coach_name',
        'home_psn',
        'away_psn',
      ].join(','),
    },
    {
      table: 'eg_fixture_cards',
      select: [
        'id',
        'season_id',
        'round',
        'status',
        'venue',
        'home_team_slug',
        'away_team_slug',
        'home_goals',
        'home_behinds',
        'home_total',
        'away_goals',
        'away_behinds',
        'away_total',
        'home_coach_name',
        'away_coach_name',
      ].join(','),
    },
    {
      table: 'eg_fixture_cards',
      select: [
        'id',
        'season_id',
        'round',
        'status',
        'venue',
        'home_team_slug',
        'away_team_slug',
        'home_goals',
        'home_behinds',
        'home_total',
        'away_goals',
        'away_behinds',
        'away_total',
      ].join(','),
    },
    {
      table: 'eg_fixtures',
      select: [
        'id',
        'season_id',
        'round',
        'status',
        'venue',
        'home_team_slug',
        'away_team_slug',
        'home_goals',
        'home_behinds',
        'home_total',
        'away_goals',
        'away_behinds',
        'away_total',
      ].join(','),
    },
  ];

  let data: any[] | null = null;
  let lastError: any = null;

  for (const a of attempts) {
    const res = await supabase
      .from(a.table)
      .select(a.select)
      .eq('season_id', AFL26_SEASON_ID)
      .order('round', { ascending: true });

    if (!res.error) {
      data = (res.data as any[]) || [];
      lastError = null;
      break;
    }

    lastError = res.error;
  }

  if (lastError) throw lastError;


  const rows = (data || []) as any[];
  const byRound = new Map<number, AflRound>();

  for (const r of rows) {
    const roundNo = Number(r.round);
    if (!Number.isFinite(roundNo)) continue;

    if (!byRound.has(roundNo)) byRound.set(roundNo, { round: roundNo, matches: [] });

    const hg = toNum(r.home_goals);
    const hb = toNum(r.home_behinds);
    const ag = toNum(r.away_goals);
    const ab = toNum(r.away_behinds);

    const ht = toNum(r.home_total) ?? (hg != null && hb != null ? hg * 6 + hb : null);
    const at = toNum(r.away_total) ?? (ag != null && ab != null ? ag * 6 + ab : null);

    const hasScores = hg != null && hb != null && ag != null && ab != null && ht != null && at != null;

    byRound.get(roundNo)!.matches.push({
      id: String(r.id),
      venue: r.venue ? String(r.venue) : undefined,
      status: coerceStatus(r.status),

      home: String(r.home_team_slug),
      away: String(r.away_team_slug),

      // ✅ coach names from eg_coaches via view
      homeCoachName: r.home_coach_name ? String(r.home_coach_name) : undefined,
      awayCoachName: r.away_coach_name ? String(r.away_coach_name) : undefined,

      // ✅ psn from eg_coaches via view
      homePsn: r.home_psn ? String(r.home_psn) : undefined,
      awayPsn: r.away_psn ? String(r.away_psn) : undefined,

      homeScore: hasScores ? { goals: hg!, behinds: hb!, total: ht! } : undefined,
      awayScore: hasScores ? { goals: ag!, behinds: ab!, total: at! } : undefined,
    });
  }

  const out = Array.from(byRound.values()).sort((a, b) => a.round - b.round);
  cache = { at: now, rounds: out };
  return out;
}
