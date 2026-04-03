/**
 * Visible rounds control layer
 * 
 * This is the single source of truth for which rounds are visible across the app.
 * Currently Round 1 and Round 2 are visible. This can be expanded later by updating this file.
 */

const VISIBLE_ROUNDS = new Set([1, 2, 3, 4, 5, 6]);

/**
 * Check if a round number should be visible to users
 * @param roundNumber - The round number (1-based)
 * @returns true if the round should be shown, false if it should be hidden
 */
export function isRoundVisible(roundNumber: number | null | undefined): boolean {
  if (roundNumber == null || !Number.isFinite(roundNumber)) return false;
  return VISIBLE_ROUNDS.has(Math.trunc(roundNumber));
}

/**
 * Filter a list of round numbers to only visible ones
 * @param rounds - Array of round numbers
 * @returns Filtered array containing only visible rounds
 */
export function getVisibleRounds(rounds: (number | null | undefined)[]): number[] {
  return rounds
    .filter((r): r is number => r != null && Number.isFinite(r))
    .map((r) => Math.trunc(r))
    .filter((r) => isRoundVisible(r));
}
