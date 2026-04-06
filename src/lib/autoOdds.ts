/**
 * Automatic odds generation for Melvin Bet.
 *
 * Generates realistic AFL-style decimal odds from ladder data.
 * Admin-set odds always take priority — these are only used as fallback.
 *
 * Real AFL odds typically range:
 *  - Close match: $1.75 vs $2.10
 *  - Moderate favourite: $1.45 vs $2.80
 *  - Strong favourite: $1.20 vs $4.50
 *  - Only last vs first gets extreme like $1.12 vs $7+
 *
 * The algorithm compresses team ratings into a narrow band so most
 * matches produce competitive odds in the $1.40–$3.00 range.
 */

import type { LadderRow } from '../hooks/useLadder';
import { resolveTeamKey } from './entityResolvers';
import type { TeamKey } from './teamAssets';

/* ── Power rating ──────────────────────────────────── */

export type TeamRating = {
  teamId: string;
  teamKey: TeamKey;
  teamName: string;
  rating: number;          // compressed scale, centred around 50
  played: number;
  wins: number;
  losses: number;
  percentage: number;
  points: number;
  form: number;            // recent form factor 0–1
};

const TOTAL_ROUNDS = 14;   // Season length for projection

/**
 * Build a power rating for every team on the ladder.
 *
 * The key insight for realistic odds: teams need to be CLOSE together.
 * In AFL, even last-placed teams beat top teams ~20% of the time.
 * We map all teams into a narrow band (roughly 40–60 on a 0–100 scale).
 */
export function buildTeamRatings(ladder: LadderRow[]): Map<string, TeamRating> {
  if (!ladder.length) return new Map();

  const ratings = new Map<string, TeamRating>();

  // First pass: compute raw scores
  const rawScores: Array<{ row: LadderRow; raw: number; form: number }> = [];

  for (const row of ladder) {
    const played = Math.max(row.played, 1);

    // Win-rate (0–1)
    const winRate = row.wins / played;

    // Percentage — normalise around 100% (most teams sit 60–160%)
    const pctFactor = Math.min(Math.max(row.percentage, 60), 160);
    const pctNorm = (pctFactor - 60) / 100; // 0–1

    // Form from last 5 results (weighted recent-first)
    const formWeights = [5, 4, 3, 2, 1];
    let formScore = 0;
    let formTotal = 0;
    const results = row.last5_results || [];
    for (let i = 0; i < formWeights.length; i++) {
      const w = formWeights[i];
      formTotal += w;
      const r = (results[i] || '').toUpperCase();
      if (r === 'W') formScore += w;
      else if (r === 'D') formScore += w * 0.5;
    }
    const formNorm = formTotal > 0 ? formScore / formTotal : 0.5;

    // Raw composite (0–1): win rate dominant, percentage & form secondary
    const raw = winRate * 0.55 + pctNorm * 0.25 + formNorm * 0.20;

    rawScores.push({ row, raw, form: formNorm });
  }

  // Compress into a narrow band: map raw 0–1 → rating 42–58
  // This ensures even top-vs-bottom is only ~16 points apart
  const BAND_LOW = 42;
  const BAND_HIGH = 58;

  const minRaw = Math.min(...rawScores.map((s) => s.raw));
  const maxRaw = Math.max(...rawScores.map((s) => s.raw));
  const rawRange = maxRaw - minRaw || 1;

  for (const { row, raw, form } of rawScores) {
    const normalised = (raw - minRaw) / rawRange; // 0–1
    const rating = BAND_LOW + normalised * (BAND_HIGH - BAND_LOW);

    const teamKey = resolveTeamKey({ slug: row.team_slug, name: row.team_name });

    ratings.set(row.team_id, {
      teamId: row.team_id,
      teamKey,
      teamName: row.team_name,
      rating: Math.round(rating * 100) / 100,
      played: row.played,
      wins: row.wins,
      losses: row.losses,
      percentage: row.percentage,
      points: row.points,
      form,
    });
  }

  return ratings;
}

/* ── Fixture (head-to-head) odds ───────────────────── */

const HOME_ADVANTAGE = 1.2; // small home boost (about 1 rating point)
const OVERROUND = 1.04;     // 4% bookmaker margin (realistic for AFL)
const MIN_ODDS = 1.12;
const MAX_ODDS = 8.50;

function clampOdds(odds: number): number {
  return Math.min(MAX_ODDS, Math.max(MIN_ODDS, Math.round(odds * 100) / 100));
}

/**
 * Given two team ratings, return decimal odds for each side.
 *
 * Uses a logistic curve with a wide divisor (40) so small rating
 * gaps produce tight odds. A 16-point gap (max possible) ≈ $1.25 vs $4.20.
 * A 5-point gap ≈ $1.55 vs $2.55.
 */
export function computeMatchOdds(
  homeRating: number,
  awayRating: number,
): { home: number; away: number } {
  const adjHome = homeRating + HOME_ADVANTAGE;
  const adjAway = awayRating;

  // Logistic function: divisor of 40 keeps odds tight
  // 16pt gap → ~72% / 28% ($1.45 vs $3.70)
  // 8pt gap → ~62% / 38% ($1.68 vs $2.75)
  // 3pt gap → ~54% / 46% ($1.93 vs $2.28)
  const diff = adjHome - adjAway;
  const homeProb = 1 / (1 + Math.pow(10, -diff / 40));
  const awayProb = 1 - homeProb;

  const homeOdds = clampOdds(OVERROUND / Math.max(homeProb, 0.05));
  const awayOdds = clampOdds(OVERROUND / Math.max(awayProb, 0.05));

  return { home: homeOdds, away: awayOdds };
}

/**
 * Generate odds for all upcoming fixtures using ladder data.
 * Returns a map of fixtureId → { home, away } decimal odds.
 * Only generates for fixtures without admin-set odds.
 */
export function generateFixtureOdds(
  fixtures: Array<{
    id: string;
    home_team_id?: string | null;
    away_team_id?: string | null;
    status?: string | null;
  }>,
  ratings: Map<string, TeamRating>,
  adminOdds: Record<string, { home: number; away: number }>,
): Record<string, { home: number; away: number }> {
  const result: Record<string, { home: number; away: number }> = {};

  if (ratings.size === 0) return result;

  // Average rating as fallback for unknown teams
  let totalRating = 0;
  for (const r of ratings.values()) totalRating += r.rating;
  const avgRating = totalRating / ratings.size;

  for (const f of fixtures) {
    if (adminOdds[f.id]) continue;

    const st = (f.status || '').toUpperCase();
    if (st === 'FINAL' || st === 'COMPLETED' || st === 'COMPLETE') continue;

    const homeId = String(f.home_team_id || '');
    const awayId = String(f.away_team_id || '');
    if (!homeId || !awayId) continue;

    const homeR = ratings.get(homeId)?.rating ?? avgRating;
    const awayR = ratings.get(awayId)?.rating ?? avgRating;

    result[f.id] = computeMatchOdds(homeR, awayR);
  }

  return result;
}

/* ── Premiership odds ──────────────────────────────── */

/**
 * Realistic AFL-style premiership odds based on ladder position and performance.
 *
 * Mimics real TAB/Sportsbet AFL premiership markets:
 *  - 1st place:   $4.00–$6.00
 *  - 2nd–3rd:     $6.00–$9.00
 *  - 4th–5th:     $9.00–$15.00
 *  - 6th–8th:     $15.00–$26.00
 *  - 9th–12th:    $34.00–$67.00
 *  - 13th–16th:   $81.00–$151.00
 *  - 17th–18th:   $201.00–$501.00
 *
 * As the season progresses (more games played), odds sharpen — the leader
 * gets shorter and bottom teams blow out further.
 */

// Base odds curve: maps ladder position (1-indexed) to approximate mid-season odds.
// This mirrors a real 18-team AFL premiership market.
const BASE_PREM_ODDS: Record<number, number> = {
  1: 4.50,
  2: 6.50,
  3: 8.00,
  4: 10.00,
  5: 13.00,
  6: 17.00,
  7: 21.00,
  8: 26.00,
  9: 34.00,
  10: 41.00,
  11: 51.00,
  12: 67.00,
  13: 81.00,
  14: 101.00,
  15: 126.00,
  16: 151.00,
  17: 201.00,
  18: 301.00,
};

export function generatePremOdds(
  ladder: LadderRow[],
  ratings: Map<string, TeamRating>,
  adminPremOdds: Record<string, number>,
): Record<string, number> {
  const result: Record<string, number> = {};
  if (!ladder.length || ratings.size === 0) return result;

  // Sort ladder by points desc, then percentage desc (same as actual ladder order)
  const sorted = [...ladder].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.percentage - a.percentage;
  });

  // How far through the season are we? (0 = start, 1 = end)
  const maxPlayed = Math.max(...sorted.map((r) => r.played), 1);
  const seasonProgress = Math.min(maxPlayed / TOTAL_ROUNDS, 1);

  // As season progresses, performance matters more → odds diverge from base
  // Early season: stick close to base curve
  // Late season: let actual performance shift odds more dramatically
  const performanceWeight = 0.3 + seasonProgress * 0.5; // 0.3 early → 0.8 late

  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    const pos = i + 1;
    const teamKey = resolveTeamKey({ slug: row.team_slug, name: row.team_name });

    // Skip if admin already set
    if (adminPremOdds[teamKey] && adminPremOdds[teamKey] > 0) continue;

    const rating = ratings.get(row.team_id);
    if (!rating) continue;

    // Start from the base odds for this position
    const baseOdds = BASE_PREM_ODDS[pos] ?? (pos <= 18 ? 301 : 501);

    // Performance adjustment factor based on win rate and percentage
    // Good teams get shorter odds, poor teams get longer
    const played = Math.max(row.played, 1);
    const winRate = row.wins / played;

    // Compare to "expected" win rate for this position (linear scale)
    const totalTeams = sorted.length || 18;
    const expectedWinRate = 1 - (pos - 1) / (totalTeams - 1); // 1st=1.0, last=0.0
    const winRateDiff = winRate - expectedWinRate; // positive = outperforming

    // Percentage factor: teams with high % are genuinely dominant
    const pctFactor = (row.percentage - 100) / 200; // roughly -0.5 to +0.5

    // Form factor: hot streak = shorter, cold streak = longer
    const formDiff = rating.form - 0.5; // -0.5 to +0.5

    // Combined performance shift (negative = shorter odds, positive = longer)
    const perfShift = -(winRateDiff * 0.5 + pctFactor * 0.3 + formDiff * 0.2);

    // Apply performance shift scaled by season progress
    // Multiply base odds by adjustment factor
    const adjustmentFactor = 1 + perfShift * performanceWeight;
    let finalOdds = baseOdds * Math.max(0.5, Math.min(2.0, adjustmentFactor));

    // Apply season-progress sharpening:
    // Late season → top teams get shorter, bottom teams get longer
    if (seasonProgress > 0.4) {
      const sharpen = (seasonProgress - 0.4) * 1.5; // 0 → 0.9
      if (pos <= 4) {
        // Top 4: odds shorten as they look more likely
        finalOdds *= 1 - sharpen * 0.15;
      } else if (pos >= totalTeams - 3) {
        // Bottom 4: odds lengthen as elimination looks certain
        finalOdds *= 1 + sharpen * 0.3;
      }
    }

    // Snap to realistic AFL odds increments
    finalOdds = snapToAflOdds(finalOdds);

    result[teamKey] = finalOdds;
  }

  return result;
}

/**
 * Snap odds to realistic AFL betting increments.
 * AFL bookmakers use specific step sizes at different price ranges.
 */
function snapToAflOdds(raw: number): number {
  let odds: number;
  if (raw <= 3) {
    // $1.01–$3.00: round to nearest $0.05
    odds = Math.round(raw * 20) / 20;
  } else if (raw <= 10) {
    // $3.00–$10.00: round to nearest $0.25
    odds = Math.round(raw * 4) / 4;
  } else if (raw <= 30) {
    // $10–$30: round to nearest $1
    odds = Math.round(raw);
  } else if (raw <= 100) {
    // $30–$100: round to nearest $5
    odds = Math.round(raw / 5) * 5;
  } else if (raw <= 200) {
    // $100–$200: snap to $101, $126, $151, $176, $201
    odds = Math.round(raw / 25) * 25 + 1;
  } else {
    // $200+: snap to $201, $251, $301, $401, $501
    odds = Math.round(raw / 50) * 50 + 1;
  }
  return Math.max(2.0, Math.min(501, odds));
}
