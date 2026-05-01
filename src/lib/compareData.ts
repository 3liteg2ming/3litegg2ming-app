/**
 * Shared compare data loaders used by both the inline Head-to-Head section
 * on the stats page and the dedicated compare page.
 *
 * Source of truth: eg_player_season_totals_ext, eg_fixtures, submissions
 */

import { fetchAflPlayers, type AflPlayer } from '../data/aflPlayers';
import { getDataSeasonSlugForCompetition, getStoredCompetitionKey } from './competitionRegistry';
import { resolveSeasonRecord } from './seasonResolver';
import { getSupabaseClient } from './supabaseClient';
import { TEAM_ASSETS, assetUrl, getTeamAssets, type TeamKey } from './teamAssets';
import type { PlayerStatKey, TeamStatKey } from '../types/stats2';
import { TEAM_STAT_CONFIGS } from '../types/stats2';

/* ── Types ── */

export type ComparePlayerRow = {
  id: string;
  name: string;
  teamName: string;
  teamKey: string;
  teamLogo: string;
  teamColour: string;
  position: string;
  number: string;
  headshotUrl: string;
  stats: Record<PlayerStatKey, number>;
};

export type CompareTeamRow = {
  key: TeamKey;
  name: string;
  shortName: string;
  logoUrl: string;
  colour: string;
  matchesPlayed: number;
  stats: Record<TeamStatKey, number>;
};

type EgTeamMeta = {
  id: string;
  key: TeamKey;
  name: string;
  logoUrl: string;
  colour: string;
};

/* ── Helpers ── */

export function safeNum(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function isMissingColumnError(error: { message?: string } | null | undefined, columns: string[]): boolean {
  const message = String(error?.message || '').toLowerCase();
  if (!message) return false;
  return columns.some((column) => message.includes(String(column || '').toLowerCase()));
}

export function normalize(value: string): string {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');
}

export function initials(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || parts[0]?.[1] || '')).toUpperCase() || 'EG';
}

export function hexToRgba(hex: string, alpha: number): string {
  const clean = String(hex || '#000000').replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map((char) => char + char).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function matchesLabel(count: number): string {
  if (count === 1) return '1 match';
  return `${count} matches`;
}

export function canonicalTeamKey(input?: string | null): TeamKey | null {
  const direct = String(input || '').trim() as TeamKey;
  if (direct && TEAM_ASSETS[direct]) return direct;
  const normalized = normalize(String(input || ''));
  const found = (Object.keys(TEAM_ASSETS) as TeamKey[]).find((key) => {
    const asset = TEAM_ASSETS[key];
    return normalize(asset.name) === normalized || normalize(asset.shortName || '') === normalized || normalize(key) === normalized;
  });
  return found || null;
}

function newPlayerStats(): Record<PlayerStatKey, number> {
  return {
    goals: 0,
    disposals: 0,
    kicks: 0,
    handballs: 0,
    marks: 0,
    fantasyPoints: 0,
  };
}

function newTeamStats(): Record<TeamStatKey, number> {
  return {
    goals: 0,
    disposals: 0,
    kicks: 0,
    handballs: 0,
    inside50s: 0,
    rebound50s: 0,
    freesFor: 0,
    fiftyMetrePenalties: 0,
    hitOuts: 0,
    clearances: 0,
    contestedPossessions: 0,
    uncontestedPossessions: 0,
    marks: 0,
    contestedMarks: 0,
    interceptMarks: 0,
    tackles: 0,
    spoils: 0,
    goalEfficiency: 0,
  };
}

function parseJsonArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

const ALL_TEAMS: Omit<CompareTeamRow, 'matchesPlayed' | 'stats'>[] = (Object.keys(TEAM_ASSETS) as TeamKey[])
  .map((key) => ({
    key,
    name: TEAM_ASSETS[key].name,
    shortName: TEAM_ASSETS[key].shortName || TEAM_ASSETS[key].name,
    logoUrl: assetUrl(TEAM_ASSETS[key].logoPath),
    colour: TEAM_ASSETS[key].colour,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

/* ── Season / team metadata helpers ── */

async function fetchSeasonId() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const competitionKey = getStoredCompetitionKey();
  const seasonSlug = getDataSeasonSlugForCompetition(competitionKey);
  return resolveSeasonRecord(supabase, seasonSlug, { preferFixtureRows: true }).catch(() => null);
}

async function fetchTeamMeta(): Promise<Map<string, EgTeamMeta>> {
  const supabase = getSupabaseClient();
  const byId = new Map<string, EgTeamMeta>();
  if (!supabase) return byId;

  const { data } = await supabase
    .from('eg_teams')
    .select('id,name,slug,team_key,logo_url,logo_path')
    .limit(100);

  for (const row of (data || []) as any[]) {
    const id = String(row.id || '').trim();
    if (!id) continue;
    const key = canonicalTeamKey(row.team_key || row.slug || row.name);
    if (!key) continue;
    const asset = TEAM_ASSETS[key];
    byId.set(id, {
      id,
      key,
      name: asset.name,
      logoUrl: assetUrl(asset.logoPath),
      colour: asset.colour,
    });
  }
  return byId;
}

/* ── Player loader ── */

export async function loadComparePlayers(): Promise<ComparePlayerRow[]> {
  const [baselinePlayers, seasonRecord, teamMeta] = await Promise.all([
    fetchAflPlayers().catch(() => [] as AflPlayer[]),
    fetchSeasonId(),
    fetchTeamMeta(),
  ]);

  const rowsById = new Map<string, ComparePlayerRow>();
  const rowsByName = new Map<string, string>();

  for (const player of baselinePlayers) {
    if (!player?.id || !player?.name) continue;
    const teamAssets = getTeamAssets(player.teamKey || player.teamName || '');
    const row: ComparePlayerRow = {
      id: String(player.id),
      name: String(player.name),
      teamName: String(player.teamName || teamAssets.name || '').trim(),
      teamKey: String(player.teamKey || canonicalTeamKey(player.teamName) || '').trim(),
      teamLogo: teamAssets.logo,
      teamColour: teamAssets.primary || '#4c6fff',
      position: String(player.position || '').trim(),
      number: Number(player.number) > 0 ? String(Math.trunc(Number(player.number))) : '',
      headshotUrl: String(player.headshotUrl || ''),
      stats: newPlayerStats(),
    };
    rowsById.set(row.id, row);
    rowsByName.set(`${normalize(row.name)}::${normalize(row.teamKey || row.teamName)}`, row.id);
  }

  const supabase = getSupabaseClient();
  if (!supabase || !seasonRecord?.id) {
    return Array.from(rowsById.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  const { data: totalsRows } = await supabase
    .from('eg_player_season_totals_ext')
    .select('player_id,team_id,player_name,matches,disposals,kicks,handballs,marks,fantasy_points')
    .eq('season_id', seasonRecord.id)
    .limit(5000);

  for (const row of (totalsRows || []) as any[]) {
    const playerId = String(row.player_id || '').trim();
    const team = teamMeta.get(String(row.team_id || '').trim());
    const playerName = String(row.player_name || '').trim();
    const fallbackKey = `${normalize(playerName)}::${normalize(team?.key || '')}`;
    const existingId = rowsById.has(playerId) ? playerId : rowsByName.get(fallbackKey);
    const existing = (existingId && rowsById.get(existingId)) || null;
    const asset = getTeamAssets(team?.key || existing?.teamKey || playerName);

    const target: ComparePlayerRow = existing || {
      id: playerId || fallbackKey,
      name: playerName || 'Unknown Player',
      teamName: team?.name || '',
      teamKey: team?.key || '',
      teamLogo: team?.logoUrl || asset.logo,
      teamColour: team?.colour || asset.primary || '#4c6fff',
      position: '',
      number: '',
      headshotUrl: '',
      stats: newPlayerStats(),
    };

    if (team) {
      target.teamName = team.name;
      target.teamKey = team.key;
      target.teamLogo = team.logoUrl;
      target.teamColour = team.colour;
    }
    if (!target.name) target.name = playerName;
    target.stats.disposals = safeNum(row.disposals);
    target.stats.kicks = safeNum(row.kicks);
    target.stats.handballs = safeNum(row.handballs);
    target.stats.marks = safeNum(row.marks);
    target.stats.fantasyPoints = safeNum(row.fantasy_points);

    rowsById.set(target.id, target);
    rowsByName.set(`${normalize(target.name)}::${normalize(target.teamKey || target.teamName)}`, target.id);
  }

  const { data: fixtureRows } = await supabase
    .from('eg_fixtures')
    .select('id,home_team_id,away_team_id')
    .eq('season_id', seasonRecord.id)
    .limit(5000);

  const fixtureIdToTeamKey = new Map<string, { home: TeamKey | null; away: TeamKey | null }>();
  const fixtureIds: string[] = [];
  for (const row of (fixtureRows || []) as any[]) {
    const id = String(row.id || '').trim();
    if (!id) continue;
    fixtureIds.push(id);
    fixtureIdToTeamKey.set(id, {
      home: teamMeta.get(String(row.home_team_id || '').trim())?.key || null,
      away: teamMeta.get(String(row.away_team_id || '').trim())?.key || null,
    });
  }

  if (fixtureIds.length) {
    const { data: submissions } = await supabase
      .from('submissions')
      .select('fixture_id,goal_kickers_home,goal_kickers_away')
      .in('fixture_id', fixtureIds)
      .limit(5000);

    const applyGoalRows = (rows: any[], sideTeamKey: TeamKey | null) => {
      for (const entry of rows) {
        const goals = safeNum(entry?.goals);
        if (!goals) continue;
        const playerId = String(entry?.id || entry?.player_id || '').trim();
        const playerName = String(entry?.name || entry?.player_name || '').trim();
        const fallbackKey = `${normalize(playerName)}::${normalize(sideTeamKey || '')}`;
        const existingId = (playerId && rowsById.has(playerId) ? playerId : undefined) || rowsByName.get(fallbackKey);
        const existing = (existingId && rowsById.get(existingId)) || null;
        const teamAssets = getTeamAssets(sideTeamKey || '');
        const target: ComparePlayerRow = existing || {
          id: playerId || fallbackKey,
          name: playerName || 'Unknown Player',
          teamName: teamAssets.name || '',
          teamKey: sideTeamKey || '',
          teamLogo: teamAssets.logo,
          teamColour: teamAssets.primary || '#4c6fff',
          position: '',
          number: '',
          headshotUrl: '',
          stats: newPlayerStats(),
        };
        target.stats.goals += goals;
        rowsById.set(target.id, target);
        rowsByName.set(`${normalize(target.name)}::${normalize(target.teamKey || target.teamName)}`, target.id);
      }
    };

    for (const row of (submissions || []) as any[]) {
      const fixtureId = String(row.fixture_id || '').trim();
      const teams = fixtureIdToTeamKey.get(fixtureId);
      if (!teams) continue;
      applyGoalRows(parseJsonArray(row.goal_kickers_home), teams.home);
      applyGoalRows(parseJsonArray(row.goal_kickers_away), teams.away);
    }
  }

  return Array.from(rowsById.values())
    .filter((row) => row.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ── Team loader ── */

export async function loadCompareTeams(): Promise<CompareTeamRow[]> {
  const [seasonRecord, teamMeta] = await Promise.all([fetchSeasonId(), fetchTeamMeta()]);
  const rowsByKey = new Map<TeamKey, CompareTeamRow>();

  for (const team of ALL_TEAMS) {
    rowsByKey.set(team.key, {
      ...team,
      matchesPlayed: 0,
      stats: newTeamStats(),
    });
  }

  const supabase = getSupabaseClient();
  if (!supabase || !seasonRecord?.id) {
    return Array.from(rowsByKey.values());
  }

  const { data: totalsRows } = await supabase
    .from('eg_player_season_totals_ext')
    .select('team_id,disposals,kicks,handballs,marks,fantasy_points')
    .eq('season_id', seasonRecord.id)
    .limit(5000);

  for (const row of (totalsRows || []) as any[]) {
    const meta = teamMeta.get(String(row.team_id || '').trim());
    if (!meta) continue;
    const target = rowsByKey.get(meta.key);
    if (!target) continue;
    target.stats.disposals += safeNum(row.disposals);
    target.stats.kicks += safeNum(row.kicks);
    target.stats.handballs += safeNum(row.handballs);
    target.stats.marks += safeNum(row.marks);
  }

  const primarySelect: string = 'id,is_final,home_team_id,away_team_id,home_goals,away_goals,team_stats_json';
  const fallbackSelect: string = 'id,home_team_id,away_team_id,home_goals,away_goals,team_stats_json';
  const { data: fixtureRowsData, error: fixtureRowsError } = await supabase
    .from('eg_fixtures')
    .select(primarySelect)
    .eq('season_id', seasonRecord.id)
    .limit(5000);

  let fixtureRows = (fixtureRowsData || []) as any[];
  if (fixtureRowsError && isMissingColumnError(fixtureRowsError, ['is_final'])) {
    const { data: fallbackFixtureRows, error: fallbackFixtureError } = await supabase
      .from('eg_fixtures')
      .select(fallbackSelect)
      .eq('season_id', seasonRecord.id)
      .limit(5000);

    if (!fallbackFixtureError) {
      fixtureRows = (fallbackFixtureRows || []).map((row: any) => ({
        ...row,
        is_final: null,
      }));
    }
  }

  const applyTeamBucket = (target: CompareTeamRow, bucket: any) => {
    if (!bucket || typeof bucket !== 'object') return;
    target.stats.inside50s += safeNum(bucket.inside50s ?? bucket.inside_50s);
    target.stats.rebound50s += safeNum(bucket.rebound50s ?? bucket.rebound_50s);
    target.stats.freesFor += safeNum(bucket.freesFor ?? bucket.free_kicks_for ?? bucket.frees);
    target.stats.fiftyMetrePenalties += safeNum(bucket.fiftyMetrePenalties ?? bucket.fifty_metre_penalties ?? bucket['50mPenalties'] ?? bucket['50m_penalties']);
    target.stats.hitOuts += safeNum(bucket.hitOuts ?? bucket.hit_outs);
    target.stats.clearances += safeNum(bucket.clearances);
    target.stats.contestedPossessions += safeNum(bucket.contestedPossessions ?? bucket.contested_possessions);
    target.stats.uncontestedPossessions += safeNum(bucket.uncontestedPossessions ?? bucket.uncontested_possessions);
    target.stats.contestedMarks += safeNum(bucket.contestedMarks ?? bucket.contested_marks);
    target.stats.interceptMarks += safeNum(bucket.interceptMarks ?? bucket.intercept_marks);
    target.stats.tackles += safeNum(bucket.tackles);
    target.stats.spoils += safeNum(bucket.spoils);
    target.stats.marks += safeNum(bucket.marks);
  };

  for (const row of (fixtureRows || []) as any[]) {
    const homeMeta = teamMeta.get(String(row.home_team_id || '').trim());
    const awayMeta = teamMeta.get(String(row.away_team_id || '').trim());
    const home = homeMeta ? rowsByKey.get(homeMeta.key) : null;
    const away = awayMeta ? rowsByKey.get(awayMeta.key) : null;
    const statsJson = row.team_stats_json && typeof row.team_stats_json === 'object' ? row.team_stats_json : null;

    const hasLegacyResult = row.home_goals !== null || row.away_goals !== null || Boolean(statsJson);
    if (safeNum(row.is_final ? 1 : 0) || row.is_final === true || hasLegacyResult) {
      if (home) home.matchesPlayed += 1;
      if (away) away.matchesPlayed += 1;
    }

    if (home) home.stats.goals += safeNum(row.home_goals);
    if (away) away.stats.goals += safeNum(row.away_goals);

    if (statsJson && home) applyTeamBucket(home, statsJson.home || statsJson.home_team || null);
    if (statsJson && away) applyTeamBucket(away, statsJson.away || statsJson.away_team || null);
  }

  return Array.from(rowsByKey.values()).sort((a, b) => a.name.localeCompare(b.name));
}
