import { supabase } from '../lib/supabaseClient';

export type AflPlayer = {
  id: string;
  name: string;
  headshotUrl?: string;

  teamId?: string;
  teamName?: string;
  /** Optional canonical key if your eg_teams table provides it (eg: "carlton", "gws") */
  teamKey?: string;

  position?: string;
  number?: number;

  // Optional season stats (if your eg_players table includes them)
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

let cache: { at: number; players: AflPlayer[] } | null = null;
const TTL_MS = 5 * 60_000;

function numOrUndef(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function strOrUndef(v: any) {
  const s = typeof v === 'string' ? v : v == null ? '' : String(v);
  const t = s.trim();
  return t ? t : undefined;
}

/**
 * Fetches AFL player list.
 *
 * IMPORTANT:
 * Your Supabase schema has changed a few times during the build.
 * This fetch is intentionally defensive and supports:
 *  - team_id (uuid FK -> eg_teams.id)
 *  - team_key (text like "carlton")
 *  - team_name / team (text like "Carlton Blues")
 *  - team (number index used by some CSV imports)
 *  - headshot_url OR photo_url OR headshot
 *  - stats columns may or may not exist yet
 */
export async function fetchAflPlayers(): Promise<AflPlayer[]> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.players;

  const selectAttempts = [
    // richest
    'id,name,team_id,team_key,team_name,team,position,number,headshot_url,photo_url,headshot,games_played,goals,disposals,kicks,handballs,marks,tackles,hit_outs,fantasy_points',
    // no stats
    'id,name,team_id,team_key,team_name,team,position,number,headshot_url,photo_url,headshot',
    // minimal legacy
    'id,name,team_id,position,number,headshot_url',
  ];

  let players: any[] = [];
  let lastErr: any = null;

  for (const sel of selectAttempts) {
    const res = await supabase.from('eg_players').select(sel).order('name', { ascending: true }).limit(2000);
    if (!res.error) {
      players = (res.data as any[]) || [];
      lastErr = null;
      break;
    }
    lastErr = res.error;
  }
  if (lastErr) throw lastErr;

  // Build robust team maps (by id, by key, by number)
  const teamsRes = await supabase
    .from('eg_teams')
    .select('id,name,team_key,team_number,number,ord,afl_number')
    .limit(300);

  const teamById = new Map<string, { name?: string; teamKey?: string; num?: number }>();
  const teamByKey = new Map<string, { name?: string; teamKey?: string; num?: number }>();
  const teamByNum = new Map<number, { name?: string; teamKey?: string; num?: number }>();

  if (!teamsRes.error) {
    for (const t of teamsRes.data || []) {
      const id = strOrUndef((t as any).id);
      const name = strOrUndef((t as any).name);
      const teamKey = strOrUndef((t as any).team_key)?.toLowerCase();
      const rawNum =
        (t as any).team_number ?? (t as any).afl_number ?? (t as any).number ?? (t as any).ord;
      const n = numOrUndef(rawNum);

      const rec = { name, teamKey, num: n };
      if (id) teamById.set(id, rec);
      if (teamKey) teamByKey.set(teamKey, rec);
      if (typeof n === 'number') teamByNum.set(n, rec);
    }
  }

  const getPhoto = (p: any) =>
    strOrUndef(p.headshot_url) || strOrUndef(p.photo_url) || strOrUndef(p.headshot) || undefined;

  const out: AflPlayer[] = (players || []).map((p: any) => {
    const tid = strOrUndef(p.team_id);
    const tk = strOrUndef(p.team_key)?.toLowerCase();
    const tn = strOrUndef(p.team_name);
    const tRaw = p.team;

    const fromId = tid ? teamById.get(tid) : undefined;
    const fromKey = tk ? teamByKey.get(tk) : undefined;

    let resolvedName = tn || fromId?.name || fromKey?.name;
    let resolvedKey = tk || fromId?.teamKey || fromKey?.teamKey;

    // If "team" is a string, it could be either a team_key or team_name
    if ((!resolvedName || !resolvedKey) && typeof tRaw === 'string' && tRaw.trim()) {
      const raw = tRaw.trim();
      const maybeKey = raw.toLowerCase();
      const byKey = teamByKey.get(maybeKey);
      if (byKey) {
        resolvedName = resolvedName || byKey.name;
        resolvedKey = resolvedKey || byKey.teamKey;
      } else {
        // try exact name match
        for (const rec of teamById.values()) {
          if (rec?.name && rec.name.toLowerCase() === maybeKey) {
            resolvedName = resolvedName || rec.name;
            resolvedKey = resolvedKey || rec.teamKey;
            break;
          }
        }
        resolvedName = resolvedName || raw;
      }
    }

    // If "team" is a number, map via eg_teams number columns
    if ((!resolvedName || !resolvedKey) && (typeof tRaw === 'number' || /^[0-9]+$/.test(String(tRaw || '')))) {
      const n = Number(tRaw);
      const rec = teamByNum.get(n);
      if (rec) {
        resolvedName = resolvedName || rec.name;
        resolvedKey = resolvedKey || rec.teamKey;
      }
    }

    return {
      id: String(p.id),
      name: String(p.name),

      teamId: tid,
      teamName: resolvedName,
      teamKey: resolvedKey,

      position: strOrUndef(p.position),
      number: typeof p.number === 'number' ? p.number : numOrUndef(p.number),
      headshotUrl: getPhoto(p),

      gamesPlayed: numOrUndef((p as any).games_played),
      goals: numOrUndef((p as any).goals),
      disposals: numOrUndef((p as any).disposals),
      kicks: numOrUndef((p as any).kicks),
      handballs: numOrUndef((p as any).handballs),
      marks: numOrUndef((p as any).marks),
      tackles: numOrUndef((p as any).tackles),
      hitOuts: numOrUndef((p as any).hit_outs),
      fantasyPoints: numOrUndef((p as any).fantasy_points),
    };
  });

  cache = { at: now, players: out };
  return out;
}
