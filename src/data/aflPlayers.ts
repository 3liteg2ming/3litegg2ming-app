import { requireSupabaseClient } from '../lib/supabaseClient';
import { fetchActiveCompetitionBaseline } from '../lib/seasonParticipantsRepo';
import { resolveKnownPlayerHeadshot } from '../lib/playerHeadshots';

const supabase = requireSupabaseClient();

export type AflPlayer = {
  id: string;
  name: string;
  headshotUrl?: string;

  teamId?: string;
  teamName?: string;
  teamKey?: string;

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
  name: string;
  headshotUrl?: string;
  teamName?: string;
  position?: string;
  number?: number;
};

let cache: { at: number; players: AflPlayer[] } | null = null;
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
    // Keep live roster fetches on the stable core schema only.
    'id,name,team_id,position,number,headshot_url,photo_url',
    'id,name,team_id,position,number,headshot_url',
    'id,name,team_id,headshot_url,photo_url',
    'id,name,team_id,headshot_url',
    'id,name,position,number,headshot_url,photo_url',
    'id,name,headshot_url,photo_url',
    'id,display_name,team_id,position,number,headshot_url,photo_url',
    'id,full_name,team_id,position,number,headshot_url,photo_url',
    'id,display_name,headshot_url,photo_url',
    'id,full_name,headshot_url,photo_url',
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

async function fetchBundledPlayersCsv(): Promise<CsvPlayerRow[]> {
  if (bundledCsvCache) return bundledCsvCache;

  const response = await fetch('/data/afl-players-2026.csv', { cache: 'force-cache' });
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
  const column = (name: string) => headers.indexOf(name);
  const players: CsvPlayerRow[] = [];

  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const read = (name: string) => {
      const index = column(name);
      return index >= 0 ? String(cells[index] || '').trim() : '';
    };

    const id = read('ID');
    const name = read('Player Name');
    if (!id || !name) continue;

    players.push({
      id,
      name,
      headshotUrl: strOrUndef(read('Headshot URL')) || undefined,
      teamName: strOrUndef(read('Team')) || undefined,
      position: strOrUndef(read('Position')) || undefined,
      number: numOrUndef(read('Jumper Number')),
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
    const normalizedKey = normalizeTeamKey(rawTeamKey)?.replace(/-/g, '');

    out.set(id, {
      id,
      name: strOrUndef((row as any).name),
      teamKey: normalizedKey,
    });
  }
  return out;
}

function resolveTeamFields(p: any, teamById: Map<string, TeamLookup>) {
  const teamId = strOrUndef(p?.team_id);
  const nestedTeam = Array.isArray(p?.eg_teams) ? p.eg_teams[0] : p?.eg_teams;

  const nestedName = strOrUndef(nestedTeam?.name);
  const nestedKey = normalizeTeamKey(strOrUndef(nestedTeam?.team_key) || strOrUndef(nestedTeam?.slug))?.replace(/-/g, '');
  const byId = teamId ? teamById.get(teamId) : undefined;

  const rowTeamKey = normalizeTeamKey(strOrUndef(p?.team_key))?.replace(/-/g, '');
  const rowTeamName = strOrUndef(p?.team_name);
  const rowTeamText = typeof p?.team === 'string' ? strOrUndef(p.team) : undefined;

  const teamName = rowTeamName || nestedName || byId?.name || rowTeamText;
  const teamKey = rowTeamKey || nestedKey || byId?.teamKey;

  return { teamId, teamName, teamKey };
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
    name,
    headshotUrl: pickHeadshot(p),

    teamId,
    teamName,
    teamKey,

    position: strOrUndef(p?.position),
    number: numOrUndef(p?.number),

    gamesPlayed: numOrUndef(p?.games_played),
    goals: numOrUndef(p?.goals),
    disposals: numOrUndef(p?.disposals),
    kicks: numOrUndef(p?.kicks),
    handballs: numOrUndef(p?.handballs),
    marks: numOrUndef(p?.marks),
    tackles: numOrUndef(p?.tackles),
    hitOuts: numOrUndef(p?.hit_outs),
    fantasyPoints: numOrUndef(p?.fantasy_points),
  };
}

function mergePreferBetter(prev: AflPlayer, next: AflPlayer): AflPlayer {
  // Prefer rows with a headshot; otherwise prefer rows with more populated fields.
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
    hitOuts: best.hitOuts ?? other.hitOuts,
    fantasyPoints: best.fantasyPoints ?? other.fantasyPoints,
  };
}

export async function fetchAflPlayers(): Promise<AflPlayer[]> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.players;

  let rawPlayers: RawPlayerRow[] = [];
  const baseline = await fetchActiveCompetitionBaseline().catch(() => null);
  try {
    rawPlayers = await fetchPlayersRaw();
  } catch {
    rawPlayers = [];
  }
  const teamById = await fetchTeamsById();

  const byId = new Map<string, AflPlayer>();
  for (const row of rawPlayers || []) {
    const mapped = toAflPlayer(row, teamById);
    if (!mapped) continue;
    const prev = byId.get(mapped.id);
    byId.set(mapped.id, prev ? mergePreferBetter(prev, mapped) : mapped);
  }

  if (byId.size === 0) {
    const bundledPlayers = await fetchBundledPlayersCsv().catch(() => [] as CsvPlayerRow[]);
    for (const player of bundledPlayers) {
      const normalizedTeamName = strOrUndef(player.teamName) || '';
      const matchedTeam = Array.from(teamById.values()).find((team) => {
        const nameToken = normalizeTeamToken(team.name);
        const keyToken = normalizeTeamToken(team.teamKey);
        const playerToken = normalizeTeamToken(normalizedTeamName);
        return playerToken && (playerToken === nameToken || playerToken === keyToken);
      });

      const mapped: AflPlayer = {
        id: player.id,
        name: player.name,
        headshotUrl: pickHeadshot({
          name: player.name,
          headshot_url: player.headshotUrl,
          photo_url: player.headshotUrl,
        }) || undefined,
        teamId: matchedTeam?.id,
        teamName: matchedTeam?.name || normalizedTeamName || undefined,
        teamKey: matchedTeam?.teamKey || normalizeTeamKey(normalizedTeamName)?.replace(/_/g, '') || undefined,
        position: player.position,
        number: player.number,
        gamesPlayed: 0,
        goals: 0,
        disposals: 0,
        kicks: 0,
        handballs: 0,
        marks: 0,
        tackles: 0,
        hitOuts: 0,
        fantasyPoints: 0,
      };

      byId.set(mapped.id, mapped);
    }
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
  cache = { at: now, players };
  return players;
}

export function clearAflPlayersCache() {
  cache = null;
}
