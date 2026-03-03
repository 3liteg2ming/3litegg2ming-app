import { fetchAflPlayers, type AflPlayer } from '../data/aflPlayers';
import { getDataSeasonSlugForCompetition, getStoredCompetitionKey } from './competitionRegistry';
import { getSupabaseClient } from './supabaseClient';
import { TEAM_ASSETS, assetUrl, type TeamKey } from './teamAssets';

export type Mode = 'players' | 'teams';
export type Scope = 'total' | 'average';

export type StatKey =
  | 'goals'
  | 'disposals'
  | 'kicks'
  | 'handballs'
  | 'marks'
  | 'tackles'
  | 'clearances'
  | 'hitOuts'
  | 'fantasyPoints'
  | 'goalEfficiency';

export type LeaderRow = {
  rank: number;
  name: string;
  sub?: string;
  imgUrl?: string;
  total: number;
  average: number;
  playerId?: string;
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
  teamKey: string;
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
  clearances: 'Clearances',
  hitOuts: 'Hit Outs',
  fantasyPoints: 'Fantasy Points',
  goalEfficiency: 'Goal Efficiency',
};

type SeasonTotalsRow = {
  player_id: string;
  team_id?: string | null;
  matches?: number | null;
  disposals?: number | null;
  kicks?: number | null;
  handballs?: number | null;
  marks?: number | null;
  tackles?: number | null;
  clearances?: number | null;
};

type LeadersCacheEntry = { at: number; value: unknown };
const leadersCache = new Map<string, LeadersCacheEntry>();
const LEADERS_TTL_MS = 180_000;
const seasonIdCache = new Map<string, string>();

function cacheNamespace(): string {
  const compKey = getStoredCompetitionKey();
  const seasonSlug = getDataSeasonSlugForCompetition(compKey);
  return `${compKey}:${String(seasonSlug || '').trim().toLowerCase()}`;
}

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

function safeNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalize(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function teamKeyFromNameOrKey(input?: string): string {
  const raw = String(input || '').trim().toLowerCase();
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
    portadelaidepower: 'portadelaide',
    richmondtigers: 'richmond',
    stkilda: 'stkilda',
    stkildasaints: 'stkilda',
    sydneyswans: 'sydney',
    westcoasteagles: 'westcoast',
    westernbulldogs: 'westernbulldogs',
  };

  if ((TEAM_ASSETS as Record<string, unknown>)[raw]) return raw as TeamKey;
  if (aliases[compact]) return aliases[compact];

  const n = normalize(raw);
  const entries = Object.entries(TEAM_ASSETS) as Array<[TeamKey, { name?: string; shortName?: string; alt?: string }]>;

  for (const [key, asset] of entries) {
    const names = [asset.name, asset.shortName, asset.alt, key].filter(Boolean).map((x) => normalize(String(x)));
    if (names.includes(n)) return key;
  }

  for (const [key, asset] of entries) {
    const names = [asset.name, asset.shortName, asset.alt, key].filter(Boolean).map((x) => normalize(String(x)));
    if (names.some((x) => x && (n.includes(x) || x.includes(n)))) return key;
  }

  return 'unknown';
}

async function resolveSeasonId(): Promise<string | null> {
  const slug = getDataSeasonSlugForCompetition(getStoredCompetitionKey());
  const normalizedSlug = String(slug || '').trim().toLowerCase();
  if (!normalizedSlug) return null;

  const cached = seasonIdCache.get(normalizedSlug);
  if (cached) return cached;

  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const aliases: Record<string, string> = {
    afl26: 'afl26-season-two',
    'afl-26': 'afl26-season-two',
  };

  const attempts = [normalizedSlug, aliases[normalizedSlug]].filter((v, i, arr): v is string => !!v && arr.indexOf(v) === i);

  for (const attempt of attempts) {
    const { data, error } = await supabase.from('eg_seasons').select('id, slug').eq('slug', attempt).maybeSingle();
    if (!error && data?.id) {
      const id = String(data.id);
      seasonIdCache.set(normalizedSlug, id);
      seasonIdCache.set(String((data as any).slug || attempt).toLowerCase(), id);
      return id;
    }
  }

  const { data } = await supabase
    .from('eg_seasons')
    .select('id, slug')
    .ilike('slug', `%${normalizedSlug}%`)
    .limit(1);

  if (Array.isArray(data) && data[0]?.id) {
    const id = String(data[0].id);
    seasonIdCache.set(normalizedSlug, id);
    return id;
  }

  return null;
}

async function fetchSeasonTotalsByPlayer(): Promise<Map<string, SeasonTotalsRow>> {
  const supabase = getSupabaseClient();
  if (!supabase) return new Map();

  const seasonId = await resolveSeasonId();
  if (!seasonId) return new Map();

  const { data, error } = await supabase
    .from('eg_player_season_totals_ext')
    .select('player_id,team_id,matches,disposals,kicks,handballs,marks,tackles,clearances')
    .eq('season_id', seasonId)
    .limit(6000);

  if (error || !Array.isArray(data)) return new Map();

  const map = new Map<string, SeasonTotalsRow>();
  for (const row of data as SeasonTotalsRow[]) {
    const id = String(row?.player_id || '').trim();
    if (!id) continue;
    map.set(id, row);
  }
  return map;
}

function hasTrackedSeasonStat(row: SeasonTotalsRow | undefined): boolean {
  if (!row) return false;
  const values = [row.disposals, row.kicks, row.handballs, row.marks, row.tackles, row.clearances];
  return values.some((v) => v != null && Number.isFinite(Number(v)));
}

type PlayerMetricRow = {
  id: string;
  playerId: string;
  name: string;
  teamName: string;
  teamKey: string;
  teamResolved: boolean;
  photoUrl?: string;
  totals: Record<StatKey, number>;
  avgs: Record<StatKey, number>;
};

function pickName(player: AflPlayer): string {
  return String(player.name || '').trim() || 'Player not linked';
}

function pickTeamName(player: AflPlayer, teamKey: string): string {
  return String(player.teamName || TEAM_ASSETS[teamKey as TeamKey]?.name || 'Unassigned').trim();
}

function pickPhoto(player: AflPlayer, teamKey: string): string | undefined {
  const photo = String(player.headshotUrl || '').trim();
  if (photo) return photo;
  const teamLogo = TEAM_ASSETS[teamKey as TeamKey]?.logoFile;
  return teamLogo ? assetUrl(teamLogo) : undefined;
}

function buildPlayerMetric(player: AflPlayer, seasonTotals?: SeasonTotalsRow): PlayerMetricRow {
  const teamKey = teamKeyFromNameOrKey(player.teamKey || player.teamName || '');
  const teamName = pickTeamName(player, teamKey);

  const goalsTotal = safeNum(player.goals);
  const disposalsTotal =
    seasonTotals && seasonTotals.disposals != null
      ? safeNum(seasonTotals.disposals)
      : safeNum(player.disposals) || safeNum(player.kicks) + safeNum(player.handballs);
  const kicksTotal = seasonTotals && seasonTotals.kicks != null ? safeNum(seasonTotals.kicks) : safeNum(player.kicks);
  const handballsTotal =
    seasonTotals && seasonTotals.handballs != null ? safeNum(seasonTotals.handballs) : safeNum(player.handballs);
  const marksTotal = seasonTotals && seasonTotals.marks != null ? safeNum(seasonTotals.marks) : safeNum(player.marks);
  const tacklesTotal = seasonTotals && seasonTotals.tackles != null ? safeNum(seasonTotals.tackles) : safeNum(player.tackles);
  const clearancesTotal =
    seasonTotals && seasonTotals.clearances != null ? safeNum(seasonTotals.clearances) : 0;
  const hitOutsTotal = safeNum(player.hitOuts);
  const fantasyPointsTotal = safeNum(player.fantasyPoints);

  const matches = Math.max(1, safeNum(seasonTotals?.matches) || safeNum(player.gamesPlayed) || 1);

  const totals: Record<StatKey, number> = {
    goals: goalsTotal,
    disposals: disposalsTotal,
    kicks: kicksTotal,
    handballs: handballsTotal,
    marks: marksTotal,
    tackles: tacklesTotal,
    clearances: clearancesTotal,
    hitOuts: hitOutsTotal,
    fantasyPoints: fantasyPointsTotal,
    goalEfficiency: disposalsTotal > 0 ? (goalsTotal / disposalsTotal) * 100 : 0,
  };

  const avgs: Record<StatKey, number> = {
    goals: goalsTotal / matches,
    disposals: disposalsTotal / matches,
    kicks: kicksTotal / matches,
    handballs: handballsTotal / matches,
    marks: marksTotal / matches,
    tackles: tacklesTotal / matches,
    clearances: clearancesTotal / matches,
    hitOuts: hitOutsTotal / matches,
    fantasyPoints: fantasyPointsTotal / matches,
    goalEfficiency: totals.goalEfficiency,
  };

  const name = pickName(player);

  return {
    id: String(player.id),
    playerId: String(player.id),
    name,
    teamName,
    teamKey,
    teamResolved: Boolean(player.teamName || player.teamKey),
    photoUrl: pickPhoto(player, teamKey),
    totals,
    avgs,
  };
}

async function buildPlayers(statKey: StatKey, includeOnlyWithSeasonTotals = false): Promise<PlayerMetricRow[]> {
  const [players, seasonTotals] = await Promise.all([fetchAflPlayers(), fetchSeasonTotalsByPlayer()]);

  const rows = (players || [])
    .filter((p) => p && p.id)
    .filter((p) => {
      if (!includeOnlyWithSeasonTotals) return true;
      return hasTrackedSeasonStat(seasonTotals.get(String(p.id)));
    })
    .map((p) => buildPlayerMetric(p, seasonTotals.get(String(p.id))))
    .sort((a, b) => {
      const diff = b.totals[statKey] - a.totals[statKey];
      if (Math.abs(diff) > 0.0001) return diff;
      return a.name.localeCompare(b.name);
    });

  return rows;
}

type TeamMetricRow = {
  id: string;
  name: string;
  teamKey: string;
  photoUrl?: string;
  totals: Record<StatKey, number>;
  avgs: Record<StatKey, number>;
};

async function buildTeams(statKey: StatKey): Promise<TeamMetricRow[]> {
  const players = await buildPlayers(statKey, false);
  const byTeam = new Map<string, TeamMetricRow>();

  for (const p of players) {
    const prev = byTeam.get(p.teamKey) || {
      id: p.teamKey,
      name: p.teamName,
      teamKey: p.teamKey,
      photoUrl: TEAM_ASSETS[p.teamKey as TeamKey]?.logoFile ? assetUrl(TEAM_ASSETS[p.teamKey as TeamKey].logoFile ?? '') : undefined,
      totals: {
        goals: 0,
        disposals: 0,
        kicks: 0,
        handballs: 0,
        marks: 0,
        tackles: 0,
        clearances: 0,
        hitOuts: 0,
        fantasyPoints: 0,
        goalEfficiency: 0,
      },
      avgs: {
        goals: 0,
        disposals: 0,
        kicks: 0,
        handballs: 0,
        marks: 0,
        tackles: 0,
        clearances: 0,
        hitOuts: 0,
        fantasyPoints: 0,
        goalEfficiency: 0,
      },
    } as TeamMetricRow;

    (Object.keys(prev.totals) as StatKey[]).forEach((k) => {
      prev.totals[k] += p.totals[k];
      prev.avgs[k] += p.avgs[k];
    });

    byTeam.set(p.teamKey, prev);
  }

  const rows = Array.from(byTeam.values());
  for (const row of rows) {
    row.totals.goalEfficiency = row.totals.disposals > 0 ? (row.totals.goals / row.totals.disposals) * 100 : 0;
    row.avgs.goalEfficiency = row.avgs.disposals > 0 ? (row.avgs.goals / row.avgs.disposals) * 100 : 0;
  }

  rows.sort((a, b) => {
    const diff = b.totals[statKey] - a.totals[statKey];
    if (Math.abs(diff) > 0.0001) return diff;
    return a.name.localeCompare(b.name);
  });

  return rows;
}

export function clearStatLeadersCache() {
  leadersCache.clear();
}

export function peekLeaderCategoriesCache(mode: Mode): StatLeaderCategory[] | null {
  const ns = cacheNamespace();
  return (
    leadersCacheGet<StatLeaderCategory[]>(`${ns}:categories:${mode}`) ||
    (mode === 'players' ? leadersCacheGet<StatLeaderCategory[]>(`${ns}:rail:players`) : null)
  );
}

const CATEGORY_KEYS: StatKey[] = ['goals', 'disposals', 'marks', 'tackles', 'fantasyPoints'];

export async function fetchLeaderCategories(mode: Mode): Promise<StatLeaderCategory[]> {
  const ns = cacheNamespace();
  const cacheKey = `${ns}:categories:${mode}`;
  const cached = leadersCacheGet<StatLeaderCategory[]>(cacheKey);
  if (cached) return cached;

  const value = await Promise.all(
    CATEGORY_KEYS.map(async (k) => {
      if (mode === 'teams') {
        const rows = await buildTeams(k);
        const top = rows[0];
        return {
          statKey: k,
          label: LABELS[k],
          top: top
            ? {
                id: top.id,
                name: top.name,
                teamName: top.name,
                teamKey: top.teamKey,
                teamResolved: true,
                photoUrl: top.photoUrl,
                valueTotal: top.totals[k],
                valueAvg: top.avgs[k],
              }
            : null,
          others: rows.slice(1, 5).map((r) => ({
            id: r.id,
            name: r.name,
            teamName: r.name,
            teamKey: r.teamKey,
            teamResolved: true,
            photoUrl: r.photoUrl,
            valueTotal: r.totals[k],
            valueAvg: r.avgs[k],
          })),
        } as StatLeaderCategory;
      }

      const rows = await buildPlayers(k, false);
      const top = rows[0];
      return {
        statKey: k,
        label: LABELS[k],
        top: top
          ? {
              id: top.id,
              name: top.name,
              teamName: top.teamName,
              teamKey: top.teamKey,
              teamResolved: top.teamResolved,
              photoUrl: top.photoUrl,
              valueTotal: top.totals[k],
              valueAvg: top.avgs[k],
            }
          : null,
        others: rows.slice(1, 5).map((r) => ({
          id: r.id,
          name: r.name,
          teamName: r.teamName,
          teamKey: r.teamKey,
          teamResolved: r.teamResolved,
          photoUrl: r.photoUrl,
          valueTotal: r.totals[k],
          valueAvg: r.avgs[k],
        })),
      } as StatLeaderCategory;
    })
  );

  return leadersCacheSet(cacheKey, value);
}

export async function fetchStatLeaders(): Promise<StatLeaderCategory[]>;
export async function fetchStatLeaders(mode: Mode, statKey: StatKey): Promise<StatLeaders>;
export async function fetchStatLeaders(mode?: Mode, statKey?: StatKey): Promise<StatLeaderCategory[] | StatLeaders> {
  if (!mode || !statKey) {
    const ns = cacheNamespace();
    const cacheKey = `${ns}:rail:players`;
    const cached = leadersCacheGet<StatLeaderCategory[]>(cacheKey);
    if (cached) return cached;
    const value = await fetchLeaderCategories('players');
    return leadersCacheSet(cacheKey, value);
  }

  const ns = cacheNamespace();
  const cacheKey = `${ns}:table:${mode}:${statKey}`;
  const cached = leadersCacheGet<StatLeaders>(cacheKey);
  if (cached) return cached;

  if (mode === 'players') {
    const rows = (await buildPlayers(statKey, false))
      .map((r, i) => ({
        rank: i + 1,
        playerId: r.playerId,
        name: r.name,
        sub: r.teamName,
        imgUrl: r.photoUrl,
        total: r.totals[statKey],
        average: r.avgs[statKey],
      }))
      .slice(0, 300);

    return leadersCacheSet(cacheKey, {
      mode,
      statKey,
      label: LABELS[statKey],
      rows,
    } as StatLeaders);
  }

  const rows = (await buildTeams(statKey))
    .map((r, i) => ({
      rank: i + 1,
      name: r.name,
      imgUrl: r.photoUrl,
      total: r.totals[statKey],
      average: r.avgs[statKey],
    }))
    .slice(0, 60);

  return leadersCacheSet(cacheKey, {
    mode,
    statKey,
    label: LABELS[statKey],
    rows,
  } as StatLeaders);
}
