import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AdminPermissionError,
  clearFixtureScores,
  fetchFixtureDetail,
  fetchLatestSuccessfulFixtureOcrDraft,
  fetchFixtureOcrData,
  fetchFixtureSubmissionData,
  listFixtures,
  listFixturePlayerStats,
  listPlayersForTeam,
  listTeams,
  lookupPlayersByAflId,
  updateFixture,
  updateFixtureScores,
  updateFixtureQuarterScores,
  upsertFixturePlayerStats,
  deleteFixturePlayerStats,
  setOcrQueueStatus,
  type AdminFixturePlayerStat,
  type WormQuarterPoint,
} from '@/lib/adminApi';
import {
  buildPlayerStatsImportPreview,
  type BulkPreviewRow,
} from '@/lib/adminPlayerStatsImport';
import { runFixturePlayerStatsOcrWorkflow } from '@/lib/adminPlayerStatsOcrWorkflow';
import WormGraph from '@/components/match-centre/broadcast/WormGraph';
import type { EgJobStatus } from '@/lib/adminTypes';
import { useAdminLayoutContext } from '../AdminLayout';
import { formatDateTime } from '../useAdminTools';
import { AdminCard, EmptyState } from './AdminUi';

type ScoreDraft = {
  homeGoals: string;
  homeBehinds: string;
  awayGoals: string;
  awayBehinds: string;
  status: string;
};

type ManualResultPreset = {
  key: string;
  label: string;
  description: string;
  draft: ScoreDraft;
};

type PlayerStatDraft = AdminFixturePlayerStat & { dirty?: boolean; _unmatched?: boolean };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type WormDraft = WormQuarterPoint;

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
const MANUAL_RESULT_PRESETS: ManualResultPreset[] = [
  {
    key: 'home-awarded',
    label: 'Award Home Win',
    description: 'Marks the home side as winner with a lightweight walkover scoreline.',
    draft: { homeGoals: '1', homeBehinds: '0', awayGoals: '0', awayBehinds: '1', status: 'FINAL' },
  },
  {
    key: 'away-awarded',
    label: 'Award Away Win',
    description: 'Marks the away side as winner with a lightweight walkover scoreline.',
    draft: { homeGoals: '0', homeBehinds: '1', awayGoals: '1', awayBehinds: '0', status: 'FINAL' },
  },
  {
    key: 'draw-awarded',
    label: 'Set Final Draw',
    description: 'Useful when the game is being recorded as a final draw without a submission.',
    draft: { homeGoals: '1', homeBehinds: '0', awayGoals: '1', awayBehinds: '0', status: 'FINAL' },
  },
];

function readExistingWormPoints(quarterScoresJson: unknown): WormDraft[] | null {
  if (!quarterScoresJson) return null;
  try {
    const obj = typeof quarterScoresJson === 'string' ? JSON.parse(quarterScoresJson) : quarterScoresJson;
    const pts = (obj as any)?.quarterProgression;
    if (!Array.isArray(pts) || !pts.length) return null;
    return QUARTERS.map((q, i) => {
      const pt = pts.find((p: any) => String(p?.q || '').toUpperCase() === q) ?? pts[i] ?? {};
      return { q, home: Math.round(Number(pt?.home ?? 0)), away: Math.round(Number(pt?.away ?? 0)) };
    });
  } catch {
    return null;
  }
}

function fallbackWormPoints(homeTotal: number | null, awayTotal: number | null): WormDraft[] {
  const h = homeTotal ?? 0;
  const a = awayTotal ?? 0;
  return [
    { q: 'Q1', home: Math.round(h * 0.20), away: Math.round(a * 0.20) },
    { q: 'Q2', home: Math.round(h * 0.45), away: Math.round(a * 0.45) },
    { q: 'Q3', home: Math.round(h * 0.75), away: Math.round(a * 0.75) },
    { q: 'Q4', home: h, away: a },
  ];
}

function toNum(v: string): number | null {
  const n = Number(v);
  return v.trim() === '' || !Number.isFinite(n) ? null : n;
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, '');
}

export default function AdminFixtureDetail() {
  const { fixtureId } = useParams<{ fixtureId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast, adminToken } = useAdminLayoutContext();

  const [activeSection, setActiveSection] = useState<'scores' | 'players' | 'ocr' | 'submissions' | 'worm'>('players');
  const [scoreDraft, setScoreDraft] = useState<ScoreDraft | null>(null);
  const [playerDrafts, setPlayerDrafts] = useState<Map<string, PlayerStatDraft>>(new Map());
  const [addPlayerTeamId, setAddPlayerTeamId] = useState('');
  const [addPlayerId, setAddPlayerId] = useState('');
  const [bulkJsonInput, setBulkJsonInput] = useState('');
  const [bulkPreview, setBulkPreview] = useState<BulkPreviewRow[] | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [ocrHelperOpen, setOcrHelperOpen] = useState(false);
  const [ocrRunStatus, setOcrRunStatus] = useState('');
  const [isDownloadingPhotos, setIsDownloadingPhotos] = useState(false);
  const [wormDraft, setWormDraft] = useState<WormDraft[] | null>(null);
  const [wormDirty, setWormDirty] = useState(false);

  const fixtureQuery = useQuery({
    queryKey: ['admin', 'fixture-detail', fixtureId],
    queryFn: () => fetchFixtureDetail(fixtureId!),
    enabled: Boolean(fixtureId),
  });

  const allFixturesQuery = useQuery({
    queryKey: ['admin', 'fixtures', 1, 'all', 'all', 'all', null, ''],
    queryFn: () => listFixtures({ page: 1, pageSize: 500 }),
    staleTime: 5 * 60_000,
  });

  const playerStatsQuery = useQuery({
    queryKey: ['admin', 'fixture-player-stats', fixtureId],
    queryFn: () => listFixturePlayerStats(fixtureId!),
    enabled: Boolean(fixtureId),
  });

  const ocrQuery = useQuery({
    queryKey: ['admin', 'fixture-ocr', fixtureId],
    queryFn: () => fetchFixtureOcrData(fixtureId!),
    enabled: Boolean(fixtureId),
  });

  const submissionsQuery = useQuery({
    queryKey: ['admin', 'fixture-submissions-detail', fixtureId],
    queryFn: () => fetchFixtureSubmissionData(fixtureId!),
    enabled: Boolean(fixtureId),
  });

  const latestOcrDraftQuery = useQuery({
    queryKey: ['admin', 'fixture-ocr-draft', fixtureId],
    queryFn: () => fetchLatestSuccessfulFixtureOcrDraft(fixtureId!),
    enabled: Boolean(fixtureId),
  });

  const teamsQuery = useQuery({
    queryKey: ['admin', 'teams', 'lookup'],
    queryFn: () => listTeams('', 250),
    staleTime: 10 * 60_000,
  });

  const addPlayerListQuery = useQuery({
    queryKey: ['admin', 'players-for-team', addPlayerTeamId],
    queryFn: () => listPlayersForTeam(addPlayerTeamId),
    enabled: Boolean(addPlayerTeamId),
    staleTime: 5 * 60_000,
  });

  // OCR helper roster queries — fetch both teams' players when helper is opened
  const homeTeamId = fixtureQuery.data?.home_team_id || '';
  const awayTeamId = fixtureQuery.data?.away_team_id || '';

  const homeRosterQuery = useQuery({
    queryKey: ['admin', 'players-for-team', homeTeamId],
    queryFn: () => listPlayersForTeam(homeTeamId),
    enabled: Boolean(homeTeamId) && ocrHelperOpen,
    staleTime: 5 * 60_000,
  });

  const awayRosterQuery = useQuery({
    queryKey: ['admin', 'players-for-team', awayTeamId],
    queryFn: () => listPlayersForTeam(awayTeamId),
    enabled: Boolean(awayTeamId) && ocrHelperOpen,
    staleTime: 5 * 60_000,
  });

  const teamById = useMemo(() => {
    const map = new Map<string, string>();
    for (const team of teamsQuery.data || []) {
      map.set(team.id, team.short_name || team.name);
    }
    return map;
  }, [teamsQuery.data]);

  const teamSlugMap = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    for (const t of teamsQuery.data || []) {
      const slug = String(t.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
      const key = String(t.team_key || t.slug || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const name = String(t.short_name || t.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const entry = { id: t.id, label: t.short_name || t.name };
      if (slug) map.set(slug, entry);
      if (key) map.set(key, entry);
      if (name) map.set(name, entry);
    }
    return map;
  }, [teamsQuery.data]);

  const teamIdToSlug = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of teamsQuery.data || []) {
      if (t.slug) map.set(t.id, t.slug);
      else if (t.team_key) map.set(t.id, t.team_key);
    }
    return map;
  }, [teamsQuery.data]);

  const fixture = fixtureQuery.data;
  const homeName = fixture?.home_team_id ? teamById.get(fixture.home_team_id) || 'Home' : 'TBD';
  const awayName = fixture?.away_team_id ? teamById.get(fixture.away_team_id) || 'Away' : 'TBD';
  const homeSlug = fixture?.home_team_id ? teamIdToSlug.get(fixture.home_team_id) || '' : '';
  const awaySlug = fixture?.away_team_id ? teamIdToSlug.get(fixture.away_team_id) || '' : '';

  // OCR helper template — full fixture context with both rosters
  const ocrTemplateJson = useMemo(() => {
    if (!fixture || !homeRosterQuery.data || !awayRosterQuery.data) return null;

    function buildPlayerStats(
      players: Array<{ id: string; name: string | null; display_name: string | null; afl_player_id: number | null }>,
      slug: string,
    ) {
      return players.map((p) => ({
        teamSlug: slug,
        playerRef: {
          playerId: p.id,
          ...(p.afl_player_id ? { aflPlayerId: p.afl_player_id } : {}),
          playerName: p.display_name || p.name || '',
        },
        kicks: null,
        handballs: null,
        disposals: null,
        marks: null,
        tackles: null,
        fantasyPoints: null,
      }));
    }

    return JSON.stringify(
      {
        fixtureId,
        homeTeamSlug: homeSlug,
        awayTeamSlug: awaySlug,
        playerStats: [
          ...buildPlayerStats(homeRosterQuery.data, homeSlug),
          ...buildPlayerStats(awayRosterQuery.data, awaySlug),
        ],
      },
      null,
      2,
    );
  }, [fixture, fixtureId, homeSlug, awaySlug, homeRosterQuery.data, awayRosterQuery.data]);

  const ocrBlankTemplate = useMemo(() => {
    return JSON.stringify(
      {
        fixtureId: 'FIXTURE_ID',
        homeTeamSlug: 'home-team-slug',
        awayTeamSlug: 'away-team-slug',
        playerStats: [
          {
            teamSlug: 'team-slug',
            playerRef: { playerId: 'UUID', aflPlayerId: 0, playerName: 'Player Name' },
            kicks: null,
            handballs: null,
            disposals: null,
            marks: null,
            tackles: null,
            fantasyPoints: null,
          },
        ],
      },
      null,
      2,
    );
  }, []);

  const initScoreDraft = useCallback(() => {
    if (!fixture) return;
    setScoreDraft({
      homeGoals: String(fixture.home_goals ?? ''),
      homeBehinds: String(fixture.home_behinds ?? ''),
      awayGoals: String(fixture.away_goals ?? ''),
      awayBehinds: String(fixture.away_behinds ?? ''),
      status: fixture.status || 'SCHEDULED',
    });
  }, [fixture]);

  const initPlayerDrafts = useCallback(() => {
    const stats = playerStatsQuery.data || [];
    const map = new Map<string, PlayerStatDraft>();
    for (const s of stats) {
      map.set(s.player_id, { ...s });
    }
    setPlayerDrafts(map);
  }, [playerStatsQuery.data]);

  // Auto-load player drafts when switching to players tab
  useEffect(() => {
    if (activeSection === 'players' && playerDrafts.size === 0 && playerStatsQuery.data?.length) {
      initPlayerDrafts();
    }
  }, [activeSection, playerDrafts.size, playerStatsQuery.data, initPlayerDrafts]);

  const scoreMutation = useMutation({
    mutationFn: async () => {
      if (!scoreDraft || !fixtureId) throw new Error('No draft');
      const token = adminToken();
      return updateFixtureScores({
        token: token || undefined,
        fixtureId,
        homeGoals: toNum(scoreDraft.homeGoals),
        homeBehinds: toNum(scoreDraft.homeBehinds),
        awayGoals: toNum(scoreDraft.awayGoals),
        awayBehinds: toNum(scoreDraft.awayBehinds),
        status: scoreDraft.status || null,
      });
    },
    onSuccess: () => {
      pushToast('Fixture result saved.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'fixture-detail', fixtureId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'fixtures'] });
    },
    onError: (error) => {
      if (error instanceof AdminPermissionError) {
        pushToast('Admin privileges required.', 'error');
      } else {
        pushToast(error instanceof Error ? error.message : 'Failed to save result', 'error');
      }
    },
  });

  const clearScoresMutation = useMutation({
    mutationFn: async () => {
      if (!fixtureId) throw new Error('No fixture');
      return clearFixtureScores(fixtureId);
    },
    onSuccess: () => {
      setScoreDraft(null);
      setWormDraft(null);
      setWormDirty(false);
      pushToast('Fixture result cleared.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'fixture-detail', fixtureId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'fixtures'] });
    },
    onError: (error) => {
      if (error instanceof AdminPermissionError) {
        pushToast('Admin privileges required.', 'error');
      } else {
        pushToast(error instanceof Error ? error.message : 'Failed to clear result', 'error');
      }
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (status: string) => {
      if (!fixtureId) throw new Error('No fixture');
      return updateFixture({ fixtureId, status });
    },
    onSuccess: () => {
      pushToast('Status updated.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'fixture-detail', fixtureId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'fixtures'] });
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update status', 'error');
    },
  });

  const lateApprovalMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!fixtureId) throw new Error('No fixture');
      return updateFixture({ fixtureId, allowLateSubmission: enabled });
    },
    onSuccess: (_, enabled) => {
      pushToast(enabled ? 'Late submit approved for this fixture.' : 'Late submit approval removed.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'fixture-detail', fixtureId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'fixtures'] });
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update late submit approval', 'error');
    },
  });

  const playerStatsMutation = useMutation({
    mutationFn: async () => {
      if (!fixtureId) throw new Error('No fixture');
      const token = adminToken();
      const dirtyRows = Array.from(playerDrafts.values()).filter((d) => d.dirty);
      if (!dirtyRows.length) throw new Error('No changes to save');
      const validRows = dirtyRows.filter((d) => UUID_RE.test(d.player_id));
      const skipped = dirtyRows.length - validRows.length;
      if (!validRows.length) throw new Error(`No valid player IDs to save (${skipped} unmatched rows skipped). Resolve unmatched players first.`);
      if (skipped > 0) {
        pushToast(`Skipping ${skipped} unmatched row(s) — only saving ${validRows.length} matched players.`, 'info');
      }
      return upsertFixturePlayerStats(
        token,
        fixtureId,
        validRows.map((d) => ({
          player_id: d.player_id,
          team_id: d.team_id,
          disposals: d.disposals,
          kicks: d.kicks,
          handballs: d.handballs,
          marks: d.marks,
          tackles: d.tackles,
          clearances: d.clearances,
          fantasy_points: d.fantasy_points,
        })),
      );
    },
    onSuccess: () => {
      pushToast('Player stats saved.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'fixture-player-stats', fixtureId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'fixtures', 'playerStatsIds'] });
    },
    onError: (error) => {
      if (error instanceof AdminPermissionError) {
        pushToast('Admin privileges required.', 'error');
      } else {
        pushToast(error instanceof Error ? error.message : 'Failed to save player stats', 'error');
      }
    },
  });

  const ocrMutation = useMutation({
    mutationFn: (args: { id: string; status: EgJobStatus; error?: string }) =>
      setOcrQueueStatus({ queueId: args.id, status: args.status, error: args.error }),
    onSuccess: () => {
      pushToast('OCR item updated.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'fixture-ocr', fixtureId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'fixture-ocr-draft', fixtureId] });
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update OCR item', 'error');
    },
  });

  const runOcrMutation = useMutation({
    mutationFn: async () => {
      setOcrRunStatus('Preparing OCR…');
      if (!fixtureId) throw new Error('No fixture');
      if (!fixture?.home_team_id || !fixture?.away_team_id) {
        throw new Error('Fixture teams are missing.');
      }
      if (!homeSlug || !awaySlug) {
        throw new Error('Fixture team slugs are missing.');
      }
      return runFixturePlayerStatsOcrWorkflow({
        fixtureId,
        homeTeamId: fixture.home_team_id,
        awayTeamId: fixture.away_team_id,
        homeTeamSlug: homeSlug,
        awayTeamSlug: awaySlug,
        homeTeamName: homeName,
        awayTeamName: awayName,
        token: adminToken(),
        autoApply: true,
        onProgress: (message) => setOcrRunStatus(message),
      });
    },
    onSuccess: async (result) => {
      setOcrRunStatus('');
      const extractedRows = Number(result.summary.playerStatRows || 0) || 0;
      const importedRows = Number(result.importedRows || 0) || 0;
      if (result.unmatchedRows > 0) {
        const rawDraft = JSON.stringify(result.draft, null, 2);
        setBulkJsonInput(rawDraft);
        await previewBulkJson(rawDraft);
      }
      pushToast(
        result.unmatchedRows > 0
          ? `OCR imported ${importedRows} row(s). ${result.unmatchedRows} still need review.`
          : `OCR imported ${importedRows} player row(s) from ${extractedRows} extracted row(s).`,
        result.unmatchedRows > 0 ? 'info' : 'success',
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'fixture-ocr', fixtureId] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'fixture-ocr-draft', fixtureId] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'fixture-player-stats', fixtureId] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'fixtures', 'playerStatsIds'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'missing-player-stats'] }),
      ]);
    },
    onError: (error) => {
      setOcrRunStatus('');
      pushToast(error instanceof Error ? error.message : 'Failed to run OCR for this fixture', 'error');
    },
  });

  const deleteStatsMutation = useMutation({
    mutationFn: async () => {
      if (!fixtureId) throw new Error('No fixture');
      const token = adminToken();
      return deleteFixturePlayerStats(token, fixtureId);
    },
    onSuccess: (deleted) => {
      pushToast(`Deleted ${deleted} player stat row(s).`, 'success');
      setPlayerDrafts(new Map());
      queryClient.invalidateQueries({ queryKey: ['admin', 'fixture-player-stats', fixtureId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'fixtures', 'playerStatsIds'] });
    },
    onError: (error) => {
      if (error instanceof AdminPermissionError) {
        pushToast('Admin privileges required.', 'error');
      } else {
        pushToast(error instanceof Error ? error.message : 'Failed to delete player stats', 'error');
      }
    },
  });

  const wormMutation = useMutation({
    mutationFn: async () => {
      if (!fixtureId || !wormDraft) throw new Error('No worm data');
      await updateFixtureQuarterScores(fixtureId, wormDraft);
    },
    onSuccess: () => {
      pushToast('Worm data saved.', 'success');
      setWormDirty(false);
      queryClient.invalidateQueries({ queryKey: ['admin', 'fixture-detail', fixtureId] });
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to save worm data', 'error');
    },
  });

  function initWormDraft(fix: typeof fixture) {
    if (!fix) return;
    const existing = readExistingWormPoints(fix.quarter_scores_json);
    setWormDraft(existing ?? fallbackWormPoints(fix.home_total, fix.away_total));
    setWormDirty(false);
  }

  function updateWormDraft(qi: number, side: 'home' | 'away', value: string) {
    setWormDraft((prev) => {
      if (!prev) return prev;
      const next = prev.map((p, i) => i === qi ? { ...p, [side]: Math.max(0, Number(value) || 0) } : p);
      return next;
    });
    setWormDirty(true);
  }

  function applyScorePreset(preset: ManualResultPreset) {
    setScoreDraft({ ...preset.draft });
    setWormDraft(null);
    setWormDirty(false);
    pushToast(`${preset.label} loaded. Review the scoreline, then save the result.`, 'info');
  }

  function updatePlayerDraft(playerId: string, field: keyof AdminFixturePlayerStat, value: string) {
    setPlayerDrafts((prev) => {
      const next = new Map(prev);
      const existing = next.get(playerId);
      if (!existing) return prev;
      next.set(playerId, { ...existing, [field]: toNum(value), dirty: true });
      return next;
    });
  }

  function addPlayerRow() {
    if (!addPlayerId || !addPlayerTeamId || !fixtureId) return;
    const player = addPlayerListQuery.data?.find((p) => p.id === addPlayerId);
    setPlayerDrafts((prev) => {
      const next = new Map(prev);
      next.set(addPlayerId, {
        fixture_id: fixtureId,
        player_id: addPlayerId,
        team_id: addPlayerTeamId,
        player_name: player?.display_name || player?.name || addPlayerId,
        disposals: null,
        kicks: null,
        handballs: null,
        marks: null,
        tackles: null,
        clearances: null,
        fantasy_points: null,
        dirty: true,
      });
      return next;
    });
    setAddPlayerId('');
  }

  // ─── BULK JSON PREVIEW — supports playerRef contract ───────────────────────
  async function previewBulkJson(rawInput = bulkJsonInput) {
    setBulkError(null);
    setBulkPreview(null);
    if (!rawInput.trim()) {
      setBulkError('Paste JSON first.');
      return;
    }

    setIsPreviewLoading(true);
    try {
      const result = await buildPlayerStatsImportPreview({
        rawInput,
        fixtureId: fixtureId!,
        fixtureTeamIds: [fixture?.home_team_id, fixture?.away_team_id],
        teamSlugMap,
        loadPlayersForTeam: listPlayersForTeam,
        lookupPlayersByAflId,
      });

      setBulkPreview(result.preview);
      for (const warning of result.warnings) {
        pushToast(warning, 'info');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid JSON. Check format and try again.';
      setBulkError(message);
    } finally {
      setIsPreviewLoading(false);
    }
  }

  async function loadLatestOcrDraft() {
    if (!fixtureId) return;

    const latestDraft = latestOcrDraftQuery.data || (await latestOcrDraftQuery.refetch()).data;
    if (!latestDraft?.draft) {
      pushToast('No successful OCR draft is available for this fixture yet.', 'info');
      return;
    }

    const rawDraft = JSON.stringify(latestDraft.draft, null, 2);
    setBulkJsonInput(rawDraft);
    await previewBulkJson(rawDraft);
  }

  function updatePreviewManualPlayer(index: number, playerId: string) {
    if (!bulkPreview) return;
    setBulkPreview((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const row = { ...next[index] };
      row.manualPlayerId = playerId;
      if (playerId) {
        const player = row.availablePlayers?.find((p) => p.id === playerId);
        row.matched = true;
        row.matchConfidence = 'exact';
        row.matchReason = `Manually selected: ${player?.label || playerId}`;
        row.playerId = playerId;
      } else {
        row.matched = false;
        row.matchConfidence = 'none';
        row.matchReason = `No player "${row.playerName}" found on ${row.teamLabel}`;
        row.playerId = null;
      }
      next[index] = row;
      return next;
    });
  }

  async function applyBulkImport() {
    if (!bulkPreview || !fixtureId) return;
    setIsApplying(true);

    try {
      const matched = bulkPreview.filter((r) => r.matched && r.teamId && r.playerId);
      const unmatched = bulkPreview.filter((r) => !r.matched || !r.playerId);

      if (!matched.length) {
        pushToast('No matched rows to import. Resolve unmatched players first.', 'error');
        return;
      }

      setPlayerDrafts((prev) => {
        const next = new Map(prev);
        for (const row of matched) {
          next.set(row.playerId!, {
            fixture_id: fixtureId,
            player_id: row.playerId!,
            team_id: row.teamId!,
            player_name: row.playerName,
            disposals: row.disposals ?? null,
            kicks: row.kicks ?? null,
            handballs: row.handballs ?? null,
            marks: row.marks ?? null,
            tackles: row.tackles ?? null,
            clearances: null,
            fantasy_points: row.fantasyPoints ?? null,
            dirty: true,
          });
        }

        // Add unmatched rows with temp IDs for visibility
        for (const row of unmatched) {
          if (!row.teamId) continue;
          const tempId = `_unmatched:${row.teamId}:${normalizeForMatch(row.playerName)}:${Date.now()}:${Math.random()}`;
          next.set(tempId, {
            fixture_id: fixtureId,
            player_id: tempId,
            team_id: row.teamId,
            player_name: row.playerName,
            disposals: row.disposals ?? null,
            kicks: row.kicks ?? null,
            handballs: row.handballs ?? null,
            marks: row.marks ?? null,
            tackles: row.tackles ?? null,
            clearances: null,
            fantasy_points: row.fantasyPoints ?? null,
            dirty: true,
            _unmatched: true,
          });
        }

        return next;
      });

      const msg = unmatched.length > 0
        ? `Imported ${matched.length} matched players. ${unmatched.length} unmatched (shown in red, won't save until resolved).`
        : `Imported ${matched.length} player stat rows successfully.`;
      pushToast(msg, unmatched.length > 0 ? 'info' : 'success');
      setBulkPreview(null);
      setBulkJsonInput('');
    } finally {
      setIsApplying(false);
    }
  }

  // Resolve an unmatched player row to a real player
  function resolveUnmatchedPlayer(tempPlayerId: string, realPlayerId: string, realPlayerName: string) {
    if (!fixtureId) return;
    setPlayerDrafts((prev) => {
      const next = new Map(prev);
      const old = next.get(tempPlayerId);
      if (!old) return prev;
      next.delete(tempPlayerId);
      next.set(realPlayerId, {
        ...old,
        player_id: realPlayerId,
        player_name: realPlayerName,
        _unmatched: false,
        dirty: true,
      });
      return next;
    });
    pushToast(`Resolved: ${realPlayerName}`, 'success');
  }

  // Extract all unique screenshot URLs from submissions
  function getSubmissionPhotoUrls(): string[] {
    const subs = submissionsQuery.data || [];
    const allUrls: string[] = [];
    for (const sub of subs) {
      let rawUrls = sub.screenshot_urls;
      if (typeof rawUrls === 'string') { try { rawUrls = JSON.parse(rawUrls); } catch { rawUrls = []; } }
      const urls = Array.isArray(rawUrls) ? rawUrls : [];
      let rawScreenshots = sub.screenshots;
      if (typeof rawScreenshots === 'string') { try { rawScreenshots = JSON.parse(rawScreenshots); } catch { rawScreenshots = []; } }
      const screenshots = Array.isArray(rawScreenshots) ? rawScreenshots : [];
      for (const u of urls) { if (typeof u === 'string' && u) allUrls.push(u); }
      for (const s of screenshots) {
        const url = (s as Record<string, unknown>)?.publicUrl || (s as Record<string, unknown>)?.url;
        if (typeof url === 'string' && url) allUrls.push(url);
      }
    }
    return [...new Set(allUrls)];
  }

  async function downloadAllPhotos() {
    const urls = getSubmissionPhotoUrls();
    if (!urls.length) { pushToast('No photos to download.', 'info'); return; }
    setIsDownloadingPhotos(true);
    let downloaded = 0;
    try {
      for (let i = 0; i < urls.length; i++) {
        try {
          const res = await fetch(urls[i]);
          if (!res.ok) continue;
          const blob = await res.blob();
          const ext = urls[i].match(/\.(png|jpg|jpeg|webp|gif)(\?|$)/i)?.[1] || 'jpg';
          const filename = `fixture-${(fixtureId || 'unknown').slice(0, 8)}-photo-${i + 1}.${ext}`;
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(a.href);
          downloaded++;
        } catch { /* skip failed downloads */ }
      }
      pushToast(`Downloaded ${downloaded} of ${urls.length} photo(s).`, downloaded === urls.length ? 'success' : 'info');
    } finally {
      setIsDownloadingPhotos(false);
    }
  }

  // Compute prev/next siblings in the same round
  const siblings = useMemo(() => {
    if (!fixture) return { prev: null, next: null, position: 0, total: 0 };
    const all = allFixturesQuery.data?.rows || [];
    const sameRound = all
      .filter((f) => f.round === fixture.round && f.season_id === fixture.season_id)
      .sort((a, b) => {
        const aTime = a.start_time ? new Date(a.start_time).getTime() : 0;
        const bTime = b.start_time ? new Date(b.start_time).getTime() : 0;
        return aTime - bTime || a.id.localeCompare(b.id);
      });
    const idx = sameRound.findIndex((f) => f.id === fixtureId);
    return {
      prev: idx > 0 ? sameRound[idx - 1] : null,
      next: idx >= 0 && idx < sameRound.length - 1 ? sameRound[idx + 1] : null,
      position: idx + 1,
      total: sameRound.length,
    };
  }, [allFixturesQuery.data, fixture, fixtureId]);

  const sortedPlayerDrafts = useMemo(() => {
    const homeTeamId = fixture?.home_team_id;
    return Array.from(playerDrafts.values()).sort((a, b) => {
      if (a.team_id !== b.team_id) {
        if (a.team_id === homeTeamId) return -1;
        if (b.team_id === homeTeamId) return 1;
      }
      return (a.player_name || '').localeCompare(b.player_name || '');
    });
  }, [playerDrafts, fixture?.home_team_id]);

  const unmatchedDrafts = useMemo(
    () => sortedPlayerDrafts.filter((d) => d._unmatched || d.player_id.startsWith('_unmatched:')),
    [sortedPlayerDrafts],
  );

  const matchedDrafts = useMemo(
    () => sortedPlayerDrafts.filter((d) => !d._unmatched && !d.player_id.startsWith('_unmatched:')),
    [sortedPlayerDrafts],
  );

  const dirtyPlayerCount = useMemo(
    () => Array.from(playerDrafts.values()).filter((d) => d.dirty && UUID_RE.test(d.player_id)).length,
    [playerDrafts],
  );

  const submissionScreenshotMeta = useMemo(() => {
    const rows: Array<Record<string, unknown>> = [];
    for (const submission of submissionsQuery.data || []) {
      let rawScreenshots = submission.screenshots;
      if (typeof rawScreenshots === 'string') {
        try {
          rawScreenshots = JSON.parse(rawScreenshots);
        } catch {
          rawScreenshots = [];
        }
      }
      if (Array.isArray(rawScreenshots)) {
        rows.push(...(rawScreenshots as Array<Record<string, unknown>>));
      }
    }
    return rows;
  }, [submissionsQuery.data]);

  const playerStatScreenshotCount = useMemo(
    () =>
      submissionScreenshotMeta.filter((row) => {
        const imageType = String(row.imageType || row.image_type || '').trim().toLowerCase();
        return imageType === 'player_stat';
      }).length,
    [submissionScreenshotMeta],
  );

  const latestOcrItem = useMemo(() => (ocrQuery.data || [])[0] || null, [ocrQuery.data]);
  const latestOcrSummary = latestOcrDraftQuery.data?.summary || {};
  const latestOcrDraft = latestOcrDraftQuery.data?.draft || null;
  const latestOcrWarnings = useMemo(() => {
    if (Array.isArray(latestOcrDraftQuery.data?.warnings)) return latestOcrDraftQuery.data.warnings;
    if (Array.isArray(latestOcrDraft?.warnings)) return latestOcrDraft.warnings;
    return [];
  }, [latestOcrDraftQuery.data?.warnings, latestOcrDraft?.warnings]);
  const latestOcrExtractedRows =
    Number(latestOcrSummary.playerStatRows || latestOcrDraft?.playerStats.length || 0) || 0;
  const latestOcrWarningCount = latestOcrWarnings.length;

  if (!fixtureId) {
    return <EmptyState title="No fixture" description="Fixture ID is missing from the URL." />;
  }

  if (fixtureQuery.isLoading) {
    return <p className="eg-admin-muted">Loading fixture...</p>;
  }

  if (fixtureQuery.error) {
    return (
      <AdminCard title="Error" subtitle="Failed to load fixture">
        <p className="eg-admin-error">
          {fixtureQuery.error instanceof Error ? fixtureQuery.error.message : 'Unknown error'}
        </p>
        <Link to="/admin/fixtures">Back to Fixtures</Link>
      </AdminCard>
    );
  }

  if (!fixture) {
    return (
      <AdminCard title="Not found" subtitle="Fixture does not exist">
        <Link to="/admin/fixtures">Back to Fixtures</Link>
      </AdminCard>
    );
  }

  const homeTotal = toNum(scoreDraft?.homeGoals ?? '') != null && toNum(scoreDraft?.homeBehinds ?? '') != null
    ? (toNum(scoreDraft!.homeGoals)! * 6 + toNum(scoreDraft!.homeBehinds)!)
    : fixture.home_total;
  const awayTotal = toNum(scoreDraft?.awayGoals ?? '') != null && toNum(scoreDraft?.awayBehinds ?? '') != null
    ? (toNum(scoreDraft!.awayGoals)! * 6 + toNum(scoreDraft!.awayBehinds)!)
    : fixture.away_total;

  function goToFixture(id: string) {
    setScoreDraft(null);
    setPlayerDrafts(new Map());
    setAddPlayerTeamId('');
    setAddPlayerId('');
    setBulkJsonInput('');
    setBulkPreview(null);
    setBulkError(null);
    setWormDraft(null);
    setWormDirty(false);
    navigate(`/admin/fixtures/${id}`);
  }

  const statusBadge = (() => {
    const s = fixture.status;
    if (s === 'FINAL') return { bg: 'rgba(52,211,153,0.18)', color: '#6ee7b7', label: 'FINAL' };
    if (s === 'LIVE') return { bg: 'rgba(251,191,36,0.18)', color: '#fcd34d', label: 'LIVE' };
    if (s === 'PENDING_RESULTS') return { bg: 'rgba(251,146,60,0.18)', color: '#fdba74', label: 'PENDING' };
    return { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8', label: s || 'SCHED' };
  })();

  const sections = [
    { key: 'players' as const, label: `Player Stats`, count: playerStatsQuery.data?.length ?? 0 },
    { key: 'scores' as const, label: 'Scores', count: null },
    { key: 'worm' as const, label: 'Worm', count: null },
    { key: 'submissions' as const, label: `Submissions`, count: submissionsQuery.data?.length ?? 0 },
    { key: 'ocr' as const, label: `OCR`, count: ocrQuery.data?.length ?? 0 },
  ];

  return (
    <div className="eg-admin-stack">
      {/* ─── FIXTURE HEADER ─────────────────────────── */}
      <div className="eg-fd-header">
        <Link to="/admin/fixtures" className="eg-fd-back">
          Back to Fixtures
        </Link>
        <div className="eg-fd-identity">
          <div className="eg-fd-matchup">
            <span className="eg-fd-team">{homeName}</span>
            <span className="eg-fd-vs">vs</span>
            <span className="eg-fd-team">{awayName}</span>
          </div>
          <div className="eg-fd-meta">
            <span
              className="eg-admin-status-chip"
              style={{ background: statusBadge.bg, color: statusBadge.color }}
            >
              {statusBadge.label}
            </span>
            <span>Round {fixture.round ?? '?'}</span>
            <span>{fixture.venue || 'No venue'}</span>
            <span>{formatDateTime(fixture.start_time)}</span>
          </div>
          {(fixture.home_total != null || fixture.away_total != null) ? (
            <div className="eg-fd-score-display">
              <span>{fixture.home_total ?? '?'}</span>
              <span className="eg-fd-score-sep">-</span>
              <span>{fixture.away_total ?? '?'}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="eg-admin-highlight-block" style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <strong style={{ display: 'block', marginBottom: 4 }}>Late Submit Approval</strong>
            <p className="eg-admin-muted" style={{ margin: 0 }}>
              After Sunday 26 April at 11:59 PM, this fixture stays locked unless admin approval is turned on.
            </p>
          </div>
          <div className="eg-admin-inline-buttons">
            <span
              className="eg-admin-status-chip"
              style={{
                background: fixture.allow_late_submission ? 'rgba(245, 196, 0, 0.16)' : 'rgba(148, 163, 184, 0.12)',
                color: fixture.allow_late_submission ? '#fde68a' : '#94a3b8',
              }}
            >
              {fixture.allow_late_submission ? 'Approved' : 'Locked'}
            </span>
            <button
              type="button"
              onClick={() => lateApprovalMutation.mutate(!fixture.allow_late_submission)}
              disabled={lateApprovalMutation.isPending}
            >
              {lateApprovalMutation.isPending
                ? 'Saving...'
                : fixture.allow_late_submission
                  ? 'Remove Approval'
                  : 'Approve Late Submit'}
            </button>
          </div>
        </div>
        {fixture.late_submission_approved_at ? (
          <p className="eg-admin-muted" style={{ margin: 0 }}>
            Approved {formatDateTime(fixture.late_submission_approved_at)}
          </p>
        ) : null}
      </div>

      {/* ─── PREV/NEXT NAV ──────────────────────────── */}
      {siblings.total > 1 ? (
        <div className="eg-admin-sibling-nav">
          <button
            type="button"
            disabled={!siblings.prev}
            onClick={() => siblings.prev && goToFixture(siblings.prev.id)}
            className="eg-fd-nav-btn"
          >
            {siblings.prev ? `${teamById.get(siblings.prev.home_team_id || '') || '?'} v ${teamById.get(siblings.prev.away_team_id || '') || '?'}` : 'Prev'}
          </button>
          <span style={{ color: 'var(--admin-muted)', fontSize: '0.78rem' }}>
            {siblings.position}/{siblings.total}
          </span>
          <button
            type="button"
            disabled={!siblings.next}
            onClick={() => siblings.next && goToFixture(siblings.next.id)}
            className="eg-fd-nav-btn"
          >
            {siblings.next ? `${teamById.get(siblings.next.home_team_id || '') || '?'} v ${teamById.get(siblings.next.away_team_id || '') || '?'}` : 'Next'}
          </button>
        </div>
      ) : null}

      {/* ─── SECTION TABS ───────────────────────────── */}
      <div className="eg-fd-tabs">
        {sections.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`eg-fd-tab${activeSection === s.key ? ' is-active' : ''}`}
            onClick={() => {
              setActiveSection(s.key);
              if (s.key === 'scores' && !scoreDraft) initScoreDraft();
              if (s.key === 'worm' && !wormDraft) initWormDraft(fixture);
            }}
          >
            <span className="eg-fd-tab-label">{s.label}</span>
            {s.count != null ? (
              <span className="eg-fd-tab-count">{s.count}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ═══════ PLAYER STATS SECTION ═══════ */}
      {activeSection === 'players' ? (
        <>
          {/* ─── OCR HELPER TEMPLATE ─────────────────── */}
          <div className="eg-fd-ocr-helper">
            <button
              type="button"
              className="eg-fd-ocr-helper-toggle"
              onClick={() => setOcrHelperOpen((p) => !p)}
            >
              <span className="eg-fd-ocr-helper-toggle-icon">{ocrHelperOpen ? '\u25BC' : '\u25B6'}</span>
              <span>OCR Helper Template</span>
              {ocrHelperOpen && ocrTemplateJson ? (
                <span className="eg-fd-ocr-helper-badge">
                  {(homeRosterQuery.data?.length ?? 0) + (awayRosterQuery.data?.length ?? 0)} players
                </span>
              ) : null}
            </button>

            {ocrHelperOpen ? (
              <div className="eg-fd-ocr-helper-body">
                <div className="eg-fd-ocr-helper-steps">
                  <p><strong>1.</strong> Copy the roster template below</p>
                  <p><strong>2.</strong> Paste into ChatGPT with your screenshots</p>
                  <p><strong>3.</strong> ChatGPT fills in the stat values only</p>
                  <p><strong>4.</strong> Paste the completed JSON into the import box below</p>
                  <p className="eg-fd-ocr-helper-warn">Player IDs and team slugs must not be changed by ChatGPT.</p>
                </div>

                <div className="eg-fd-ocr-helper-actions">
                  <button
                    type="button"
                    className="eg-fd-btn eg-fd-btn-primary"
                    disabled={!ocrTemplateJson}
                    onClick={() => {
                      if (!ocrTemplateJson) return;
                      navigator.clipboard.writeText(ocrTemplateJson).then(
                        () => pushToast('Roster template copied to clipboard.', 'success'),
                        () => pushToast('Failed to copy. Try selecting the text manually.', 'error'),
                      );
                    }}
                  >
                    Copy Roster Template
                  </button>
                  <button
                    type="button"
                    className="eg-fd-btn"
                    onClick={() => {
                      navigator.clipboard.writeText(ocrBlankTemplate).then(
                        () => pushToast('Blank template copied to clipboard.', 'success'),
                        () => pushToast('Failed to copy.', 'error'),
                      );
                    }}
                  >
                    Copy Blank Template
                  </button>
                  {ocrTemplateJson ? (
                    <button
                      type="button"
                      className="eg-fd-btn"
                      onClick={() => {
                        setBulkJsonInput(ocrTemplateJson);
                        setBulkPreview(null);
                        setBulkError(null);
                        pushToast('Template loaded into import box.', 'info');
                      }}
                    >
                      Load into Import
                    </button>
                  ) : null}
                </div>

                {(homeRosterQuery.isLoading || awayRosterQuery.isLoading) ? (
                  <p className="eg-admin-muted" style={{ fontSize: '0.8rem', padding: '8px 0' }}>Loading rosters...</p>
                ) : null}

                {ocrTemplateJson ? (
                  <details className="eg-fd-ocr-helper-preview">
                    <summary>Preview template ({homeName} + {awayName})</summary>
                    <pre className="eg-fd-ocr-helper-json">{ocrTemplateJson}</pre>
                  </details>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* ─── IMPORT JSON BLOCK (PROMINENT) ────────── */}
          <div className="eg-fd-import-block">
            <div className="eg-fd-import-header">
              <div>
                <h4 className="eg-fd-import-title">Import Player Stats</h4>
                <p className="eg-fd-import-desc">
                  Paste JSON with <code>playerStats</code> array, or run the one-click OCR save. Each row uses <code>teamSlug</code>, <code>playerRef</code> (playerId, aflPlayerId, playerName), and stats.
                  Matching priority stays playerId &rarr; aflPlayerId &rarr; playerName.
                </p>
              </div>
              <div className="eg-admin-inline-buttons">
                <button
                  type="button"
                  className="eg-fd-btn eg-fd-btn-primary"
                  onClick={() => runOcrMutation.mutate()}
                  disabled={runOcrMutation.isPending || playerStatScreenshotCount === 0}
                  title={
                    playerStatScreenshotCount === 0
                      ? 'No uploaded player-stat screenshots found on this submitted result.'
                      : undefined
                  }
                >
                  {runOcrMutation.isPending ? 'Running OCR + Saving...' : 'Auto OCR + Save Stats'}
                </button>
                <button
                  type="button"
                  className="eg-fd-btn"
                  onClick={() => void loadLatestOcrDraft()}
                  disabled={latestOcrDraftQuery.isFetching || !latestOcrDraft}
                >
                  {latestOcrDraftQuery.isFetching ? 'Loading Draft...' : 'Load Latest OCR Draft'}
                </button>
              </div>
            </div>

            <div className="eg-fd-ocr-status-strip">
              <div className="eg-fd-ocr-status-chip">
                <span className="eg-fd-ocr-status-label">Latest OCR</span>
                <strong>{latestOcrItem?.status || (latestOcrDraft ? 'succeeded' : 'idle')}</strong>
              </div>
              <div className="eg-fd-ocr-status-meta">
                <span>{playerStatScreenshotCount} player-stat screenshot(s)</span>
                <span>{latestOcrExtractedRows} extracted row(s)</span>
                <span>{latestOcrWarningCount} warning(s)</span>
                <span>
                  {latestOcrItem?.updated_at
                    ? `Updated ${formatDateTime(latestOcrItem.updated_at)}`
                    : 'No OCR run yet'}
                </span>
              </div>
            </div>

            {playerStatScreenshotCount === 0 ? (
              <div className="eg-admin-highlight-block eg-fd-ocr-note">
                <p className="eg-admin-muted" style={{ margin: 0 }}>
                  This fixture submission does not currently expose any uploaded <code>player_stat</code> screenshots, so OCR cannot run yet.
                </p>
              </div>
            ) : null}

            {ocrRunStatus ? (
              <div className="eg-admin-highlight-block eg-fd-ocr-note">
                <p className="eg-admin-muted" style={{ margin: 0 }}>
                  {ocrRunStatus}
                </p>
              </div>
            ) : null}

            {latestOcrItem?.error ? (
              <div className="eg-admin-highlight-block eg-fd-ocr-note eg-fd-ocr-note--error">
                <p className="eg-admin-error" style={{ margin: 0 }}>
                  Latest OCR error: {latestOcrItem.error}
                </p>
              </div>
            ) : null}

            {latestOcrWarningCount > 0 ? (
              <div className="eg-admin-highlight-block eg-fd-ocr-note">
                <p style={{ margin: '0 0 6px', fontSize: '0.8rem', fontWeight: 700, color: '#fef08a' }}>
                  Latest OCR warnings
                </p>
                <div className="eg-fd-ocr-warning-list">
                  {latestOcrWarnings.map((warning, index) => (
                    <span key={`${warning}-${index}`}>{warning}</span>
                  ))}
                </div>
              </div>
            ) : null}

            <textarea
              className="eg-fd-json-input"
              value={bulkJsonInput}
              onChange={(e) => { setBulkJsonInput(e.target.value); setBulkPreview(null); setBulkError(null); }}
              placeholder={'{\n  "fixtureId": "CURRENT_FIXTURE_ID",\n  "playerStats": [\n    {\n      "teamSlug": "sydney-swans",\n      "playerRef": { "playerId": "uuid...", "aflPlayerId": 12345, "playerName": "Isaac Heeney" },\n      "kicks": 14, "handballs": 10, "disposals": 24, "marks": 6, "fantasyPoints": 126,\n      "tackles": null\n    }\n  ],\n  "warnings": []\n}'}
              rows={5}
            />

            {bulkError ? (
              <p className="eg-admin-error" style={{ marginTop: 6, fontSize: '0.82rem' }}>{bulkError}</p>
            ) : null}

            <div className="eg-fd-import-actions">
              <button
                type="button"
                className="eg-fd-btn eg-fd-btn-primary"
                onClick={() => void previewBulkJson()}
                disabled={!bulkJsonInput.trim() || isPreviewLoading}
              >
                {isPreviewLoading ? 'Matching Players...' : 'Preview & Match'}
              </button>
              {bulkPreview ? (
                <button
                  type="button"
                  className="eg-fd-btn"
                  onClick={() => { setBulkPreview(null); setBulkJsonInput(''); setBulkError(null); }}
                >
                  Clear
                </button>
              ) : null}
            </div>

            {/* ─── PREVIEW RESULTS ──────────────────────── */}
            {bulkPreview ? (
              <div className="eg-fd-preview">
                <div className="eg-fd-preview-summary">
                  <div className="eg-fd-preview-stat eg-fd-preview-stat--good">
                    <span className="eg-fd-preview-stat-num">{bulkPreview.filter((r) => r.matched && r.matchConfidence === 'exact').length}</span>
                    <span>exact</span>
                  </div>
                  <div className="eg-fd-preview-stat eg-fd-preview-stat--warn">
                    <span className="eg-fd-preview-stat-num">{bulkPreview.filter((r) => r.matched && r.matchConfidence === 'partial').length}</span>
                    <span>partial</span>
                  </div>
                  <div className="eg-fd-preview-stat eg-fd-preview-stat--bad">
                    <span className="eg-fd-preview-stat-num">{bulkPreview.filter((r) => !r.matched).length}</span>
                    <span>failed</span>
                  </div>
                  <div className="eg-fd-preview-stat">
                    <span className="eg-fd-preview-stat-num">{bulkPreview.length}</span>
                    <span>total</span>
                  </div>
                </div>

                {/* Import button at TOP of preview so it's always visible on mobile */}
                {bulkPreview.some((r) => r.matched) ? (
                  <button
                    type="button"
                    className="eg-fd-btn eg-fd-btn-save"
                    onClick={() => void applyBulkImport()}
                    disabled={isApplying}
                    style={{ width: '100%' }}
                  >
                    {isApplying
                      ? 'Importing...'
                      : `Import ${bulkPreview.filter((r) => r.matched).length} Matched Players`}
                  </button>
                ) : null}

                <div className="eg-fd-preview-rows">
                  {bulkPreview.map((row, i) => (
                    <div
                      key={`${row.playerName}-${i}`}
                      className={`eg-fd-preview-row ${row.matched ? (row.matchConfidence === 'partial' ? 'eg-fd-preview-row--partial' : 'eg-fd-preview-row--matched') : 'eg-fd-preview-row--unmatched'}`}
                    >
                      <div className="eg-fd-preview-row-main">
                        <div className="eg-fd-preview-player">
                          <strong>{row.playerName}</strong>
                          <span className="eg-fd-preview-team">{row.teamLabel}</span>
                        </div>
                        <div className="eg-fd-preview-stats-mini">
                          <span title="Disposals">D:{row.disposals ?? '-'}</span>
                          <span title="Kicks">K:{row.kicks ?? '-'}</span>
                          <span title="Handballs">H:{row.handballs ?? '-'}</span>
                          <span title="Marks">M:{row.marks ?? '-'}</span>
                          <span title="Fantasy Points">FP:{row.fantasyPoints ?? '-'}</span>
                        </div>
                      </div>
                      <div className="eg-fd-preview-match-info">
                        <span
                          className="eg-admin-status-chip"
                          style={{
                            background: row.matched
                              ? row.matchConfidence === 'partial' ? 'rgba(251,191,36,0.15)' : 'rgba(34,197,94,0.15)'
                              : 'rgba(239,68,68,0.15)',
                            color: row.matched
                              ? row.matchConfidence === 'partial' ? '#fcd34d' : '#4ade80'
                              : '#f87171',
                            fontSize: '0.7rem',
                          }}
                        >
                          {row.matched
                            ? (row.matchConfidence === 'partial' ? 'Partial' : 'Exact')
                              + (row.matchSource ? ` (${row.matchSource})` : '')
                            : 'No match'}
                        </span>
                        <span className="eg-fd-preview-reason">{row.matchReason}</span>
                      </div>
                      {/* Manual resolution for unmatched rows with a team */}
                      {!row.matched && row.teamId && row.availablePlayers?.length ? (
                        <div className="eg-fd-resolve">
                          <select
                            value={row.manualPlayerId || ''}
                            onChange={(e) => updatePreviewManualPlayer(i, e.target.value)}
                            className="eg-fd-resolve-select"
                          >
                            <option value="">Select player manually...</option>
                            {row.availablePlayers.map((p) => (
                              <option key={p.id} value={p.id}>{p.label}</option>
                            ))}
                          </select>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

              </div>
            ) : null}
          </div>

          {/* ─── PLAYER STATS TABLE ─────────────────────── */}
          <AdminCard
            title="Player Stats"
            subtitle={playerDrafts.size > 0 ? `${matchedDrafts.length} matched${unmatchedDrafts.length > 0 ? `, ${unmatchedDrafts.length} unmatched` : ''}` : 'No stats loaded'}
            actions={
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="eg-fd-btn eg-fd-btn-save"
                  disabled={playerStatsMutation.isPending || dirtyPlayerCount === 0}
                  onClick={() => playerStatsMutation.mutate()}
                >
                  {playerStatsMutation.isPending ? 'Saving...' : `Save ${dirtyPlayerCount} Change(s)`}
                </button>
                <button
                  type="button"
                  className="eg-fd-btn eg-fd-btn-danger"
                  disabled={deleteStatsMutation.isPending || (playerStatsQuery.data?.length ?? 0) === 0}
                  onClick={() => {
                    const count = playerStatsQuery.data?.length ?? 0;
                    if (count === 0) return;
                    if (!window.confirm(`Delete ALL ${count} player stat rows for this fixture? This cannot be undone.`)) return;
                    deleteStatsMutation.mutate();
                  }}
                >
                  {deleteStatsMutation.isPending ? 'Deleting...' : 'Delete All'}
                </button>
              </div>
            }
          >
            {playerStatsQuery.isLoading ? (
              <p className="eg-admin-muted" style={{ padding: 12, textAlign: 'center' }}>Loading player stats...</p>
            ) : playerDrafts.size === 0 ? (
              <EmptyState title="No player stats yet" description="Paste JSON above to bulk import, or add players one-by-one below." />
            ) : null}

            {/* Unmatched rows — resolve section */}
            {unmatchedDrafts.length > 0 ? (
              <div className="eg-fd-unmatched-section">
                <p className="eg-fd-unmatched-title">
                  {unmatchedDrafts.length} Unmatched Player(s) — resolve to save
                </p>
                {unmatchedDrafts.map((stat) => (
                  <UnmatchedPlayerResolver
                    key={stat.player_id}
                    stat={stat}
                    fixtureHomeTeamId={fixture.home_team_id}
                    fixtureAwayTeamId={fixture.away_team_id}
                    homeName={homeName}
                    awayName={awayName}
                    onResolve={resolveUnmatchedPlayer}
                    onRemove={(tempId) => {
                      setPlayerDrafts((prev) => {
                        const next = new Map(prev);
                        next.delete(tempId);
                        return next;
                      });
                    }}
                  />
                ))}
              </div>
            ) : null}

            {/* Matched rows table */}
            {matchedDrafts.length > 0 ? (
              <div className="eg-fd-stats-cards">
                {matchedDrafts.map((stat) => (
                  <div
                    key={stat.player_id}
                    className={`eg-fd-stat-card${stat.dirty ? ' eg-fd-stat-card--dirty' : ''}`}
                  >
                    <div className="eg-fd-stat-card-header">
                      <strong>{stat.player_name || stat.player_id.slice(0, 8)}</strong>
                      <span className="eg-fd-stat-team-label">{teamById.get(stat.team_id) || stat.team_id.slice(0, 8)}</span>
                    </div>
                    <div className="eg-fd-stat-fields">
                      <label>
                        <span>D</span>
                        <input type="number" min={0} value={stat.disposals ?? ''} onChange={(e) => updatePlayerDraft(stat.player_id, 'disposals', e.target.value)} />
                      </label>
                      <label>
                        <span>K</span>
                        <input type="number" min={0} value={stat.kicks ?? ''} onChange={(e) => updatePlayerDraft(stat.player_id, 'kicks', e.target.value)} />
                      </label>
                      <label>
                        <span>H</span>
                        <input type="number" min={0} value={stat.handballs ?? ''} onChange={(e) => updatePlayerDraft(stat.player_id, 'handballs', e.target.value)} />
                      </label>
                      <label>
                        <span>M</span>
                        <input type="number" min={0} value={stat.marks ?? ''} onChange={(e) => updatePlayerDraft(stat.player_id, 'marks', e.target.value)} />
                      </label>
                      <label>
                        <span>T</span>
                        <input type="number" min={0} value={stat.tackles ?? ''} onChange={(e) => updatePlayerDraft(stat.player_id, 'tackles', e.target.value)} />
                      </label>
                      <label>
                        <span>CLR</span>
                        <input type="number" min={0} value={stat.clearances ?? ''} onChange={(e) => updatePlayerDraft(stat.player_id, 'clearances', e.target.value)} />
                      </label>
                      <label>
                        <span>FP</span>
                        <input type="number" min={0} value={stat.fantasy_points ?? ''} onChange={(e) => updatePlayerDraft(stat.player_id, 'fantasy_points', e.target.value)} />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Add single player */}
            <div className="eg-admin-section-block">
              <p style={{ margin: '0 0 6px', fontSize: '0.82rem', fontWeight: 700 }}>Add Player Manually</p>
              <div className="eg-admin-toolbar">
                <label className="eg-admin-inline-field">
                  <span>Team</span>
                  <select value={addPlayerTeamId} onChange={(e) => { setAddPlayerTeamId(e.target.value); setAddPlayerId(''); }}>
                    <option value="">Select team</option>
                    {fixture.home_team_id ? <option value={fixture.home_team_id}>{homeName}</option> : null}
                    {fixture.away_team_id ? <option value={fixture.away_team_id}>{awayName}</option> : null}
                  </select>
                </label>
                <label className="eg-admin-inline-field">
                  <span>Player</span>
                  <select value={addPlayerId} onChange={(e) => setAddPlayerId(e.target.value)} disabled={!addPlayerTeamId}>
                    <option value="">Select player</option>
                    {(addPlayerListQuery.data || [])
                      .filter((p) => !playerDrafts.has(p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>{p.display_name || p.name || p.id}</option>
                      ))}
                  </select>
                </label>
                <button type="button" className="eg-fd-btn" onClick={addPlayerRow} disabled={!addPlayerId}>
                  Add
                </button>
              </div>
            </div>
          </AdminCard>
        </>
      ) : null}

      {/* ═══════ WORM SECTION ═══════ */}
      {activeSection === 'worm' ? (
        <AdminCard
          title="Momentum Worm"
          subtitle="Set cumulative quarter scores to power the match centre worm chart"
          actions={
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="eg-fd-btn"
                onClick={() => initWormDraft(fixture)}
              >
                Reset
              </button>
              <button
                type="button"
                className="eg-fd-btn eg-fd-btn-save"
                disabled={wormMutation.isPending || !wormDirty || !wormDraft}
                onClick={() => wormMutation.mutate()}
              >
                {wormMutation.isPending ? 'Saving...' : 'Save Worm'}
              </button>
            </div>
          }
        >
          {!wormDraft ? (
            <button
              type="button"
              className="eg-fd-btn eg-fd-btn-primary"
              onClick={() => initWormDraft(fixture)}
            >
              Load Worm Editor
            </button>
          ) : (
            <>
              <div className="eg-fd-worm-grid">
                <div className="eg-fd-worm-header-row">
                  <span />
                  <span className="eg-fd-worm-team-label">{homeName} (Home)</span>
                  <span className="eg-fd-worm-team-label">{awayName} (Away)</span>
                </div>
                {wormDraft.map((pt, qi) => (
                  <div key={pt.q} className="eg-fd-worm-row">
                    <span className="eg-fd-worm-quarter">{pt.q}</span>
                    <label className="eg-fd-worm-field">
                      <input
                        type="number"
                        min={0}
                        value={pt.home}
                        onChange={(e) => updateWormDraft(qi, 'home', e.target.value)}
                      />
                    </label>
                    <label className="eg-fd-worm-field">
                      <input
                        type="number"
                        min={0}
                        value={pt.away}
                        onChange={(e) => updateWormDraft(qi, 'away', e.target.value)}
                      />
                    </label>
                  </div>
                ))}
              </div>

              <p className="eg-fd-worm-hint">
                Enter <strong>cumulative</strong> scores at the end of each quarter.
                {fixture.home_total != null ? ` Final: ${fixture.home_total} – ${fixture.away_total ?? '?'}.` : ''}
                {' '}Q4 should equal the final score.
              </p>

              <div className="eg-fd-worm-preview">
                <p className="eg-fd-worm-preview-label">Live Preview</p>
                <WormGraph
                  progression={wormDraft.filter((p) => p.home > 0 || p.away > 0)}
                  homeColor="#FFD218"
                  awayColor="#7BD6FF"
                  waitingLabel="Enter quarter scores above to see worm preview"
                />
              </div>

              {fixture.quarter_scores_json ? (
                <details style={{ marginTop: 12 }}>
                  <summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--admin-muted)' }}>
                    Current saved data
                  </summary>
                  <pre className="eg-admin-json">{JSON.stringify(fixture.quarter_scores_json, null, 2)}</pre>
                </details>
              ) : null}
            </>
          )}
        </AdminCard>
      ) : null}

      {/* ═══════ SCORES SECTION ═══════ */}
      {activeSection === 'scores' ? (
        <AdminCard
          title="Fixture Scores"
          subtitle="Save a manual final result without coach submissions or screenshots"
          actions={
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="eg-fd-btn eg-fd-btn-danger"
                disabled={clearScoresMutation.isPending}
                onClick={() => {
                  if (!window.confirm('Clear the saved result, worm, and team stats for this fixture?')) return;
                  clearScoresMutation.mutate();
                }}
              >
                {clearScoresMutation.isPending ? 'Clearing...' : 'Clear Result'}
              </button>
              <button
                type="button"
                className="eg-fd-btn eg-fd-btn-save"
                disabled={scoreMutation.isPending}
                onClick={() => scoreMutation.mutate()}
              >
                {scoreMutation.isPending ? 'Saving...' : 'Save Result'}
              </button>
            </div>
          }
        >
          <div className="eg-admin-highlight-block" style={{ marginBottom: 12 }}>
            <p className="eg-admin-muted" style={{ margin: 0 }}>
              Admin overrides here write straight to the fixture result. They do not need a submission, photos, or OCR.
              If the match was never played, use an awarded-result preset below, then save.
            </p>
            {!adminToken() ? (
              <p className="eg-admin-muted" style={{ margin: '8px 0 0' }}>
                If save is locked, unlock <strong>Admin Write Access</strong> in the header once, then try again.
              </p>
            ) : null}
          </div>

          <div className="eg-admin-section-block" style={{ marginBottom: 12 }}>
            <p style={{ margin: '0 0 8px', fontSize: '0.82rem', fontWeight: 700 }}>Awarded Result Presets</p>
            <div className="eg-admin-inline-buttons" style={{ flexWrap: 'wrap' }}>
              {MANUAL_RESULT_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  className="eg-fd-btn"
                  onClick={() => applyScorePreset(preset)}
                  title={preset.description}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <p className="eg-admin-muted" style={{ margin: '8px 0 0', fontSize: '0.78rem' }}>
              Presets use small non-zero losing scores so the ladder percentage stays valid. You can still edit the goals and behinds before saving.
            </p>
          </div>

          <div className="eg-admin-score-grid">
            <fieldset className="eg-admin-score-card">
              <legend>{homeName} (Home)</legend>
              <div className="eg-admin-score-fields">
                <label className="eg-admin-stack-field">
                  <span>Goals</span>
                  <input
                    type="number" min={0}
                    value={scoreDraft?.homeGoals ?? String(fixture.home_goals ?? '')}
                    onChange={(e) => {
                      if (!scoreDraft) initScoreDraft();
                      setScoreDraft((prev) => prev ? { ...prev, homeGoals: e.target.value } : prev);
                    }}
                  />
                </label>
                <label className="eg-admin-stack-field">
                  <span>Behinds</span>
                  <input
                    type="number" min={0}
                    value={scoreDraft?.homeBehinds ?? String(fixture.home_behinds ?? '')}
                    onChange={(e) => {
                      if (!scoreDraft) initScoreDraft();
                      setScoreDraft((prev) => prev ? { ...prev, homeBehinds: e.target.value } : prev);
                    }}
                  />
                </label>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: '0.84rem', color: 'var(--admin-muted)' }}>
                Total: {homeTotal ?? '—'}
              </p>
            </fieldset>

            <fieldset className="eg-admin-score-card">
              <legend>{awayName} (Away)</legend>
              <div className="eg-admin-score-fields">
                <label className="eg-admin-stack-field">
                  <span>Goals</span>
                  <input
                    type="number" min={0}
                    value={scoreDraft?.awayGoals ?? String(fixture.away_goals ?? '')}
                    onChange={(e) => {
                      if (!scoreDraft) initScoreDraft();
                      setScoreDraft((prev) => prev ? { ...prev, awayGoals: e.target.value } : prev);
                    }}
                  />
                </label>
                <label className="eg-admin-stack-field">
                  <span>Behinds</span>
                  <input
                    type="number" min={0}
                    value={scoreDraft?.awayBehinds ?? String(fixture.away_behinds ?? '')}
                    onChange={(e) => {
                      if (!scoreDraft) initScoreDraft();
                      setScoreDraft((prev) => prev ? { ...prev, awayBehinds: e.target.value } : prev);
                    }}
                  />
                </label>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: '0.84rem', color: 'var(--admin-muted)' }}>
                Total: {awayTotal ?? '—'}
              </p>
            </fieldset>
          </div>

          <div className="eg-admin-toolbar" style={{ marginTop: 8 }}>
            <label className="eg-admin-inline-field">
              <span>Status</span>
              <select
                value={scoreDraft?.status ?? fixture.status ?? ''}
                onChange={(e) => {
                  const newStatus = e.target.value;
                  setScoreDraft((prev) => {
                    if (prev) return { ...prev, status: newStatus };
                    return {
                      homeGoals: String(fixture.home_goals ?? ''),
                      homeBehinds: String(fixture.home_behinds ?? ''),
                      awayGoals: String(fixture.away_goals ?? ''),
                      awayBehinds: String(fixture.away_behinds ?? ''),
                      status: newStatus,
                    };
                  });
                }}
              >
                <option value="SCHEDULED">Scheduled</option>
                <option value="PENDING_RESULTS">Pending Results</option>
                <option value="LIVE">Live</option>
                <option value="FINAL">Final</option>
              </select>
            </label>
            <label className="eg-admin-inline-field">
              <span>Save</span>
              <div className="eg-admin-inline-buttons">
                <button
                  type="button"
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate(scoreDraft?.status ?? fixture.status ?? 'SCHEDULED')}
                >
                  {statusMutation.isPending ? 'Saving...' : 'Save Status'}
                </button>
                <button
                  type="button"
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate('FINAL')}
                >
                  Mark FINAL
                </button>
              </div>
            </label>
          </div>

          <div className="eg-admin-page-header-meta">
            <p style={{ margin: 0 }}>Fixture ID: <code className="mono">{fixture.id}</code></p>
            <p style={{ margin: '2px 0 0' }}>Venue: {fixture.venue || '—'} · Start: {formatDateTime(fixture.start_time)}</p>
            {fixture.corrected_at ? <p style={{ margin: '2px 0 0' }}>Corrected: {formatDateTime(fixture.corrected_at)}</p> : null}
            {fixture.submitted_at ? <p style={{ margin: '2px 0 0' }}>Submitted: {formatDateTime(fixture.submitted_at)}</p> : null}
          </div>
        </AdminCard>
      ) : null}

      {/* ═══════ OCR SECTION ═══════ */}
      {activeSection === 'ocr' ? (
        <AdminCard title="OCR Queue" subtitle="OCR processing data linked to this fixture">
          {ocrQuery.isLoading ? <p className="eg-admin-muted">Loading OCR data...</p> : null}
          {ocrQuery.error ? (
            <p className="eg-admin-error">
              {ocrQuery.error instanceof Error ? ocrQuery.error.message : 'Failed to load OCR data'}
            </p>
          ) : null}

          {!ocrQuery.isLoading && !(ocrQuery.data?.length || 0) ? (
            <EmptyState title="No OCR data" description="No OCR queue items linked to this fixture." />
          ) : (
            <div className="eg-admin-list">
              {(ocrQuery.data || []).map((row) => (
                <article key={row.id}>
                  <div>
                    <strong>{row.status}</strong>
                    <span>{formatDateTime(row.updated_at)}</span>
                  </div>
                  {row.error ? <p className="eg-admin-error">{row.error}</p> : null}
                  <div className="eg-admin-inline-buttons" style={{ marginTop: 6 }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm(`Retry OCR item ${row.id}?`)) return;
                        ocrMutation.mutate({ id: row.id, status: 'queued', error: '' });
                      }}
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm(`Mark OCR item ${row.id} as failed?`)) return;
                        ocrMutation.mutate({ id: row.id, status: 'failed', error: 'Marked failed by admin' });
                      }}
                    >
                      Mark Failed
                    </button>
                  </div>
                  <details style={{ marginTop: 6 }}>
                    <summary style={{ cursor: 'pointer', fontSize: '0.82rem' }}>View Result JSON</summary>
                    <pre className="eg-admin-json">{JSON.stringify(row.result || {}, null, 2)}</pre>
                  </details>
                  {row.source_images?.length ? (
                    <details style={{ marginTop: 4 }}>
                      <summary style={{ cursor: 'pointer', fontSize: '0.82rem' }}>Source Images ({row.source_images.length})</summary>
                      <pre className="eg-admin-json">{JSON.stringify(row.source_images, null, 2)}</pre>
                    </details>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </AdminCard>
      ) : null}

      {/* ═══════ SUBMISSIONS SECTION ═══════ */}
      {activeSection === 'submissions' ? (
        <AdminCard
          title="Fixture Submissions"
          subtitle="Coach submissions for this fixture"
          actions={
            <button
              type="button"
              className="eg-fd-btn eg-fd-btn-primary"
              disabled={isDownloadingPhotos || !submissionsQuery.data?.length}
              onClick={() => void downloadAllPhotos()}
            >
              {isDownloadingPhotos ? 'Downloading...' : `Download All Photos (${getSubmissionPhotoUrls().length})`}
            </button>
          }
        >
          {submissionsQuery.isLoading ? <p className="eg-admin-muted">Loading submissions...</p> : null}
          {submissionsQuery.error ? (
            <p className="eg-admin-error">
              {submissionsQuery.error instanceof Error ? submissionsQuery.error.message : 'Failed to load submissions'}
            </p>
          ) : null}

          {!submissionsQuery.isLoading && !(submissionsQuery.data?.length || 0) ? (
            <EmptyState title="No submissions" description="No coach submissions for this fixture yet." />
          ) : (
            <div className="eg-admin-list">
              {(submissionsQuery.data || []).map((sub, idx) => {
                const subId = String(sub.id || idx);
                return (
                  <article key={subId}>
                    <div>
                      <strong>Submission {subId.slice(0, 8)}</strong>
                      <span>{String(sub.status || 'submitted')}</span>
                    </div>
                    <p>
                      Team: {sub.team_id ? teamById.get(String(sub.team_id)) || String(sub.team_id) : '—'}
                      {' · '}
                      {formatDateTime(String(sub.submitted_at || sub.created_at || ''))}
                    </p>
                    {sub.notes ? <p>{String(sub.notes)}</p> : null}
                    {sub.home_goals != null || sub.away_goals != null ? (
                      <p style={{ fontSize: '0.82rem' }}>
                        Score: {String(sub.home_goals ?? '?')}.{String(sub.home_behinds ?? '?')}.{String(sub.home_total ?? '?')}
                        {' vs '}
                        {String(sub.away_goals ?? '?')}.{String(sub.away_behinds ?? '?')}.{String(sub.away_total ?? '?')}
                      </p>
                    ) : null}
                    {sub.ocr_raw_text ? (
                      <details style={{ marginTop: 4 }}>
                        <summary style={{ cursor: 'pointer', fontSize: '0.82rem' }}>OCR Raw Text</summary>
                        <pre className="eg-admin-json">{String(sub.ocr_raw_text)}</pre>
                      </details>
                    ) : null}
                    {sub.goal_kickers_home || sub.goal_kickers_away ? (
                      <details style={{ marginTop: 4 }}>
                        <summary style={{ cursor: 'pointer', fontSize: '0.82rem' }}>Goal Kickers</summary>
                        <pre className="eg-admin-json">
                          {JSON.stringify({ home: sub.goal_kickers_home, away: sub.goal_kickers_away }, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                    {sub.ocr_team_stats ? (
                      <details style={{ marginTop: 4 }}>
                        <summary style={{ cursor: 'pointer', fontSize: '0.82rem' }}>Team Stats</summary>
                        <pre className="eg-admin-json">
                          {JSON.stringify(typeof sub.ocr_team_stats === 'string' ? (() => { try { return JSON.parse(sub.ocr_team_stats as string); } catch { return sub.ocr_team_stats; } })() : sub.ocr_team_stats, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                    {sub.team_stats ? (
                      <details style={{ marginTop: 4 }}>
                        <summary style={{ cursor: 'pointer', fontSize: '0.82rem' }}>Submitted Team Stats (raw)</summary>
                        <pre className="eg-admin-json">
                          {JSON.stringify(typeof sub.team_stats === 'string' ? (() => { try { return JSON.parse(sub.team_stats as string); } catch { return sub.team_stats; } })() : sub.team_stats, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                    {(() => {
                      let rawUrls = sub.screenshot_urls;
                      if (typeof rawUrls === 'string') {
                        try { rawUrls = JSON.parse(rawUrls); } catch { rawUrls = []; }
                      }
                      const urls = Array.isArray(rawUrls) ? rawUrls : [];
                      let rawScreenshots = sub.screenshots;
                      if (typeof rawScreenshots === 'string') {
                        try { rawScreenshots = JSON.parse(rawScreenshots); } catch { rawScreenshots = []; }
                      }
                      const screenshots = Array.isArray(rawScreenshots) ? rawScreenshots : [];
                      const allUrls: string[] = [
                        ...urls.filter((u: unknown) => typeof u === 'string' && u),
                        ...screenshots
                          .map((s: any) => s?.publicUrl || s?.url || '')
                          .filter((u: string) => u),
                      ];
                      const unique = [...new Set(allUrls)];
                      if (!unique.length) return null;
                      return (
                        <div className="eg-admin-highlight-block" style={{ marginTop: 8 }}>
                          <p style={{ margin: '0 0 8px', fontSize: '0.84rem', fontWeight: 700, color: '#bfe4ff' }}>
                            Screenshots ({unique.length})
                          </p>
                          <div className="eg-admin-media-grid">
                            {unique.map((url, i) => {
                              const screenshotMeta = screenshots[i] as any;
                              const imageType = screenshotMeta?.imageType || '';
                              const label = imageType === 'team_stats'
                                ? `Team Stats p${screenshotMeta?.pageNumber || i + 1}`
                                : imageType === 'player_stat'
                                  ? `Player Stats p${screenshotMeta?.pageNumber || i + 1}`
                                  : imageType === 'match_summary'
                                    ? 'Match Summary'
                                    : `Screenshot ${i + 1}`;
                              return (
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="eg-admin-media-card">
                                  <img src={url} alt={label} />
                                  <p>{label}</p>
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </article>
                );
              })}
            </div>
          )}
        </AdminCard>
      ) : null}
    </div>
  );
}

// ─── UNMATCHED PLAYER RESOLVER COMPONENT ──────────────
function UnmatchedPlayerResolver(props: {
  stat: PlayerStatDraft;
  fixtureHomeTeamId: string | null;
  fixtureAwayTeamId: string | null;
  homeName: string;
  awayName: string;
  onResolve: (tempId: string, realPlayerId: string, realPlayerName: string) => void;
  onRemove: (tempId: string) => void;
}) {
  const { stat, fixtureHomeTeamId, fixtureAwayTeamId, homeName, awayName, onResolve, onRemove } = props;
  const [resolveTeamId, setResolveTeamId] = useState(stat.team_id || '');
  const [resolvePlayerId, setResolvePlayerId] = useState('');

  const playersQuery = useQuery({
    queryKey: ['admin', 'players-for-team', resolveTeamId],
    queryFn: () => listPlayersForTeam(resolveTeamId),
    enabled: Boolean(resolveTeamId),
    staleTime: 5 * 60_000,
  });

  return (
    <div className="eg-fd-unmatched-row">
      <div className="eg-fd-unmatched-info">
        <strong>{stat.player_name}</strong>
        <span className="eg-fd-unmatched-stats">
          D:{stat.disposals ?? 0} K:{stat.kicks ?? 0} H:{stat.handballs ?? 0} M:{stat.marks ?? 0}
        </span>
      </div>
      <div className="eg-fd-unmatched-controls">
        <select
          value={resolveTeamId}
          onChange={(e) => { setResolveTeamId(e.target.value); setResolvePlayerId(''); }}
          className="eg-fd-resolve-select"
        >
          <option value="">Team...</option>
          {fixtureHomeTeamId ? <option value={fixtureHomeTeamId}>{homeName}</option> : null}
          {fixtureAwayTeamId ? <option value={fixtureAwayTeamId}>{awayName}</option> : null}
        </select>
        <select
          value={resolvePlayerId}
          onChange={(e) => setResolvePlayerId(e.target.value)}
          disabled={!resolveTeamId || playersQuery.isLoading}
          className="eg-fd-resolve-select"
        >
          <option value="">{playersQuery.isLoading ? 'Loading...' : 'Player...'}</option>
          {(playersQuery.data || []).map((p) => (
            <option key={p.id} value={p.id}>{p.display_name || p.name || p.id}</option>
          ))}
        </select>
        <button
          type="button"
          className="eg-fd-btn eg-fd-btn-sm"
          disabled={!resolvePlayerId}
          onClick={() => {
            const player = playersQuery.data?.find((p) => p.id === resolvePlayerId);
            if (player) {
              onResolve(stat.player_id, player.id, player.display_name || player.name || player.id);
            }
          }}
        >
          Resolve
        </button>
        <button
          type="button"
          className="eg-fd-btn eg-fd-btn-sm eg-fd-btn-danger"
          onClick={() => onRemove(stat.player_id)}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
