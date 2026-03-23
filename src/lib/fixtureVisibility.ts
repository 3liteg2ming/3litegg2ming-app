/**
 * Season Two fixture visibility gate.
 *
 * Single source of truth: fixtures unlock at 6:00 PM Melbourne time on 2026-03-23.
 * After that timestamp this function returns true and all fixture UI renders normally.
 *
 * To remove the gate entirely after launch, delete this file and replace all
 * `areFixturesVisible()` calls with `true`.
 */

const UNLOCK_ISO = '2026-03-23T18:00:00+11:00'; // 6:00 PM AEDT (Australia/Melbourne)
const UNLOCK_MS = new Date(UNLOCK_ISO).getTime();

/** Returns true once fixtures should be publicly visible. */
export function areFixturesVisible(): boolean {
  return Date.now() >= UNLOCK_MS;
}

/** Returns true if the user can see fixtures — super_admin always, others after unlock. */
export function canViewFixtures(role?: string | null): boolean {
  if (role && role.toLowerCase() === 'super_admin') return true;
  return Date.now() >= UNLOCK_MS;
}

/** Human-readable unlock label for locked-state UI. */
export const FIXTURES_UNLOCK_LABEL = 'Season Two fixtures unlock at 6:00 PM tonight';
