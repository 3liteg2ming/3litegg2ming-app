import { getDataSeasonSlugForCompetition, getStoredCompetitionKey } from './competitionRegistry';
import { fetchAflPlayers, type AflPlayer } from '../data/aflPlayers';
import {
  resolvePlayerDisplayName,
  resolveTeamKey,
  resolveTeamLogoUrl,
  resolveTeamName,
} from './entityResolvers';
import { fetchActiveCompetitionBaseline, type BaselineTeam } from './seasonParticipantsRepo';
import { resolveSeasonRecord } from './seasonResolver';
import { getSupabaseClient } from './supabaseClient';
import { TEAM_ASSETS, type TeamKey } from './teamAssets';
import { resolveKnownPlayerHeadshot } from './playerHeadshots';

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

type LeadersCacheEntry = { at: number; value: unknown };

type SeasonRecord = {
  id: string;
  slug: string;
};

type SeasonTotalsRow = {
  season_id?: string | null;
  player_id?: string | null;
  team_id?: string | null;
  player_name?: string | null;
  matches?: number | null;
  goals?: number | null;
  disposals?: number | null;
  kicks?: number | null;
  handballs?: number | null;
  marks?: number | null;
  tackles?: number | null;
  clearances?: number | null;
};

type GoalAggregateRow = {
  id: string;
  playerId?: string | null;
  playerName: string;
  teamId: string;
  goals: number;
};

type TeamMeta = {
  id: string;
  name: string;
  slug: string | null;
  teamKey: string | null;
  logoUrl: string | null;
};

type PlayerMeta = {
  id: string;
  displayName: string;
  teamId: string | null;
  photoUrl?: string;
};

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

type TeamMetricRow = {
  id: string;
  name: string;
  teamKey: string;
  photoUrl?: string;
  totals: Record<StatKey, number>;
  avgs: Record<StatKey, number>;
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

const CATEGORY_KEYS: StatKey[] = ['goals', 'disposals', 'marks', 'tackles', 'clearances'];
const LIVE_SUPPORTED_STATS = new Set<StatKey>([
  'goals',
  'disposals',
  'kicks',
  'handballs',
  'marks',
  'tackles',
  'clearances',
  'goalEfficiency',
]);
const leadersCache = new Map<string, LeadersCacheEntry>();
const LEADERS_TTL_MS = 180_000;
const seasonRecordCache = new Map<string, SeasonRecord>();
const liveMetricCache = new Map<string, { at: number; value: PlayerMetricRow[] }>();

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

function text(value: unknown): string {
  return String(value || '').trim();
}

function normalizeToken(value: string): string {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function newStatRecord(): Record<StatKey, number> {
  return {
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
  };
}

function hasMeaningfulValue(row: { totals: Record<StatKey, number>; avgs: Record<StatKey, number> }, statKey: StatKey): boolean {
  if (!LIVE_SUPPORTED_STATS.has(statKey)) return false;
  return row.totals[statKey] > 0 || row.avgs[statKey] > 0;
}

function baselinePlayerRow(player: AflPlayer): PlayerMetricRow {
  const teamName = text(player.teamName) || 'Unassigned';
  const teamKey = text(player.teamKey) || text(resolveTeamKey({ name: teamName })) || 'unknown';
  return {
    id: text(player.id),
    playerId: text(player.id),
    name: text(player.name) || 'Unknown Player',
    teamName,
    teamKey,
    teamResolved: Boolean(text(player.teamId)),
    photoUrl: text(player.headshotUrl) || undefined,
    totals: newStatRecord(),
    avgs: newStatRecord(),
  };
}

function baselineTeamRow(team: BaselineTeam): TeamMetricRow {
  const teamKey = text(team.teamKey) || text(resolveTeamKey({ slug: team.slug, name: team.name })) || 'unknown';
  return {
    id: text(team.id) || teamKey,
    name: text(team.name) || 'Unassigned',
    teamKey,
    photoUrl: team.logoUrl || undefined,
    totals: newStatRecord(),
    avgs: newStatRecord(),
  };
}

async function resolveActiveSeasonRecord(): Promise<SeasonRecord | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const seasonSlug = getDataSeasonSlugForCompetition(getStoredCompetitionKey());
  const cacheKey = text(seasonSlug).toLowerCase();
  if (!cacheKey) return null;

  const cached = seasonRecordCache.get(cacheKey);
  if (cached) return cached;

  const season = await resolveSeasonRecord(supabase, cacheKey, { preferFixtureRows: true });
  seasonRecordCache.set(cacheKey, season);
  seasonRecordCache.set(season.slug, season);
  return season;
}

async function fetchSeasonTotalsRows(seasonId: string): Promise<SeasonTotalsRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('eg_player_season_totals_ext')
    .select('season_id,player_id,team_id,player_name,matches,disposals,kicks,handballs,marks,tackles,clearances')
    .eq('season_id', seasonId)
    .limit(4000);

  if (error) return [];
  return (data || []) as SeasonTotalsRow[];
}

async function fetchGoalAggregates(seasonId: string): Promise<GoalAggregateRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const { data: fixtureRows, error: fixtureError } = await supabase
    .from('eg_fixtures')
    .select('id,home_team_id,away_team_id')
    .eq('season_id', seasonId);

  if (fixtureError || !Array.isArray(fixtureRows) || fixtureRows.length === 0) {
    return [];
  }

  const fixtureIdToTeams = new Map<string, { homeTeamId: string; awayTeamId: string }>();
  const fixtureIds = fixtureRows
    .map((row: any) => {
      const id = text(row.id);
      if (!id) return '';
      fixtureIdToTeams.set(id, {
        homeTeamId: text(row.home_team_id),
        awayTeamId: text(row.away_team_id),
      });
      return id;
    })
    .filter(Boolean);

  if (!fixtureIds.length) return [];

  const { data: submissions, error: submissionsError } = await supabase
    .from('submissions')
    .select('fixture_id,goal_kickers_home,goal_kickers_away')
    .in('fixture_id', fixtureIds);

  if (submissionsError || !Array.isArray(submissions)) {
    return [];
  }

  const totals = new Map<string, GoalAggregateRow>();
  const mergeRows = (rows: unknown, teamId: string) => {
    const list = Array.isArray(rows) ? rows : typeof rows === 'string' ? (() => {
      try {
        const parsed = JSON.parse(rows);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })() : [];

    for (const row of list as any[]) {
      const goals = safeNum(row?.goals);
      if (goals <= 0 || !teamId) continue;

      const rawPlayerId = text(row?.id || row?.player_id);
      const playerName = text(row?.name || row?.player_name) || 'Unknown Player';
      const aggregateId =
        isUuidLike(rawPlayerId) ? rawPlayerId : `goal:${teamId}:${normalizeToken(playerName) || 'unknown'}`;

      const prev = totals.get(aggregateId) || {
        id: aggregateId,
        playerId: isUuidLike(rawPlayerId) ? rawPlayerId : null,
        playerName,
        teamId,
        goals: 0,
      };

      prev.playerId = prev.playerId || (isUuidLike(rawPlayerId) ? rawPlayerId : null);
      prev.playerName = prev.playerName || playerName;
      prev.teamId = prev.teamId || teamId;
      prev.goals += goals;
      totals.set(aggregateId, prev);
    }
  };

  for (const submission of submissions as any[]) {
    const fixtureId = text(submission.fixture_id);
    const teams = fixtureIdToTeams.get(fixtureId);
    if (!teams) continue;
    mergeRows(submission.goal_kickers_home, teams.homeTeamId);
    mergeRows(submission.goal_kickers_away, teams.awayTeamId);
  }

  return Array.from(totals.values());
}

async function fetchTeamMeta(teamIds: string[]): Promise<Map<string, TeamMeta>> {
  const supabase = getSupabaseClient();
  if (!supabase) return new Map();

  const ids = Array.from(new Set(teamIds.map(text).filter(Boolean)));
  if (!ids.length) return new Map();

  const { data, error } = await supabase
    .from('eg_teams')
    .select('id,name,slug,team_key,logo_url,logo_path')
    .in('id', ids);

  if (error) return new Map();

  const map = new Map<string, TeamMeta>();
  for (const row of (data || []) as any[]) {
    const id = text(row.id);
    if (!id) continue;
    const slug = text(row.slug) || null;
    const teamKey = text(row.team_key) || null;
    const name = resolveTeamName({ name: text(row.name) || null, slug, teamKey });
    map.set(id, {
      id,
      name: name || 'Unknown',
      slug,
      teamKey,
      logoUrl: resolveTeamLogoUrl({
        logoUrl: text(row.logo_url) || text(row.logo_path) || null,
        slug,
        teamKey,
        name,
      }),
    });
  }
  return map;
}

async function fetchPlayerMeta(playerIds: string[]): Promise<Map<string, PlayerMeta>> {
  const supabase = getSupabaseClient();
  if (!supabase) return new Map();

  const ids = Array.from(new Set(playerIds.map(text).filter(Boolean)));
  if (!ids.length) return new Map();

  const attempts = [
    'id,team_id,name,display_name,full_name,photo_url,headshot_url',
    'id,team_id,name,display_name,full_name,headshot_url',
    'id,team_id,name,photo_url,headshot_url',
  ] as const;

  for (const selectCols of attempts) {
    const { data, error } = await supabase.from('eg_players').select(selectCols).in('id', ids).limit(4000);
    if (error) continue;

    const map = new Map<string, PlayerMeta>();
    for (const row of (data || []) as any[]) {
      const id = text(row.id);
      if (!id) continue;
      map.set(id, {
        id,
        displayName: resolvePlayerDisplayName({
          name: row.name,
          displayName: row.display_name,
          fullName: row.full_name,
        }),
        teamId: text(row.team_id) || null,
        photoUrl:
          resolveKnownPlayerHeadshot({
            name: resolvePlayerDisplayName({
              name: row.name,
              displayName: row.display_name,
              fullName: row.full_name,
            }),
            photoUrl: row.photo_url,
            headshotUrl: row.headshot_url,
          }) || undefined,
      });
    }
    return map;
  }

  return new Map();
}

function teamMetaToResolved(teamId: string, teamMeta: Map<string, TeamMeta>) {
  const team = teamMeta.get(teamId);
  const teamKey = text(resolveTeamKey({ slug: team?.slug, teamKey: team?.teamKey, name: team?.name })) || 'unknown';
  const teamName = team?.name || TEAM_ASSETS[teamKey as TeamKey]?.name || 'Unassigned';
  return {
    teamKey,
    teamName,
    photoUrl: team?.logoUrl || undefined,
    teamResolved: Boolean(team),
  };
}

async function fetchLivePlayerMetrics(): Promise<PlayerMetricRow[]> {
  const season = await resolveActiveSeasonRecord();
  if (!season) return [];

  const cacheKey = `${season.id}:${season.slug}`;
  const cached = liveMetricCache.get(cacheKey);
  if (cached && Date.now() - cached.at < LEADERS_TTL_MS) {
    return cached.value;
  }

  const [seasonTotalsRows, goalTotals] = await Promise.all([
    fetchSeasonTotalsRows(season.id),
    fetchGoalAggregates(season.id),
  ]);

  const teamIds = Array.from(
    new Set([
      ...seasonTotalsRows.map((row) => text(row.team_id)),
      ...goalTotals.map((row) => text(row.teamId)),
    ].filter(Boolean)),
  );
  const playerIds = Array.from(
    new Set([
      ...seasonTotalsRows.map((row) => text(row.player_id)),
      ...goalTotals.map((row) => text(row.playerId)),
    ].filter(Boolean)),
  );

  const [teamMeta, playerMeta] = await Promise.all([
    fetchTeamMeta(teamIds),
    fetchPlayerMeta(playerIds),
  ]);

  const players = new Map<string, PlayerMetricRow>();
  const ensureRow = (input: {
    id: string;
    playerId: string;
    name?: string;
    teamId?: string | null;
    matches?: number;
  }): PlayerMetricRow => {
    const teamId = text(input.teamId);
    const resolvedTeam = teamMetaToResolved(teamId, teamMeta);
    const meta = playerMeta.get(input.playerId);
    const resolvedName =
      text(input.name) ||
      meta?.displayName ||
      (isUuidLike(input.playerId) ? 'Unknown Player' : text(input.playerId).replace(/^goal:[^:]+:/, '').replace(/-/g, ' '));

    const existing = players.get(input.id);
    if (existing) {
      if (!existing.name || existing.name === 'Unknown Player') existing.name = resolvedName;
      if (!existing.teamResolved && resolvedTeam.teamResolved) {
        existing.teamKey = resolvedTeam.teamKey;
        existing.teamName = resolvedTeam.teamName;
        existing.teamResolved = true;
      }
      if (!existing.photoUrl && meta?.photoUrl) existing.photoUrl = meta.photoUrl;
      return existing;
    }

    const row: PlayerMetricRow = {
      id: input.id,
      playerId: input.playerId,
      name: resolvedName || 'Unknown Player',
      teamName: resolvedTeam.teamName,
      teamKey: resolvedTeam.teamKey,
      teamResolved: resolvedTeam.teamResolved,
      photoUrl: meta?.photoUrl,
      totals: newStatRecord(),
      avgs: newStatRecord(),
    };
    row.avgs.goals = Math.max(1, safeNum(input.matches));
    players.set(input.id, row);
    return row;
  };

  for (const row of seasonTotalsRows) {
    const playerId = text(row.player_id);
    if (!playerId) continue;

    const target = ensureRow({
      id: playerId,
      playerId,
      name: text(row.player_name),
      teamId: row.team_id,
      matches: safeNum(row.matches),
    });

    const matches = Math.max(1, safeNum(row.matches));
    target.totals.goals += safeNum(row.goals);
    target.totals.disposals += safeNum(row.disposals);
    target.totals.kicks += safeNum(row.kicks);
    target.totals.handballs += safeNum(row.handballs);
    target.totals.marks += safeNum(row.marks);
    target.totals.tackles += safeNum(row.tackles);
    target.totals.clearances += safeNum(row.clearances);
    target.avgs.goals = matches;
  }

  for (const goalRow of goalTotals) {
    const playerId = text(goalRow.playerId) || goalRow.id;
    const target = ensureRow({
      id: goalRow.id,
      playerId,
      name: goalRow.playerName,
      teamId: goalRow.teamId,
      matches: 1,
    });
    target.totals.goals += safeNum(goalRow.goals);
  }

  const rows = Array.from(players.values())
    .map((row) => {
      const matches = Math.max(
        1,
        safeNum(
          seasonTotalsRows.find((source) => text(source.player_id) === row.playerId)?.matches,
        ) || 1,
      );

      row.totals.goalEfficiency = row.totals.disposals > 0 ? (row.totals.goals / row.totals.disposals) * 100 : 0;
      row.avgs.goals = row.totals.goals / matches;
      row.avgs.disposals = row.totals.disposals / matches;
      row.avgs.kicks = row.totals.kicks / matches;
      row.avgs.handballs = row.totals.handballs / matches;
      row.avgs.marks = row.totals.marks / matches;
      row.avgs.tackles = row.totals.tackles / matches;
      row.avgs.clearances = row.totals.clearances / matches;
      row.avgs.goalEfficiency = row.totals.goalEfficiency;
      return row;
    })
    .filter((row) =>
      row.totals.goals > 0 ||
      row.totals.disposals > 0 ||
      row.totals.kicks > 0 ||
      row.totals.handballs > 0 ||
      row.totals.marks > 0 ||
      row.totals.tackles > 0 ||
      row.totals.clearances > 0,
    );

  liveMetricCache.set(cacheKey, { at: Date.now(), value: rows });
  return rows;
}

async function buildPlayers(statKey: StatKey): Promise<PlayerMetricRow[]> {
  if (!LIVE_SUPPORTED_STATS.has(statKey)) return [];

  const [baselinePlayers, liveRows] = await Promise.all([
    fetchAflPlayers().catch(() => [] as AflPlayer[]),
    fetchLivePlayerMetrics(),
  ]);

  const rowsById = new Map<string, PlayerMetricRow>();
  for (const player of baselinePlayers) {
    const row = baselinePlayerRow(player);
    if (row.id) rowsById.set(row.id, row);
  }

  for (const liveRow of liveRows) {
    const target = rowsById.get(liveRow.playerId) || rowsById.get(liveRow.id);
    if (!target) {
      rowsById.set(liveRow.id, liveRow);
      continue;
    }

    target.name = target.name || liveRow.name;
    target.teamName = target.teamName || liveRow.teamName;
    target.teamKey = target.teamKey || liveRow.teamKey;
    target.teamResolved = target.teamResolved || liveRow.teamResolved;
    target.photoUrl = target.photoUrl || liveRow.photoUrl;
    target.totals = { ...liveRow.totals };
    target.avgs = { ...liveRow.avgs };
  }

  return Array.from(rowsById.values())
    .sort((a, b) => {
      const diff = b.totals[statKey] - a.totals[statKey];
      if (Math.abs(diff) > 0.0001) return diff;
      return a.name.localeCompare(b.name);
    });
}

async function buildTeams(statKey: StatKey): Promise<TeamMetricRow[]> {
  if (!LIVE_SUPPORTED_STATS.has(statKey)) return [];

  const [baseline, players] = await Promise.all([
    fetchActiveCompetitionBaseline().catch(() => ({ teams: [] as BaselineTeam[] })),
    fetchLivePlayerMetrics(),
  ]);
  const byTeam = new Map<string, TeamMetricRow>();

  for (const team of baseline.teams || []) {
    const row = baselineTeamRow(team);
    byTeam.set(row.teamKey, row);
  }

  for (const player of players) {
    const prev = byTeam.get(player.teamKey) || {
      id: player.teamKey,
      name: player.teamName,
      teamKey: player.teamKey,
      photoUrl: player.teamKey && player.teamKey !== 'unknown'
        ? resolveTeamLogoUrl({
            teamKey: player.teamKey,
            name: player.teamName,
            fallbackPath: TEAM_ASSETS[player.teamKey as TeamKey]?.logoFile || TEAM_ASSETS[player.teamKey as TeamKey]?.logoPath,
          })
        : undefined,
      totals: newStatRecord(),
      avgs: newStatRecord(),
    };

    for (const key of Object.keys(prev.totals) as StatKey[]) {
      prev.totals[key] += player.totals[key];
      prev.avgs[key] += player.avgs[key];
    }

    byTeam.set(player.teamKey, prev);
  }

  const rows = Array.from(byTeam.values())
    .map((row) => {
      row.totals.goalEfficiency = row.totals.disposals > 0 ? (row.totals.goals / row.totals.disposals) * 100 : 0;
      row.avgs.goalEfficiency = row.avgs.disposals > 0 ? (row.avgs.goals / row.avgs.disposals) * 100 : 0;
      return row;
    })
    .sort((a, b) => {
      const diff = b.totals[statKey] - a.totals[statKey];
      if (Math.abs(diff) > 0.0001) return diff;
      return a.name.localeCompare(b.name);
    });

  return rows;
}

function toLeaderPerson(row: PlayerMetricRow | TeamMetricRow, statKey: StatKey): StatLeaderPerson {
  const isPlayer = 'playerId' in row;
  return {
    id: row.id,
    name: row.name,
    teamName: isPlayer ? row.teamName : row.name,
    teamKey: row.teamKey,
    teamResolved: isPlayer ? row.teamResolved : true,
    photoUrl: row.photoUrl,
    valueTotal: row.totals[statKey],
    valueAvg: row.avgs[statKey],
  };
}

export function clearStatLeadersCache() {
  leadersCache.clear();
  liveMetricCache.clear();
}

export function peekLeaderCategoriesCache(mode: Mode): StatLeaderCategory[] | null {
  const ns = cacheNamespace();
  return (
    leadersCacheGet<StatLeaderCategory[]>(`${ns}:categories:${mode}`) ||
    (mode === 'players' ? leadersCacheGet<StatLeaderCategory[]>(`${ns}:rail:players`) : null)
  );
}

export async function fetchLeaderCategories(mode: Mode): Promise<StatLeaderCategory[]> {
  const ns = cacheNamespace();
  const cacheKey = `${ns}:categories:${mode}`;
  const cached = leadersCacheGet<StatLeaderCategory[]>(cacheKey);
  if (cached) return cached;

  const value = await Promise.all(
    CATEGORY_KEYS.map(async (statKey) => {
      const rows = mode === 'teams' ? await buildTeams(statKey) : await buildPlayers(statKey);
      const meaningfulRows = rows.filter((row) => hasMeaningfulValue(row, statKey));
      const top = meaningfulRows[0] ? toLeaderPerson(meaningfulRows[0], statKey) : null;
      const others = meaningfulRows.slice(1, 5).map((row) => toLeaderPerson(row, statKey));
      return {
        statKey,
        label: LABELS[statKey],
        top,
        others,
      } as StatLeaderCategory;
    }),
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

  const rows = mode === 'players' ? await buildPlayers(statKey) : await buildTeams(statKey);
  const value: StatLeaders = {
    mode,
    statKey,
    label: LABELS[statKey],
    rows: rows.map<LeaderRow>((row, index) => {
      const playerId = 'playerId' in row ? String(row.playerId) : undefined;
      const sub = 'teamName' in row ? String(row.teamName) : undefined;
      return {
        rank: index + 1,
        playerId,
        name: row.name,
        sub,
        imgUrl: row.photoUrl,
        total: row.totals[statKey],
        average: row.avgs[statKey],
      };
    }),
  };

  return leadersCacheSet(cacheKey, value);
}
