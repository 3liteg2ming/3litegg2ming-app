import { AFL_POSITION_BY_ID, AFL_POSITION_BY_NAME_KEY } from './playerPositionMap.generated';

export type CanonicalPlayerPosition = 'DEF' | 'MID' | 'RUC' | 'FWD' | 'DEF/MID' | 'MID/FWD' | 'DEF/FWD' | 'RUC/FWD';

const POSITION_ORDER: CanonicalPlayerPosition[] = ['DEF', 'MID', 'RUC', 'FWD'];

function text(value: unknown): string {
  return String(value || '').trim();
}

function key(value: unknown): string {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

export function buildPlayerNameKey(teamName?: string | null, playerName?: string | null): string {
  const team = key(teamName);
  const player = key(playerName);
  return team && player ? `${team}::${player}` : '';
}

function normalizeRawToken(raw: string): CanonicalPlayerPosition | null {
  const token = raw.trim().toLowerCase();
  if (!token) return null;
  if (['def', 'defender', 'defenders', 'back', 'backs', 'halfback', 'half back', 'key defender', 'intercept defender'].includes(token)) return 'DEF';
  if (['mid', 'midfielder', 'midfield', 'midfielders', 'wing', 'centre', 'center', 'inside mid', 'outside mid'].includes(token)) return 'MID';
  if (['ruck', 'ruc', 'ruckman', 'ruckmen'].includes(token)) return 'RUC';
  if (['fwd', 'forward', 'forwards', 'key forward', 'small forward', 'tall forward'].includes(token)) return 'FWD';
  return null;
}

export function normalizeCanonicalPosition(raw?: string | null): CanonicalPlayerPosition | undefined {
  const value = text(raw);
  if (!value) return undefined;

  const parts = value
    .split(/[\/|,;-]/g)
    .map((part) => normalizeRawToken(part))
    .filter((part): part is CanonicalPlayerPosition => Boolean(part));

  const ordered = POSITION_ORDER.filter((item) => parts.includes(item));
  if (ordered.length === 0) {
    const single = normalizeRawToken(value);
    return single || undefined;
  }
  if (ordered.length === 1) return ordered[0];
  if (ordered.includes('RUC') && ordered.includes('FWD')) return 'RUC/FWD';
  if (ordered.includes('DEF') && ordered.includes('MID')) return 'DEF/MID';
  if (ordered.includes('MID') && ordered.includes('FWD')) return 'MID/FWD';
  if (ordered.includes('DEF') && ordered.includes('FWD')) return 'DEF/FWD';
  return ordered[0];
}

function expandPosition(position?: string | null): CanonicalPlayerPosition[] {
  const canonical = normalizeCanonicalPosition(position);
  if (!canonical) return [];
  if (!canonical.includes('/')) return [canonical];
  return canonical.split('/').map((part) => part as CanonicalPlayerPosition);
}

export function mergeCanonicalPositions(authoritative?: string | null, existing?: string | null): CanonicalPlayerPosition | undefined {
  const primary = normalizeCanonicalPosition(authoritative);
  const current = normalizeCanonicalPosition(existing);
  if (!primary && !current) return undefined;
  if (!primary) return current;
  if (!current) return primary;

  const currentExpanded = expandPosition(current);
  const primaryExpanded = expandPosition(primary);
  const merged = POSITION_ORDER.filter((item) => currentExpanded.includes(item) || primaryExpanded.includes(item));

  if (currentExpanded.includes(primaryExpanded[0])) {
    if (merged.includes('RUC') && merged.includes('FWD')) return 'RUC/FWD';
    if (merged.includes('DEF') && merged.includes('MID')) return 'DEF/MID';
    if (merged.includes('MID') && merged.includes('FWD')) return 'MID/FWD';
    if (merged.includes('DEF') && merged.includes('FWD')) return 'DEF/FWD';
  }

  return primary;
}

export function resolveAuthoritativePosition(input: {
  aflPlayerId?: string | number | null;
  teamName?: string | null;
  playerName?: string | null;
  existingPosition?: string | null;
}): CanonicalPlayerPosition | undefined {
  const aflPlayerId = text(input.aflPlayerId);
  const byId = aflPlayerId ? AFL_POSITION_BY_ID[aflPlayerId] : undefined;
  const byName = AFL_POSITION_BY_NAME_KEY[buildPlayerNameKey(input.teamName, input.playerName)];
  return mergeCanonicalPositions(byId || byName, input.existingPosition);
}
