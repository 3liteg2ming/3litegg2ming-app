// Pure helpers for entertainment-only win-chance / premiership-odds.
// Used by Ladder and Finals bracket so the same matchup shows the same chance.

export function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

export function hash01(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1_000_000) / 1_000_000;
}

export function oddsFromWinChance(winChance: number): string {
  const wc = clamp(winChance, 1, 99) / 100;
  const decimal = 1 / wc;
  if (decimal > 80) return '81.00';
  return decimal.toFixed(2);
}

export type WinChanceInput = {
  seed: string;
  rank?: number;
  totalRanked?: number;
  manualWinChance?: number;
};

export function computeWinChance(opts: WinChanceInput): number {
  if (opts.manualWinChance != null && Number.isFinite(opts.manualWinChance)) {
    return clamp(opts.manualWinChance, 5, 95);
  }
  const r = hash01(opts.seed);
  const base = 45 + r * 40; // 45..85
  const total = opts.totalRanked ?? 18;
  const rank = opts.rank ?? total;
  const rankBoost = (total - rank) * 0.6;
  return clamp(base + rankBoost, 5, 95);
}

// For two-team matchups: derive home win-chance using a stable seed and seed-difference.
export function matchupWinChance(opts: {
  seed: string;
  homeSeed?: number | null;
  awaySeed?: number | null;
}): { home: number; away: number } {
  const r = hash01(opts.seed);
  const baseHome = 50 + (r - 0.5) * 20; // 40..60 random spread
  const homeRank = opts.homeSeed ?? 4.5;
  const awayRank = opts.awaySeed ?? 4.5;
  const seedSpread = (awayRank - homeRank) * 4; // higher seed = better team => more pts toward home
  const home = clamp(baseHome + seedSpread, 5, 95);
  return { home, away: clamp(100 - home, 5, 95) };
}
