import { requireSupabaseClient } from '../lib/supabaseClient';
import { fetchActiveCompetitionBaseline } from '../lib/seasonParticipantsRepo';
import { resolveKnownPlayerHeadshot } from '../lib/playerHeadshots';
import { resolveTeamKey } from '../lib/entityResolvers';
import { resolveAuthoritativePosition } from '../lib/playerPositionMap';

const supabase = requireSupabaseClient();

export type AflPlayer = {
  id: string;
  name: string;
  headshotUrl?: string;

  teamId?: string;
  teamName?: string;
  teamKey?: string;

  aflPlayerId?: string;
  position?: string;
  number?: number;

  gamesPlayed?: number;
  goals?: number;
  disposals?: number;
  kicks?: number;
  handballs?: number;
  marks?: number;
  tackles?: number;
  clearances?: number;
  hitOuts?: number;
  fantasyPoints?: number;
};

type TeamLookup = { id?: string; name?: string; teamKey?: string };
type RawPlayerRow = Record<string, any>;
type CsvPlayerRow = {
  id: string;
  aflPlayerId?: string;
  name: string;
  headshotUrl?: string;
  photoUrl?: string;
  teamId?: string;
  teamKey?: string;
  teamName?: string;
  position?: string;
  number?: number;
};

const caches: Record<'default' | 'allTeams', { at: number; players: AflPlayer[] } | null> = {
  default: null,
  allTeams: null,
};

let bundledCsvCache: CsvPlayerRow[] | null = null;
const TTL_MS = 5 * 60_000;

function numOrUndef(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function strOrUndef(v: unknown) {
  const s = typeof v === 'string' ? v : v == null ? '' : String(v);
  const t = s.trim();
  return t || undefined;
}

function pickHeadshot(p: any) {
  return (
    strOrUndef(
      resolveKnownPlayerHeadshot({
        name:
          strOrUndef(p?.name) ||
          `${strOrUndef(p?.first_name) || ''} ${strOrUndef(p?.last_name) || ''}`.trim(),
        photoUrl: strOrUndef(p?.photo_url),
        headshotUrl: strOrUndef(p?.headshot_url) || strOrUndef(p?.headshot),
      }),
    )
  );
}

function normalizeTeamKey(raw?: string) {
  return raw ? raw.trim().toLowerCase() || undefined : undefined;
}

function normalizeTeamToken(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

async function fetchPlayersRaw() {
  const selectAttempts = [
    'id,afl_player_id,name,team_id,team_key,team_name,position,number,headshot_url,photo_url',
    'id,afl_player_id,name,team_id,team_name,position,number,headshot_url,photo_url',
    'id,afl_player_id,name,team_id,position,number,headshot_url,photo_url',
    'id,name,team_id,name,headshot_url,photo_url',
    'id,afl_player_id,name,team_id,display_name,full_name,first_name,last_name,position,number,headshot_url,photo_url',
    'id,afl_player_id,display_name,team_id,team_key,team_name,position,number,headshot_url,photo_url',
    'id,afl_player_id,full_name,team_id,team_key,team_name,position,number,headshot_url,photo_url',
  ] as const;

  let data: any[] = [];
  let lastErr: any = null;

  for (const sel of selectAttempts) {
    const res = await supabase.from('eg_players').select(sel).limit(5000);
    if (!res.error) {
      data = (res.data as any[]) || [];
      lastErr = null;
      break;
    }
    lastErr = res.error;
  }

  if (lastErr) throw lastErr;
  return data;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  out.push(current);
  return out.map((value) => value.trim());
}

function normalizeHeaderName(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/[\s_]+/g, '')
    .trim();
}

async function fetchBundledPlayersCsv(): Promise<CsvPlayerRow[]> {
  if (bundledCsvCache) return bundledCsvCache;

  const CSV_VERSION = '2026-03-16-headshots-v3';
  const response = await fetch(`/data/afl-players-2026.csv?v=${CSV_VERSION}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load bundled players CSV: ${response.status}`);
  }

  const textBlob = (await response.text()).replace(/^\uFEFF/, '');
  const lines = textBlob
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    bundledCsvCache = [];
    return bundledCsvCache;
  }

  const headers = parseCsvLine(lines[0]);
  const headerIndex = new Map<string, number>();
  headers.forEach((raw, index) => {
    const normalized = normalizeHeaderName(raw);
    if (normalized) headerIndex.set(normalized, index);
  });

  const column = (...names: string[]) => {
    for (const name of names) {
      const idx = headerIndex.get(normalizeHeaderName(name));
      if (typeof idx === 'number' && idx >= 0) return idx;
    }
    return -1;
  };

  const readCell = (cells: string[], ...names: string[]) => {
    const index = column(...names);
    return index >= 0 ? String(cells[index] || '').trim() : '';
  };

  const players: CsvPlayerRow[] = [];

  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);

    const id =
      readCell(cells, 'id', 'ID', 'player_id', 'Player ID');

    const name =
      readCell(cells, 'name', 'Name', 'player_name', 'Player Name', 'full_name', 'display_name');

    if (!id || !name) continue;

    players.push({
      id,
      aflPlayerId: strOrUndef(readCell(cells, 'afl_player_id', 'AFL Player ID')) || undefined,
      name,
      headshotUrl:
        strOrUndef(readCell(cells, 'headshot_url', 'Headshot URL', 'headshot')) ||
        undefined,
      photoUrl:
        strOrUndef(readCell(cells, 'photo_url', 'Photo URL')) ||
        undefined,
      teamId:
        strOrUndef(readCell(cells, 'team_id', 'Team ID')) ||
        undefined,
      teamKey:
        normalizeTeamKey(
          readCell(cells, 'team_key', 'Team Key', 'slug', 'team_slug'),
        ) || undefined,
      teamName:
        strOrUndef(readCell(cells, 'team_name', 'Team Name', 'team', 'Team')) ||
        undefined,
      position:
        strOrUndef(readCell(cells, 'position', 'Position')) ||
        undefined,
      number:
        numOrUndef(readCell(cells, 'number', 'Number', 'jumper_number', 'Jumper Number')),
    });
  }

  if (import.meta.env.DEV) {
    console.log('[aflPlayers] csv parse debug', {
      headers,
      parsedCount: players.length,
      sample: players.slice(0, 3).map((p) => ({
        id: p.id,
        name: p.name,
        teamId: p.teamId,
        teamKey: p.teamKey,
        teamName: p.teamName,
      })),
    });
  }

  bundledCsvCache = players;
  return bundledCsvCache;
}

async function fetchTeamsById(): Promise<Map<string, TeamLookup>> {
  const out = new Map<string, TeamLookup>();

  const attempts = ['id,name,team_key,slug', 'id,name,slug', 'id,name,team_key', 'id,name'] as const;
  let rows: any[] = [];

  for (const sel of attempts) {
    const res = await supabase.from('eg_teams').select(sel).limit(300);
    if (!res.error) {
      rows = (res.data as any[]) || [];
      break;
    }
  }

  for (const row of rows) {
    const id = strOrUndef((row as any).id);
    if (!id) continue;

    const rawTeamKey =
      strOrUndef((row as any).team_key) ||
      strOrUndef((row as any).slug) ||
      undefined;

    const resolvedKey = resolveTeamKey({
      slug: rawTeamKey,
      teamKey: rawTeamKey,
      name: strOrUndef((row as any).name),
    });

    out.set(id, {
      id,
      name: strOrUndef((row as any).name),
      teamKey: String(resolvedKey) !== 'unknown' ? resolvedKey : undefined,
    });
  }

  return out;
}

function resolveTeamFields(p: any, teamById: Map<string, TeamLookup>) {
  const teamId = strOrUndef(p?.team_id);
  const nestedTeam = Array.isArray(p?.eg_teams) ? p.eg_teams[0] : p?.eg_teams;

  const nestedName = strOrUndef(nestedTeam?.name);
  const nestedKeyResult = resolveTeamKey({
    slug: strOrUndef(nestedTeam?.team_key) || strOrUndef(nestedTeam?.slug),
    teamKey: strOrUndef(nestedTeam?.team_key),
    name: nestedName,
  });
  const byId = teamId ? teamById.get(teamId) : undefined;

  const rowTeamKeyResult = resolveTeamKey({
    teamKey: strOrUndef(p?.team_key),
    slug: strOrUndef(p?.team_key),
    name: strOrUndef(p?.team_name),
  });

  const rowTeamName = strOrUndef(p?.team_name);
  const rowTeamText = typeof p?.team === 'string' ? strOrUndef(p.team) : undefined;

  const teamName = rowTeamName || nestedName || byId?.name || rowTeamText;
  const teamKey =
    (String(rowTeamKeyResult) !== 'unknown' ? rowTeamKeyResult : undefined) ||
    (String(nestedKeyResult) !== 'unknown' ? nestedKeyResult : undefined) ||
    byId?.teamKey;

  return { teamId, teamName, teamKey };
}

function resolvePlayerPosition(args: { aflPlayerId?: string | number | null; teamName?: string | null; playerName?: string | null; rowPosition?: string | null; }): string | undefined {
  return resolveAuthoritativePosition({
    aflPlayerId: args.aflPlayerId,
    teamName: args.teamName,
    playerName: args.playerName,
    existingPosition: args.rowPosition,
  });
}

function toAflPlayer(p: any, teamById: Map<string, TeamLookup>): AflPlayer | null {
  const id = strOrUndef(p?.id);
  const first = strOrUndef(p?.first_name);
  const last = strOrUndef(p?.last_name);
  const combined = `${first || ''} ${last || ''}`.trim();
  const name = strOrUndef(p?.name) || combined || strOrUndef(p?.display_name) || strOrUndef(p?.full_name);

  if (!id || !name) return null;

  const { teamId, teamName, teamKey } = resolveTeamFields(p, teamById);

  return {
    id,
    aflPlayerId: strOrUndef(p?.afl_player_id),
    name,
    headshotUrl: pickHeadshot(p),

    teamId,
    teamName,
    teamKey,

    position: resolvePlayerPosition({
      aflPlayerId: p?.afl_player_id,
      teamName,
      playerName: name,
      rowPosition: strOrUndef(p?.position),
    }),
    number: numOrUndef(p?.number),

    gamesPlayed: numOrUndef(p?.games_played),
    goals: numOrUndef(p?.goals),
    disposals: numOrUndef(p?.disposals),
    kicks: numOrUndef(p?.kicks),
    handballs: numOrUndef(p?.handballs),
    marks: numOrUndef(p?.marks),
    tackles: numOrUndef(p?.tackles),
    clearances: numOrUndef(p?.clearances),
    hitOuts: numOrUndef(p?.hit_outs),
    fantasyPoints: numOrUndef(p?.fantasy_points),
  };
}

function mergePreferBetter(prev: AflPlayer, next: AflPlayer): AflPlayer {
  const score = (p: AflPlayer) =>
    (p.headshotUrl ? 4 : 0) +
    (p.teamId ? 2 : 0) +
    (p.teamName ? 2 : 0) +
    (p.teamKey ? 2 : 0) +
    (p.position ? 1 : 0) +
    (Number.isFinite(p.number) ? 1 : 0);

  const a = score(prev);
  const b = score(next);
  const best = b > a ? next : prev;
  const other = best === prev ? next : prev;

  return {
    ...best,
    headshotUrl: best.headshotUrl || other.headshotUrl,
    teamId: best.teamId || other.teamId,
    teamName: best.teamName || other.teamName,
    teamKey: best.teamKey || other.teamKey,
    position: best.position || other.position,
    number: best.number ?? other.number,
    gamesPlayed: best.gamesPlayed ?? other.gamesPlayed,
    goals: best.goals ?? other.goals,
    disposals: best.disposals ?? other.disposals,
    kicks: best.kicks ?? other.kicks,
    handballs: best.handballs ?? other.handballs,
    marks: best.marks ?? other.marks,
    tackles: best.tackles ?? other.tackles,
    clearances: best.clearances ?? other.clearances,
    hitOuts: best.hitOuts ?? other.hitOuts,
    fantasyPoints: best.fantasyPoints ?? other.fantasyPoints,
  };
}

function toCsvAflPlayer(csv: CsvPlayerRow, teamById: Map<string, TeamLookup>): AflPlayer {
  const csvTeamId = strOrUndef(csv.teamId);
  const csvTeamKeyRaw = normalizeTeamKey(csv.teamKey);
  const csvTeamName = strOrUndef(csv.teamName);

  const byId = csvTeamId ? teamById.get(csvTeamId) : undefined;

  const resolvedCsvKey = (() => {
    if (csvTeamKeyRaw) {
      const result = resolveTeamKey({ teamKey: csvTeamKeyRaw, slug: csvTeamKeyRaw, name: csvTeamName });
      if (String(result) !== 'unknown') return result;
    }
    if (csvTeamName) {
      const result = resolveTeamKey({ name: csvTeamName, teamKey: csvTeamKeyRaw, slug: csvTeamKeyRaw });
      if (String(result) !== 'unknown') return result;
    }
    return undefined;
  })();

  const matchedByName = !byId && (csvTeamName || resolvedCsvKey)
    ? Array.from(teamById.values()).find((team) => {
        const teamNameToken = normalizeTeamToken(team.name);
        const teamKeyToken = normalizeTeamToken(team.teamKey);
        const csvNameToken = normalizeTeamToken(csvTeamName);
        const csvKeyToken = normalizeTeamToken(resolvedCsvKey || csvTeamKeyRaw);
        return (
          (csvNameToken && csvNameToken === teamNameToken) ||
          (csvKeyToken && csvKeyToken === teamKeyToken)
        );
      })
    : undefined;

  const finalTeamId = csvTeamId || matchedByName?.id;
  const finalTeamName = csvTeamName || byId?.name || matchedByName?.name;
  const finalTeamKey =
    resolvedCsvKey ||
    byId?.teamKey ||
    matchedByName?.teamKey ||
    undefined;

  return {
    id: csv.id,
    aflPlayerId: csv.aflPlayerId,
    name: csv.name,
    headshotUrl:
      pickHeadshot({
        name: csv.name,
        headshot_url: csv.headshotUrl,
        photo_url: csv.photoUrl || csv.headshotUrl,
      }) || undefined,
    teamId: finalTeamId,
    teamName: finalTeamName,
    teamKey: finalTeamKey,
    position: resolvePlayerPosition({
      aflPlayerId: csv.aflPlayerId,
      teamName: finalTeamName,
      playerName: csv.name,
      rowPosition: csv.position,
    }),
    number: csv.number,
    gamesPlayed: 0,
    goals: 0,
    disposals: 0,
    kicks: 0,
    handballs: 0,
    marks: 0,
    tackles: 0,
    clearances: 0,
    hitOuts: 0,
    fantasyPoints: 0,
  };
}

export async function fetchAflPlayers(options?: { includeAllTeams?: boolean }): Promise<AflPlayer[]> {
  const includeAllTeams = Boolean(options?.includeAllTeams);
  const cacheKey = includeAllTeams ? 'allTeams' : 'default';
  const now = Date.now();
  const activeCache = caches[cacheKey];

  if (activeCache && now - activeCache.at < TTL_MS) {
    if (import.meta.env.DEV) {
      console.log('[aflPlayers] using cached players', { cacheKey, count: activeCache.players.length });
    }
    return activeCache.players;
  }

  let rawPlayers: RawPlayerRow[] = [];
  const baseline = includeAllTeams ? null : await fetchActiveCompetitionBaseline().catch(() => null);

  try {
    rawPlayers = await fetchPlayersRaw();
  } catch {
    rawPlayers = [];
  }

  const teamById = await fetchTeamsById();

  if (import.meta.env.DEV) {
    console.log('[aflPlayers] after fetchPlayersRaw', {
      rawPlayersCount: rawPlayers.length,
      teamByIdCount: teamById.size,
      sampleTeams: Array.from(teamById.values()).slice(0, 2),
    });
  }

  const byId = new Map<string, AflPlayer>();
  for (const row of rawPlayers || []) {
    const mapped = toAflPlayer(row, teamById);
    if (!mapped) continue;
    const prev = byId.get(mapped.id);
    byId.set(mapped.id, prev ? mergePreferBetter(prev, mapped) : mapped);
  }

  const beforeMergeMissingTeam = Array.from(byId.values()).filter(
    (p) => !p.teamName && !p.teamKey && !p.teamId,
  ).length;

  if (import.meta.env.DEV) {
    console.log('[aflPlayers] after toAflPlayer', {
      byIdCount: byId.size,
      missingTeamLinkageBeforeCsvMerge: beforeMergeMissingTeam,
      samplePlayers: Array.from(byId.values()).slice(0, 3).map((p) => ({
        id: p.id,
        name: p.name,
        teamId: p.teamId,
        teamName: p.teamName,
        teamKey: p.teamKey,
      })),
    });
  }

  const bundledPlayers = await fetchBundledPlayersCsv().catch(() => [] as CsvPlayerRow[]);

  for (const csvPlayer of bundledPlayers) {
    const csvMapped = toCsvAflPlayer(csvPlayer, teamById);
    const existing = byId.get(csvPlayer.id);

    if (existing) {
      byId.set(csvPlayer.id, mergePreferBetter(existing, csvMapped));
    } else {
      byId.set(csvPlayer.id, csvMapped);
    }
  }

  const afterMergeMissingTeam = Array.from(byId.values()).filter(
    (p) => !p.teamName && !p.teamKey && !p.teamId,
  ).length;

  if (import.meta.env.DEV) {
    console.log('[aflPlayers] merge debug', {
      rawPlayersCount: rawPlayers.length,
      dbDerivedPlayersCount: rawPlayers.length,
      mergedPlayersCount: byId.size,
      bundledCsvCount: bundledPlayers.length,
      missingTeamLinkageBeforeMerge: beforeMergeMissingTeam,
      missingTeamLinkageAfterMerge: afterMergeMissingTeam,
      sampleAfterMerge: Array.from(byId.values()).slice(0, 5).map((p) => ({
        id: p.id,
        name: p.name,
        teamId: p.teamId,
        teamName: p.teamName,
        teamKey: p.teamKey,
      })),
    });
  }

  const allPlayers = Array.from(byId.values());
  const baselineTeams = baseline?.teams || [];
  let players = allPlayers;

  if (baselineTeams.length > 0) {
    const teamIds = new Set(baselineTeams.map((team) => strOrUndef(team.id)).filter(Boolean));
    const teamNames = new Set(
      baselineTeams
        .flatMap((team) => [normalizeTeamToken(team.name), normalizeTeamToken(team.shortName)])
        .filter(Boolean),
    );
    const teamKeys = new Set(
      baselineTeams
        .flatMap((team) => [normalizeTeamToken(team.teamKey), normalizeTeamToken(team.slug)])
        .filter(Boolean),
    );

    const filtered = allPlayers.filter((player) => {
      const playerTeamId = strOrUndef(player.teamId);
      const playerTeamName = normalizeTeamToken(player.teamName);
      const playerTeamKey = normalizeTeamToken(player.teamKey);
      return (
        (playerTeamId && teamIds.has(playerTeamId)) ||
        (playerTeamName && teamNames.has(playerTeamName)) ||
        (playerTeamKey && teamKeys.has(playerTeamKey))
      );
    });

    if (filtered.length > 0) {
      players = filtered;
    }
  }

  players.sort((a, b) => a.name.localeCompare(b.name));

  if (import.meta.env.DEV) {
    console.log('[aflPlayers] final players', {
      count: players.length,
      sampleByTeam: Array.from(new Map(players.map((p) => [p.teamKey || p.teamName || p.id, p])).entries())
        .slice(0, 5)
        .map(([key, p]) => ({
          team: key,
          player: p.name,
          teamId: p.teamId,
          teamName: p.teamName,
          teamKey: p.teamKey,
        })),
    });
  }

  caches[cacheKey] = { at: now, players };
  return players;
}

export function clearAflPlayersCache() {
  caches.default = null;
  caches.allTeams = null;
  bundledCsvCache = null;
}