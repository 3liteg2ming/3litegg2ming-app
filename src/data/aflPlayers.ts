import { requireSupabaseClient } from '../lib/supabaseClient';

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
  hitOuts?: number;
  fantasyPoints?: number;
};

type TeamLookup = { id?: string; name?: string; teamKey?: string };
type RawPlayerRow = Record<string, any>;

let cache: { at: number; players: AflPlayer[] } | null = null;
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
  return strOrUndef(p?.headshot_url) || strOrUndef(p?.photo_url) || strOrUndef(p?.headshot);
}

function normalizeTeamKey(raw?: string) {
  return raw ? raw.trim().toLowerCase() || undefined : undefined;
}

async function fetchPlayersRaw() {
  const selectAttempts = [
    // Optional nested join by team_id (works when FK relationship metadata exists)
    `id,name,team_id,team_key,team_name,team,position,number,headshot_url,photo_url,headshot,
     games_played,goals,disposals,kicks,handballs,marks,tackles,hit_outs,fantasy_points,
     eg_teams(id,name,team_key)`,
    // Flat row with stats
    'id,name,team_id,team_key,team_name,team,position,number,headshot_url,photo_url,headshot,games_played,goals,disposals,kicks,handballs,marks,tackles,hit_outs,fantasy_points',
    // Flat row minimal stats-less
    'id,name,team_id,team_key,team_name,team,position,number,headshot_url,photo_url,headshot',
    // Minimal schema requested by user
    'id,name,team_id,position,number,headshot_url',
    // First/last name schema fallback
    'id,first_name,last_name,team_id,position,number,headshot_url,photo_url',
  ] as const;

  let data: any[] = [];
  let lastErr: any = null;

  for (const sel of selectAttempts) {
    const res = await supabase.from('eg_players').select(sel).order('name', { ascending: true }).limit(5000);
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

  const players = Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  cache = { at: now, players };
  return players;
}

export function clearAflPlayersCache() {
  cache = null;
}
