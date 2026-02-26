import { fetchAflPlayers, type AflPlayer } from '../data/aflPlayers';
import { TEAM_ASSETS, assetUrl, type TeamKey } from './teamAssets';

/**
 * This file intentionally supports TWO consumers:
 *  - StatsPage.tsx (AFL-app style Season Leaders rail) via fetchStatLeaders() with NO args
 *  - StatLeadersPage.tsx (full table page) via fetchStatLeaders(mode, statKey)
 */

export type Mode = 'players' | 'teams';
export type Scope = 'total' | 'average';

export type StatKey =
  | 'goals'
  | 'disposals'
  | 'kicks'
  | 'handballs'
  | 'marks'
  | 'tackles'
  | 'hitOuts'
  | 'fantasyPoints';

export type LeaderRow = {
  rank: number;
  name: string;
  sub?: string;
  imgUrl?: string;
  total: number;
  average: number;
};

export type StatLeaders = {
  mode: Mode;
  statKey: StatKey;
  label: string;
  rows: LeaderRow[];
};

export type StatLeaderPerson = {
  id: string;
  name: string;
  teamName: string;
  teamKey: TeamKey;
  teamResolved?: boolean;
  photoUrl?: string;
  valueTotal: number;
  valueAvg: number;
};

export type StatLeaderCategory = {
  statKey: StatKey;
  label: string;
  top: StatLeaderPerson | null;
  others: StatLeaderPerson[];
};

const LABELS: Record<StatKey, string> = {
  goals: 'Goals',
  disposals: 'Disposals',
  kicks: 'Kicks',
  handballs: 'Handballs',
  marks: 'Marks',
  tackles: 'Tackles',
  hitOuts: 'Hit Outs',
  fantasyPoints: 'Fantasy Points',
};

const PLAYER_TEAM_OVERRIDES: Record<string, { teamName: string; teamKey: TeamKey }> = {
  'aaron cadman': { teamName: 'GWS Giants', teamKey: 'gws' },
};

type LeadersCacheEntry = { at: number; value: any };
const leadersCache = new Map<string, LeadersCacheEntry>();
const LEADERS_TTL_MS = 60_000;

function leadersCacheGet<T>(key: string): T | null {
  const hit = leadersCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > LEADERS_TTL_MS) {
    leadersCache.delete(key);
    return null;
  }
  return hit.value as T;
}

function leadersCacheSet<T>(key: string, value: T): T {
  leadersCache.set(key, { at: Date.now(), value });
  return value;
}

export function clearStatLeadersCache() {
  leadersCache.clear();
}

export function peekLeaderCategoriesCache(mode: Mode): StatLeaderCategory[] | null {
  return (
    leadersCacheGet<StatLeaderCategory[]>(`categories:${mode}`) ||
    (mode === 'players' ? leadersCacheGet<StatLeaderCategory[]>('rail:players') : null)
  );
}

function norm(s: string) {
  return (s || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function clampTeamKey(k?: string): TeamKey {
  const raw = String(k || '').trim().toLowerCase();
  const compact = raw.replace(/[^a-z0-9]/g, '');

  const aliases: Record<string, TeamKey> = {
    adelaidecrows: 'adelaide',
    brisbanelions: 'brisbane',
    carltonblues: 'carlton',
    collingwoodmagpies: 'collingwood',
    essendonbombers: 'essendon',
    fremantledockers: 'fremantle',
    geelongcats: 'geelong',
    goldcoastsuns: 'goldcoast',
    gwsgiants: 'gws',
    giants: 'gws',
    hawthornhawks: 'hawthorn',
    melbournedemons: 'melbourne',
    northmelbournekangaroos: 'northmelbourne',
    northmelbourne: 'northmelbourne',
    portadelaidepower: 'portadelaide',
    richmondtigers: 'richmond',
    stkildasaints: 'stkilda',
    stkilda: 'stkilda',
    sydneyswans: 'sydney',
    westcoasteagles: 'westcoast',
    westernbulldogs: 'westernbulldogs',
  };

  const direct = raw as TeamKey;
  if ((TEAM_ASSETS as any)[direct]) return direct;
  if (aliases[compact]) return aliases[compact];
  return teamKeyFromName(raw);
}

function teamKeyFromName(teamName: string): TeamKey {
  const n = norm(teamName);
  const entries = Object.entries(TEAM_ASSETS) as Array<[TeamKey, any]>;

  for (const [k, v] of entries) {
    const candidates = [v.name, v.shortName, v.alt, k].filter(Boolean).map(norm);
    if (candidates.includes(n)) return k;
  }
  for (const [k, v] of entries) {
    const candidates = [v.name, v.shortName, v.alt, k].filter(Boolean).map(norm);
    if (candidates.some((c: string) => c && (n.includes(c) || c.includes(n)))) return k;
  }
  return 'adelaide';
}

function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function gamesPlayed(p: AflPlayer) {
  return Math.max(0, safeNum((p as any).gamesPlayed));
}

function playerTotal(p: AflPlayer, stat: StatKey): number {
  if (stat === 'disposals') {
    const d = safeNum((p as any).disposals);
    if (d) return d;
    return safeNum((p as any).kicks) + safeNum((p as any).handballs);
  }
  if (stat === 'goals') return safeNum((p as any).goals);
  if (stat === 'kicks') return safeNum((p as any).kicks);
  if (stat === 'handballs') return safeNum((p as any).handballs);
  if (stat === 'marks') return safeNum((p as any).marks);
  if (stat === 'tackles') return safeNum((p as any).tackles);
  if (stat === 'hitOuts') return safeNum((p as any).hitOuts);
  if (stat === 'fantasyPoints') return safeNum((p as any).fantasyPoints);
  return 0;
}

function perGame(total: number, gp: number) {
  const d = Math.max(1, gp || 0);
  return total / d;
}

async function buildPlayers(statKey: StatKey) {
  const players = await fetchAflPlayers();

  return (players || [])
    .filter((p) => p && p.id && p.name)
    .map((p) => {
      const gp = gamesPlayed(p);
      const total = playerTotal(p, statKey);
      const avg = perGame(total, gp);
      const rawName = String(p.name || '');
      const override = PLAYER_TEAM_OVERRIDES[norm(rawName)];
      const rawTeamName = String((p as any).teamName || '');
      const rawTeamKey = String((p as any).teamKey || '');
      const teamName = rawTeamName || override?.teamName || '';
      const hasSourceTeam = Boolean(rawTeamName || rawTeamKey || override);
      const key = rawTeamKey
        ? clampTeamKey(rawTeamKey)
        : teamName
          ? teamKeyFromName(teamName)
          : (override?.teamKey || 'adelaide');

      return {
        id: String(p.id),
        name: rawName,
        teamName,
        teamKey: key,
        teamResolved: hasSourceTeam,
        photoUrl: (p as any).headshotUrl ? String((p as any).headshotUrl) : undefined,
        valueTotal: total,
        valueAvg: avg,
      };
    })
    .sort((a, b) => (b.valueTotal - a.valueTotal) || a.name.localeCompare(b.name));
}

async function buildTeams(statKey: StatKey) {
  const players = await fetchAflPlayers();
  const byTeam = new Map<string, { teamName: string; total: number; gpGuess: number; teamKey?: string }>();

  for (const p of players || []) {
    const rawName = String((p as any).teamName || '').trim();
    const rawKey = String((p as any).teamKey || '').trim();

    // If eg_teams isn't populated, we can still build team leaders from team_key.
    const teamName = rawName || (rawKey ? rawKey.toUpperCase() : 'UNKNOWN');

    const prev = byTeam.get(teamName) || { teamName, total: 0, gpGuess: 0, teamKey: (p as any).teamKey };
    prev.total += playerTotal(p, statKey);
    prev.gpGuess = Math.max(prev.gpGuess, gamesPlayed(p));
    if (!prev.teamKey && (p as any).teamKey) prev.teamKey = (p as any).teamKey;
    byTeam.set(teamName, prev);
  }

  return Array.from(byTeam.values())
    .map((t) => {
      const key = t.teamKey ? clampTeamKey(t.teamKey) : teamKeyFromName(t.teamName);
      const logo = TEAM_ASSETS[key]?.logoFile;
      return {
        id: key,
        name: t.teamName,
        teamName: t.teamName,
        teamKey: key,
        photoUrl: logo ? assetUrl(logo) : undefined,
        valueTotal: t.total,
        valueAvg: perGame(t.total, t.gpGuess),
      };
    })
    .sort((a, b) => (b.valueTotal - a.valueTotal) || a.name.localeCompare(b.name));
}



// ---- Convenience: Season leader categories (players OR teams) ----------------

export async function fetchLeaderCategories(mode: Mode): Promise<StatLeaderCategory[]> {
  const cacheKey = `categories:${mode}`;
  const cached = leadersCacheGet<StatLeaderCategory[]>(cacheKey);
  if (cached) return cached;

  const wanted: StatKey[] = ['goals', 'disposals', 'marks', 'tackles', 'fantasyPoints'];

  const value = await Promise.all(
    wanted.map(async (k) => {
      const rows = mode === 'teams' ? await buildTeams(k) : await buildPlayers(k);
      return {
        statKey: k,
        label: LABELS[k],
        top: rows[0] ?? null,
        others: rows.slice(1, 5),
      } as StatLeaderCategory;
    })
  );
  return leadersCacheSet(cacheKey, value);
}
// ---- Public API (overloads) -------------------------------------------------

/** StatsPage rail */
export async function fetchStatLeaders(): Promise<StatLeaderCategory[]>;
/** StatLeadersPage table */
export async function fetchStatLeaders(mode: Mode, statKey: StatKey): Promise<StatLeaders>;

export async function fetchStatLeaders(mode?: Mode, statKey?: StatKey): Promise<any> {
  if (!mode || !statKey) {
    const cacheKey = 'rail:players';
    const cached = leadersCacheGet<StatLeaderCategory[]>(cacheKey);
    if (cached) return cached;
    const wanted: StatKey[] = ['goals', 'disposals', 'marks', 'tackles', 'fantasyPoints'];

    const value = await Promise.all(
      wanted.map(async (k) => {
        const rows = await buildPlayers(k);
        return {
          statKey: k,
          label: LABELS[k],
          top: rows[0] ?? null,
          others: rows.slice(1, 5),
        } as StatLeaderCategory;
      })
    );
    return leadersCacheSet(cacheKey, value);
  }

  if (mode === 'players') {
    const cacheKey = `table:${mode}:${statKey}`;
    const cached = leadersCacheGet<StatLeaders>(cacheKey);
    if (cached) return cached;
    const rows = (await buildPlayers(statKey))
      .map((r, i) => ({
        rank: i + 1,
        name: r.name,
        sub: r.teamName,
        imgUrl: r.photoUrl,
        total: r.valueTotal,
        average: r.valueAvg,
      }))
      .slice(0, 300);

    return leadersCacheSet(cacheKey, {
      mode,
      statKey,
      label: LABELS[statKey],
      rows,
    } as StatLeaders);
  }

  const cacheKey = `table:${mode}:${statKey}`;
  const cached = leadersCacheGet<StatLeaders>(cacheKey);
  if (cached) return cached;
  const rows = (await buildTeams(statKey))
    .map((r, i) => ({
      rank: i + 1,
      name: r.name,
      imgUrl: r.photoUrl,
      total: r.valueTotal,
      average: r.valueAvg,
    }))
    .slice(0, 60);

  return leadersCacheSet(cacheKey, {
    mode,
    statKey,
    label: LABELS[statKey],
    rows,
  } as StatLeaders);
}
