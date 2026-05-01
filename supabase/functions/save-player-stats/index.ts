import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  buildFallbackPlayerStatsFromGoalKickers,
  fantasyValueForRow,
  findBestRosterPlayerMatch,
  mergeExtractedPlayerStats,
  mergeIncomingOverExisting,
  normalisePlayerStatRows,
  type ExtractedPlayerStatRow,
  type RosterPlayerMatchCandidate,
} from '../_shared/playerStatsExtraction.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type FixtureRow = {
  id: string;
  home_team_id: string | null;
  away_team_id: string | null;
};

type TeamRow = {
  id: string;
  name: string | null;
  short_name: string | null;
  slug: string | null;
};

type PlayerRow = {
  id: string;
  name: string | null;
  full_name: string | null;
  display_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  team_id: string | null;
  afl_player_id: number | null;
};

type ExistingStatRow = {
  player_id: string;
  team_id: string | null;
  goals: number | null;
  behinds: number | null;
  disposals: number | null;
  kicks: number | null;
  handballs: number | null;
  marks: number | null;
  tackles: number | null;
  clearances: number | null;
  hitouts: number | null;
  fantasy_points: number | null;
};

type SubmissionRow = {
  id: string;
  goal_kickers_home: unknown;
  goal_kickers_away: unknown;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function text(value: unknown): string {
  return String(value || '').trim();
}

function candidateName(candidate: RosterPlayerMatchCandidate | PlayerRow): string {
  return text(
    (candidate as PlayerRow).display_name ||
      (candidate as PlayerRow).full_name ||
      (candidate as PlayerRow).name ||
      [
        (candidate as PlayerRow).first_name,
        (candidate as PlayerRow).last_name,
      ]
        .filter(Boolean)
        .join(' '),
  );
}

function existingRowToExtracted(existing: ExistingStatRow, player: PlayerRow | null): ExtractedPlayerStatRow {
  const fantasy = existing.fantasy_points ?? null;
  return {
    playerId: existing.player_id,
    aflPlayerId: player?.afl_player_id ?? null,
    name: candidateName(player || { name: existing.player_id }),
    team: null,
    goals: existing.goals ?? null,
    behinds: existing.behinds ?? null,
    disposals: existing.disposals ?? null,
    kicks: existing.kicks ?? null,
    handballs: existing.handballs ?? null,
    marks: existing.marks ?? null,
    tackles: existing.tackles ?? null,
    hitouts: existing.hitouts ?? null,
    afl_fantasy: fantasy,
    fantasyPoints: fantasy,
  };
}

function mergeFieldCounts(rows: ExtractedPlayerStatRow[]) {
  const counts = {
    goals: 0,
    behinds: 0,
    disposals: 0,
    kicks: 0,
    handballs: 0,
    marks: 0,
    tackles: 0,
    hitouts: 0,
    fantasy_points: 0,
  };

  for (const row of rows) {
    if (row.goals !== null && row.goals !== undefined) counts.goals += 1;
    if (row.behinds !== null && row.behinds !== undefined) counts.behinds += 1;
    if (row.disposals !== null && row.disposals !== undefined) counts.disposals += 1;
    if (row.kicks !== null && row.kicks !== undefined) counts.kicks += 1;
    if (row.handballs !== null && row.handballs !== undefined) counts.handballs += 1;
    if (row.marks !== null && row.marks !== undefined) counts.marks += 1;
    if (row.tackles !== null && row.tackles !== undefined) counts.tackles += 1;
    if (row.hitouts !== null && row.hitouts !== undefined) counts.hitouts += 1;
    if (fantasyValueForRow(row) !== null) counts.fantasy_points += 1;
  }

  return counts;
}

function matchedCandidateToRosterRow(candidate: RosterPlayerMatchCandidate, fixture: FixtureRow): {
  playerId: string;
  teamId: string;
} | null {
  const playerId = text(candidate.id || candidate.playerId);
  const teamId = text(candidate.team_id || candidate.teamId);
  if (!playerId || !teamId) return null;
  if (teamId !== text(fixture.home_team_id) && teamId !== text(fixture.away_team_id)) {
    return null;
  }
  return { playerId, teamId };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const SUPABASE_URL = text(Deno.env.get('SUPABASE_URL'));
  const SUPABASE_SERVICE_ROLE_KEY = text(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' }, 500);
  }

  let body: { fixture_id?: string; player_stats?: unknown[] } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const fixtureId = text(body.fixture_id);
  if (!fixtureId) {
    return json({ error: 'fixture_id is required' }, 400);
  }

  const incomingInput = Array.isArray(body.player_stats) ? body.player_stats : [];
  const normalizedIncoming = mergeExtractedPlayerStats([], normalisePlayerStatRows(incomingInput));

  const adminDb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: fixture, error: fixtureError } = await adminDb
    .from('eg_fixtures')
    .select('id,home_team_id,away_team_id')
    .eq('id', fixtureId)
    .maybeSingle();

  if (fixtureError) {
    return json({ error: fixtureError.message || 'Failed to load fixture' }, 500);
  }
  if (!fixture?.id || !fixture.home_team_id || !fixture.away_team_id) {
    return json({ error: 'Fixture not found or missing team assignments' }, 404);
  }

  const [{ data: teams, error: teamError }, { data: players, error: playerError }, { data: existingRows, error: existingError }, { data: submissionRows, error: submissionError }] = await Promise.all([
    adminDb
      .from('eg_teams')
      .select('id,name,short_name,slug')
      .in('id', [fixture.home_team_id, fixture.away_team_id]),
    adminDb
      .from('eg_players')
      .select('id,name,full_name,display_name,first_name,last_name,team_id,afl_player_id')
      .in('team_id', [fixture.home_team_id, fixture.away_team_id]),
    adminDb
      .from('eg_fixture_player_stats')
      .select('player_id,team_id,goals,behinds,disposals,kicks,handballs,marks,tackles,clearances,hitouts,fantasy_points')
      .eq('fixture_id', fixtureId),
    adminDb
      .from('submissions')
      .select('id,goal_kickers_home,goal_kickers_away')
      .eq('fixture_id', fixtureId)
      .order('submitted_at', { ascending: false })
      .limit(1),
  ]);

  if (teamError) {
    return json({ error: teamError.message || 'Failed to load fixture teams' }, 500);
  }
  if (playerError) {
    return json({ error: playerError.message || 'Failed to load roster players' }, 500);
  }
  if (existingError) {
    return json({ error: existingError.message || 'Failed to load existing player stats' }, 500);
  }
  if (submissionError) {
    return json({ error: submissionError.message || 'Failed to load fixture submission' }, 500);
  }

  const teamMap = new Map<string, TeamRow>(((teams || []) as TeamRow[]).map((team) => [team.id, team]));
  const playerRows = (players || []) as PlayerRow[];
  const playerMap = new Map<string, PlayerRow>(playerRows.map((player) => [player.id, player]));
  const roster: RosterPlayerMatchCandidate[] = playerRows.map((player) => ({
    id: player.id,
    playerId: player.id,
    afl_player_id: player.afl_player_id,
    name: player.name,
    full_name: player.full_name,
    display_name: player.display_name,
    first_name: player.first_name,
    last_name: player.last_name,
    team_id: player.team_id,
    side: player.team_id === fixture.home_team_id ? 'home' : player.team_id === fixture.away_team_id ? 'away' : null,
  }));

  const latestSubmission = ((submissionRows || []) as SubmissionRow[])[0] || null;
  const fallbackRows = latestSubmission
    ? buildFallbackPlayerStatsFromGoalKickers(
        latestSubmission.goal_kickers_home,
        latestSubmission.goal_kickers_away,
      )
    : [];

  const fullIncomingRows = mergeExtractedPlayerStats(normalizedIncoming, fallbackRows);
  const existingByPlayerId = new Map<string, ExistingStatRow>(((existingRows || []) as ExistingStatRow[]).map((row) => [row.player_id, row]));

  const matchedRows: ExtractedPlayerStatRow[] = [];
  const upsertRows: Array<Record<string, unknown>> = [];
  const unmatched: Array<Record<string, unknown>> = [];
  const fallbackFailed: Array<Record<string, unknown>> = [];

  let fallbackCreated = 0;

  for (const row of fullIncomingRows) {
    const match = findBestRosterPlayerMatch(row, roster);
    if (!match) {
      const issue = {
        name: row.name,
        team: row.team,
        goals: row.goals,
        disposals: row.disposals,
        fantasyPoints: fantasyValueForRow(row),
      };
      unmatched.push(issue);
      if (row.goals !== null && row.disposals === null && fantasyValueForRow(row) === null) {
        fallbackFailed.push(issue);
      }
      continue;
    }

    const rosterRow = matchedCandidateToRosterRow(match.candidate, fixture);
    if (!rosterRow) {
      unmatched.push({
        name: row.name,
        team: row.team,
        reason: 'Matched roster player did not resolve to a valid fixture team.',
      });
      continue;
    }

    const player = playerMap.get(rosterRow.playerId) || null;
    const existing = existingByPlayerId.get(rosterRow.playerId);
    const existingNormalized = existing
      ? existingRowToExtracted(existing, player)
      : {
          playerId: rosterRow.playerId,
          aflPlayerId: player?.afl_player_id ?? null,
          name: candidateName(player || match.candidate),
          team: match.candidate.side || row.team || null,
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

    const incomingResolved: ExtractedPlayerStatRow = {
      ...row,
      playerId: rosterRow.playerId,
      aflPlayerId: player?.afl_player_id ?? row.aflPlayerId ?? null,
      name: candidateName(player || match.candidate) || row.name,
      team: match.candidate.side || row.team || null,
    };

    const merged = mergeIncomingOverExisting(existingNormalized, incomingResolved);
    matchedRows.push(merged);
    if (!existing && row.goals !== null && row.disposals === null && fantasyValueForRow(row) === null) {
      fallbackCreated += 1;
    }

    upsertRows.push({
      fixture_id: fixtureId,
      player_id: rosterRow.playerId,
      team_id: rosterRow.teamId,
      goals: merged.goals,
      behinds: merged.behinds,
      disposals: merged.disposals,
      kicks: merged.kicks,
      handballs: merged.handballs,
      marks: merged.marks,
      tackles: merged.tackles,
      clearances: existing?.clearances ?? null,
      hitouts: merged.hitouts,
      fantasy_points: fantasyValueForRow(merged),
      updated_at: new Date().toISOString(),
    });
  }

  const diagnostics = {
    incomingRows: fullIncomingRows.length,
    rosterCounts: {
      home: playerRows.filter((player) => player.team_id === fixture.home_team_id).length,
      away: playerRows.filter((player) => player.team_id === fixture.away_team_id).length,
      total: playerRows.length,
    },
    matched: upsertRows.length,
    fallbackCreated,
    fallbackFailed,
    unmatched,
    upsertFailed: [] as unknown[],
    fieldCounts: mergeFieldCounts(matchedRows),
  };

  if (!upsertRows.length) {
    return json({
      success: true,
      count: 0,
      fullStatPayload: [],
      diagnostics,
    });
  }

  const { error: upsertError } = await adminDb
    .from('eg_fixture_player_stats')
    .upsert(upsertRows, { onConflict: 'fixture_id,player_id' });

  if (upsertError) {
    diagnostics.upsertFailed = upsertRows.map((row) => ({
      player_id: row.player_id,
      team_id: row.team_id,
      error: upsertError.message,
    }));
    return json({
      error: upsertError.message || 'Failed to upsert fixture player stats',
      success: false,
      count: 0,
      fullStatPayload: upsertRows,
      diagnostics,
    }, 500);
  }

  if (latestSubmission?.id) {
    await adminDb
      .from('submissions')
      .update({
        ocr_player_stats: {
          player_stats: matchedRows.map((row) => ({
            name: row.name,
            team: row.team,
            goals: row.goals,
            behinds: row.behinds,
            disposals: row.disposals,
            kicks: row.kicks,
            handballs: row.handballs,
            marks: row.marks,
            tackles: row.tackles,
            hitouts: row.hitouts,
            afl_fantasy: fantasyValueForRow(row),
            fantasyPoints: fantasyValueForRow(row),
          })),
          diagnostics,
        },
      })
      .eq('id', latestSubmission.id);
  }

  await adminDb.rpc('eg_recompute_stats').catch(() => undefined);

  return json({
    success: true,
    count: upsertRows.length,
    fullStatPayload: upsertRows,
    diagnostics,
  });
});
