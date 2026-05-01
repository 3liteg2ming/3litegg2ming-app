export type ExtractedPlayerStatTeam = 'home' | 'away' | null;

export type ExtractedPlayerStatRow = {
  playerId?: string | null;
  aflPlayerId?: number | null;
  name: string;
  team: ExtractedPlayerStatTeam;
  goals: number | null;
  behinds: number | null;
  disposals: number | null;
  kicks: number | null;
  handballs: number | null;
  marks: number | null;
  tackles: number | null;
  hitouts: number | null;
  afl_fantasy: number | null;
  fantasyPoints: number | null;
};

export type RosterPlayerMatchCandidate = {
  id?: string | null;
  playerId?: string | null;
  aflPlayerId?: number | null;
  afl_player_id?: number | null;
  name?: string | null;
  display_name?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  team?: string | null;
  teamId?: string | null;
  team_id?: string | null;
  side?: ExtractedPlayerStatTeam;
};

export type RosterPlayerMatch = {
  candidate: RosterPlayerMatchCandidate;
  confidence: 'exact' | 'partial';
  reason: 'playerId' | 'aflPlayerId' | 'exactName' | 'initialLast';
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAT_FIELDS = [
  'goals',
  'behinds',
  'disposals',
  'kicks',
  'handballs',
  'marks',
  'tackles',
  'hitouts',
  'afl_fantasy',
  'fantasyPoints',
] as const;

type StatField = (typeof STAT_FIELDS)[number];

function text(value: unknown): string {
  return String(value || '').trim();
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function toNullableInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.trunc(numeric);
  return rounded >= 0 ? rounded : null;
}

function toObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstDefinedInt(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    const value = toNullableInt(source[key]);
    if (value !== null) return value;
  }
  return null;
}

function normalizeTeam(value: unknown): ExtractedPlayerStatTeam {
  const raw = text(value).toLowerCase();
  if (!raw) return null;
  if (raw === 'home' || raw === 'h') return 'home';
  if (raw === 'away' || raw === 'a') return 'away';
  return null;
}

function normalizePlayerName(value: unknown): string {
  return normalizeSpaces(text(value));
}

function normalizeNameKey(value: unknown): string {
  return normalizePlayerName(value)
    .toLowerCase()
    .replace(/['`’-]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function compactNameKey(value: unknown): string {
  return normalizeNameKey(value).replace(/\s+/g, '');
}

function splitNameParts(value: unknown) {
  const normalized = normalizePlayerName(value);
  const compactInitial = normalized.match(/^([A-Za-z])\.\s*([A-Za-z][A-Za-z'`-]+)$/);
  if (compactInitial) {
    return {
      firstInitial: compactInitial[1].toLowerCase(),
      lastName: compactInitial[2].replace(/[^a-z]/gi, '').toLowerCase(),
    };
  }

  const key = normalizeNameKey(normalized);
  const parts = key.split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstInitial: '', lastName: '' };
  }

  const first = parts[0] || '';
  const last = parts[parts.length - 1] || '';
  const firstInitial = first[0] || '';
  return {
    firstInitial,
    lastName: last.replace(/[^a-z]/g, ''),
  };
}

function nameVariantKeys(value: unknown): string[] {
  const normalized = normalizePlayerName(value);
  if (!normalized) return [];

  const variants = new Set<string>();
  variants.add(normalizeNameKey(normalized));
  variants.add(compactNameKey(normalized));

  const initialLast = splitNameParts(normalized);
  if (initialLast.firstInitial && initialLast.lastName) {
    variants.add(`${initialLast.firstInitial}.${initialLast.lastName}`);
    variants.add(`${initialLast.firstInitial}${initialLast.lastName}`);
  }

  return Array.from(variants).filter(Boolean);
}

function statValueKey(row: ExtractedPlayerStatRow, field: StatField): string {
  const value = row[field];
  return value === null || value === undefined ? 'null' : String(value);
}

function scoreRowIdentity(row: ExtractedPlayerStatRow) {
  let score = 0;
  for (const field of STAT_FIELDS) {
    const value = row[field];
    if (value === null || value === undefined) continue;
    score += value === 0 ? 1 : 100 + value;
  }
  if (row.playerId && UUID_RE.test(row.playerId)) score += 200;
  if (row.aflPlayerId) score += 100;
  if (row.team) score += 20;
  if (row.name) score += 10;
  return score;
}

function mergeStatValue(existing: number | null, incoming: number | null): number | null {
  if (incoming === null || incoming === undefined) return existing;
  if (existing === null || existing === undefined) return incoming;
  return Math.max(existing, incoming);
}

function mergeTeam(existing: ExtractedPlayerStatTeam, incoming: ExtractedPlayerStatTeam): ExtractedPlayerStatTeam {
  return existing || incoming || null;
}

function extractedRowsMatch(left: ExtractedPlayerStatRow, right: ExtractedPlayerStatRow): boolean {
  const leftPlayerId = text(left.playerId);
  const rightPlayerId = text(right.playerId);
  if (leftPlayerId && rightPlayerId && leftPlayerId === rightPlayerId) return true;

  const leftAflPlayerId = left.aflPlayerId ?? null;
  const rightAflPlayerId = right.aflPlayerId ?? null;
  if (leftAflPlayerId && rightAflPlayerId && leftAflPlayerId === rightAflPlayerId) return true;

  const leftTeam = left.team;
  const rightTeam = right.team;
  if (leftTeam && rightTeam && leftTeam !== rightTeam) return false;

  if (compactNameKey(left.name) && compactNameKey(left.name) === compactNameKey(right.name)) {
    return true;
  }

  const leftParts = splitNameParts(left.name);
  const rightParts = splitNameParts(right.name);
  return Boolean(
    leftParts.firstInitial &&
      rightParts.firstInitial &&
      leftParts.lastName &&
      rightParts.lastName &&
      leftParts.firstInitial === rightParts.firstInitial &&
      leftParts.lastName === rightParts.lastName,
  );
}

function mergeRows(existing: ExtractedPlayerStatRow, incoming: ExtractedPlayerStatRow): ExtractedPlayerStatRow {
  const preferred = scoreRowIdentity(incoming) >= scoreRowIdentity(existing) ? incoming : existing;
  const fallback = preferred === incoming ? existing : incoming;
  const merged: ExtractedPlayerStatRow = {
    ...preferred,
    playerId: text(preferred.playerId) || text(fallback.playerId) || null,
    aflPlayerId: preferred.aflPlayerId ?? fallback.aflPlayerId ?? null,
    name: preferred.name || fallback.name,
    team: mergeTeam(preferred.team, fallback.team),
    goals: null,
    behinds: null,
    disposals: null,
    kicks: null,
    handballs: null,
    marks: null,
    tackles: null,
    hitouts: null,
    afl_fantasy: null,
    fantasyPoints: null,
  };

  for (const field of STAT_FIELDS) {
    merged[field] = mergeStatValue(existing[field], incoming[field]);
  }

  const fantasy = mergeStatValue(merged.afl_fantasy, merged.fantasyPoints);
  merged.afl_fantasy = fantasy;
  merged.fantasyPoints = fantasy;
  return merged;
}

function resolveFantasyValue(source: Record<string, unknown>) {
  return firstDefinedInt(source, [
    'afl_fantasy',
    'fantasyPoints',
    'fantasy_points',
    'fantasy',
    'af',
  ]);
}

function goalKickerToRow(value: unknown, team: ExtractedPlayerStatTeam): ExtractedPlayerStatRow | null {
  const row = toObject(value);
  const name = normalizePlayerName(row.name ?? value);
  if (!name) return null;

  return {
    playerId: text(row.id || row.playerId) || null,
    aflPlayerId: toNullableInt(row.aflPlayerId ?? row.afl_player_id),
    name,
    team,
    goals: toNullableInt(row.goals) ?? 1,
    behinds: null,
    disposals: null,
    kicks: null,
    handballs: null,
    marks: null,
    tackles: null,
    hitouts: null,
    afl_fantasy: null,
    fantasyPoints: null,
  };
}

function candidateName(candidate: RosterPlayerMatchCandidate): string {
  const display = normalizePlayerName(
    candidate.display_name ||
      candidate.full_name ||
      candidate.name ||
      [candidate.first_name, candidate.last_name].filter(Boolean).join(' '),
  );
  return display;
}

function candidateTeam(candidate: RosterPlayerMatchCandidate): ExtractedPlayerStatTeam {
  return normalizeTeam(candidate.side ?? candidate.team);
}

export function normalisePlayerStatRow(input: unknown): ExtractedPlayerStatRow | null {
  const row = toObject(input);
  const playerRef = toObject(row.playerRef || row.player_ref);
  const name = normalizePlayerName(
    row.name ||
      row.playerName ||
      row.player_name ||
      playerRef.playerName ||
      playerRef.player_name,
  );

  if (!name) return null;

  const fantasy = resolveFantasyValue(row);

  return {
    playerId: text(row.playerId || row.player_id || playerRef.playerId || playerRef.player_id) || null,
    aflPlayerId: toNullableInt(row.aflPlayerId ?? row.afl_player_id ?? playerRef.aflPlayerId ?? playerRef.afl_player_id),
    name,
    team: normalizeTeam(row.team ?? row.teamSide ?? row.team_side),
    goals: firstDefinedInt(row, ['goals', 'goal']),
    behinds: firstDefinedInt(row, ['behinds', 'behind']),
    disposals: firstDefinedInt(row, ['disposals', 'disposal']),
    kicks: firstDefinedInt(row, ['kicks', 'kick']),
    handballs: firstDefinedInt(row, ['handballs', 'handball']),
    marks: firstDefinedInt(row, ['marks', 'mark']),
    tackles: firstDefinedInt(row, ['tackles', 'tackle']),
    hitouts: firstDefinedInt(row, ['hitouts', 'hitout', 'hit_outs', 'hit_out']),
    afl_fantasy: fantasy,
    fantasyPoints: fantasy,
  };
}

export function normalisePlayerStatRows(rows: unknown): ExtractedPlayerStatRow[] {
  const input = Array.isArray(rows)
    ? rows
    : toObject(rows).player_stats && Array.isArray(toObject(rows).player_stats)
      ? (toObject(rows).player_stats as unknown[])
      : [];

  return input
    .map((row) => normalisePlayerStatRow(row))
    .filter((row): row is ExtractedPlayerStatRow => Boolean(row));
}

export function mergeExtractedPlayerStats(
  existingRows: ExtractedPlayerStatRow[],
  incomingRows: ExtractedPlayerStatRow[],
): ExtractedPlayerStatRow[] {
  const merged = [...existingRows.map((row) => normalisePlayerStatRow(row)).filter(Boolean) as ExtractedPlayerStatRow[]];

  for (const incoming of incomingRows.map((row) => normalisePlayerStatRow(row)).filter(Boolean) as ExtractedPlayerStatRow[]) {
    const matchIndex = merged.findIndex((row) => extractedRowsMatch(row, incoming));
    if (matchIndex === -1) {
      merged.push(incoming);
      continue;
    }
    merged[matchIndex] = mergeRows(merged[matchIndex], incoming);
  }

  return merged;
}

export function buildFallbackPlayerStatsFromGoalKickers(
  goalKickersHome: unknown,
  goalKickersAway: unknown,
): ExtractedPlayerStatRow[] {
  const homeRows = (Array.isArray(goalKickersHome) ? goalKickersHome : [])
    .map((row) => goalKickerToRow(row, 'home'))
    .filter((row): row is ExtractedPlayerStatRow => Boolean(row));
  const awayRows = (Array.isArray(goalKickersAway) ? goalKickersAway : [])
    .map((row) => goalKickerToRow(row, 'away'))
    .filter((row): row is ExtractedPlayerStatRow => Boolean(row));

  return mergeExtractedPlayerStats([], [...homeRows, ...awayRows]);
}

export function findBestRosterPlayerMatch(
  input: string | ExtractedPlayerStatRow,
  roster: RosterPlayerMatchCandidate[],
): RosterPlayerMatch | null {
  const sourceRow = typeof input === 'string' ? { name: input, team: null } : input;
  const lookupName = normalizePlayerName(sourceRow.name);
  if (!lookupName) return null;

  const lookupPlayerId = text((sourceRow as { playerId?: string | null }).playerId);
  if (lookupPlayerId) {
    const playerIdMatch = roster.find((candidate) => {
      const candidateId = text(candidate.id || candidate.playerId);
      return candidateId && candidateId === lookupPlayerId;
    });
    if (playerIdMatch) {
      return { candidate: playerIdMatch, confidence: 'exact', reason: 'playerId' };
    }
  }

  const lookupAflPlayerId =
    typeof input === 'string'
      ? null
      : (sourceRow as { aflPlayerId?: number | null }).aflPlayerId ?? null;
  if (lookupAflPlayerId) {
    const aflIdMatch = roster.find((candidate) => {
      const candidateAflPlayerId = candidate.aflPlayerId ?? candidate.afl_player_id ?? null;
      return candidateAflPlayerId === lookupAflPlayerId;
    });
    if (aflIdMatch) {
      return { candidate: aflIdMatch, confidence: 'exact', reason: 'aflPlayerId' };
    }
  }

  const sourceTeam = typeof input === 'string' ? null : sourceRow.team;
  const exactCandidates = roster.filter((candidate) => {
    const team = candidateTeam(candidate);
    if (sourceTeam && team && sourceTeam !== team) return false;
    return nameVariantKeys(candidateName(candidate)).some((key) => key === compactNameKey(lookupName) || key === normalizeNameKey(lookupName));
  });

  if (exactCandidates.length === 1) {
    return { candidate: exactCandidates[0], confidence: 'exact', reason: 'exactName' };
  }

  const lookupParts = splitNameParts(lookupName);
  const partialCandidates = roster.filter((candidate) => {
    const team = candidateTeam(candidate);
    if (sourceTeam && team && sourceTeam !== team) return false;
    const candidateParts = splitNameParts(candidateName(candidate));
    return Boolean(
      lookupParts.firstInitial &&
        lookupParts.lastName &&
        candidateParts.firstInitial === lookupParts.firstInitial &&
        candidateParts.lastName === lookupParts.lastName,
    );
  });

  if (partialCandidates.length === 1) {
    return { candidate: partialCandidates[0], confidence: 'partial', reason: 'initialLast' };
  }

  return null;
}

export function countPopulatedPlayerStatFields(rows: ExtractedPlayerStatRow[]) {
  const counts = {
    goals: 0,
    behinds: 0,
    disposals: 0,
    kicks: 0,
    handballs: 0,
    marks: 0,
    tackles: 0,
    hitouts: 0,
    afl_fantasy: 0,
    fantasyPoints: 0,
  };

  for (const row of rows) {
    for (const field of STAT_FIELDS) {
      const valueKey = statValueKey(row, field);
      if (valueKey !== 'null') {
        counts[field] += 1;
      }
    }
  }

  return counts;
}
