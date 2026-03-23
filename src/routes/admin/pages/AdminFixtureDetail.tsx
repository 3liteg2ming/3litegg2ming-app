import { useCallback, useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AdminPermissionError,
  fetchFixtureDetail,
  fetchFixtureOcrData,
  fetchFixtureSubmissionData,
  listFixtures,
  listFixturePlayerStats,
  listPlayersForTeam,
  listTeams,
  updateFixture,
  updateFixtureScores,
  upsertFixturePlayerStats,
  setOcrQueueStatus,
  type AdminFixturePlayerStat,
} from '@/lib/adminApi';
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

type PlayerStatDraft = AdminFixturePlayerStat & { dirty?: boolean; _unmatched?: boolean };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toNum(v: string): number | null {
  const n = Number(v);
  return v.trim() === '' || !Number.isFinite(n) ? null : n;
}

export default function AdminFixtureDetail() {
  const { fixtureId } = useParams<{ fixtureId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast, adminToken } = useAdminLayoutContext();

  const [activeSection, setActiveSection] = useState<'scores' | 'players' | 'ocr' | 'submissions'>('submissions');
  const [scoreDraft, setScoreDraft] = useState<ScoreDraft | null>(null);
  const [playerDrafts, setPlayerDrafts] = useState<Map<string, PlayerStatDraft>>(new Map());
  const [ocrPasteJson, setOcrPasteJson] = useState('');
  const [addPlayerTeamId, setAddPlayerTeamId] = useState('');
  const [addPlayerId, setAddPlayerId] = useState('');
  const [bulkJsonInput, setBulkJsonInput] = useState('');
  const [bulkPreview, setBulkPreview] = useState<Array<{
    playerName: string;
    teamSlug: string;
    matched: boolean;
    playerId: string | null;
    teamId: string | null;
    teamLabel: string;
    kicks: number;
    handballs: number;
    disposals: number;
    marks: number;
    fantasyPoints: number;
  }> | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const fixtureQuery = useQuery({
    queryKey: ['admin', 'fixture-detail', fixtureId],
    queryFn: () => fetchFixtureDetail(fixtureId!),
    enabled: Boolean(fixtureId),
  });

  // Load all fixtures to enable prev/next navigation within the same round
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

  const teamById = useMemo(() => {
    const map = new Map<string, string>();
    for (const team of teamsQuery.data || []) {
      map.set(team.id, team.short_name || team.name);
    }
    return map;
  }, [teamsQuery.data]);

  const fixture = fixtureQuery.data;
  const homeName = fixture?.home_team_id ? teamById.get(fixture.home_team_id) || 'Home' : 'TBD';
  const awayName = fixture?.away_team_id ? teamById.get(fixture.away_team_id) || 'Away' : 'TBD';

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
      pushToast('Fixture scores saved.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'fixture-detail', fixtureId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'fixtures'] });
    },
    onError: (error) => {
      if (error instanceof AdminPermissionError) {
        pushToast('Admin privileges required.', 'error');
      } else {
        pushToast(error instanceof Error ? error.message : 'Failed to save scores', 'error');
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

  const playerStatsMutation = useMutation({
    mutationFn: async () => {
      if (!fixtureId) throw new Error('No fixture');
      const token = adminToken();
      const dirtyRows = Array.from(playerDrafts.values()).filter((d) => d.dirty);
      if (!dirtyRows.length) throw new Error('No changes to save');
      // Only send rows with real UUID player_ids — never send temp/unmatched IDs to the database
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
        })),
      );
    },
    onSuccess: () => {
      pushToast('Player stats saved.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'fixture-player-stats', fixtureId] });
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
    },
    onError: (error) => {
      pushToast(error instanceof Error ? error.message : 'Failed to update OCR item', 'error');
    },
  });

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
        dirty: true,
      });
      return next;
    });
    setAddPlayerId('');
  }

  function applyOcrJson() {
    if (!ocrPasteJson.trim()) return;
    try {
      const parsed = JSON.parse(ocrPasteJson.trim());
      const rows: Array<Record<string, unknown>> = Array.isArray(parsed) ? parsed : parsed.players || parsed.stats || [parsed];

      setPlayerDrafts((prev) => {
        const next = new Map(prev);
        for (const row of rows) {
          const playerId = String(row.player_id || '').trim();
          const teamId = String(row.team_id || fixture?.home_team_id || '').trim();
          if (!playerId) continue;
          const existing = next.get(playerId);
          next.set(playerId, {
            fixture_id: fixtureId || '',
            player_id: playerId,
            team_id: teamId,
            player_name: String(row.player_name || row.name || existing?.player_name || playerId),
            disposals: row.disposals != null ? Number(row.disposals) : existing?.disposals ?? null,
            kicks: row.kicks != null ? Number(row.kicks) : existing?.kicks ?? null,
            handballs: row.handballs != null ? Number(row.handballs) : existing?.handballs ?? null,
            marks: row.marks != null ? Number(row.marks) : existing?.marks ?? null,
            tackles: row.tackles != null ? Number(row.tackles) : existing?.tackles ?? null,
            clearances: row.clearances != null ? Number(row.clearances) : existing?.clearances ?? null,
            dirty: true,
          });
        }
        return next;
      });

      pushToast(`Applied ${rows.length} player stat row(s) from JSON.`, 'success');
      setOcrPasteJson('');
    } catch {
      pushToast('Invalid JSON. Expected an array of player stat objects.', 'error');
    }
  }

  function previewBulkJson() {
    setBulkError(null);
    setBulkPreview(null);
    if (!bulkJsonInput.trim()) { setBulkError('Paste JSON first.'); return; }
    try {
      const parsed = JSON.parse(bulkJsonInput.trim());
      const rows: Array<Record<string, unknown>> = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.playerStats)
          ? parsed.playerStats
          : Array.isArray(parsed.players)
            ? parsed.players
            : [parsed];

      if (!rows.length) { setBulkError('No player stat rows found in JSON.'); return; }

      const allTeams = teamsQuery.data || [];
      const teamSlugMap = new Map<string, { id: string; label: string }>();
      for (const t of allTeams) {
        const slug = String(t.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
        const key = String(t.team_key || t.slug || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const name = String(t.short_name || t.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const entry = { id: t.id, label: t.short_name || t.name };
        if (slug) teamSlugMap.set(slug, entry);
        if (key) teamSlugMap.set(key, entry);
        if (name) teamSlugMap.set(name, entry);
      }

      const preview = rows.map((row) => {
        const playerName = String(row.playerName || row.player_name || row.name || '').trim();
        const rawSlug = String(row.teamSlug || row.team_slug || row.team || '').trim();
        const normalizedSlug = rawSlug.toLowerCase().replace(/[^a-z0-9-]/g, '');
        const compactSlug = rawSlug.toLowerCase().replace(/[^a-z0-9]/g, '');

        const teamMatch = teamSlugMap.get(normalizedSlug) || teamSlugMap.get(compactSlug) || null;

        // Try to find player in addPlayerListQuery or by searching existing drafts
        let playerId: string | null = null;
        if (teamMatch) {
          // Search existing player stats drafts
          const normalizedName = playerName.toLowerCase().replace(/[^a-z]/g, '');
          for (const [pid, draft] of playerDrafts) {
            if (draft.team_id === teamMatch.id) {
              const draftName = (draft.player_name || '').toLowerCase().replace(/[^a-z]/g, '');
              if (draftName === normalizedName) { playerId = pid; break; }
            }
          }
        }

        return {
          playerName,
          teamSlug: rawSlug,
          matched: Boolean(teamMatch),
          playerId,
          teamId: teamMatch?.id || null,
          teamLabel: teamMatch?.label || rawSlug,
          kicks: Number(row.kicks || 0),
          handballs: Number(row.handballs || 0),
          disposals: Number(row.disposals || 0),
          marks: Number(row.marks || 0),
          fantasyPoints: Number(row.fantasyPoints || row.fantasy_points || 0),
        };
      });

      setBulkPreview(preview);
    } catch {
      setBulkError('Invalid JSON. Check format and try again.');
    }
  }

  async function applyBulkImport() {
    if (!bulkPreview || !fixtureId) return;
    const matched = bulkPreview.filter((r) => r.matched && r.teamId);
    if (!matched.length) { pushToast('No matched rows to import.', 'error'); return; }

    // Fetch players for matched teams to resolve player IDs
    const teamIds = Array.from(new Set(matched.map((r) => r.teamId!)));
    const playersByTeam = new Map<string, Array<{ id: string; name: string; display_name: string | null }>>();

    for (const tid of teamIds) {
      try {
        const players = await listPlayersForTeam(tid);
        playersByTeam.set(tid, players);
      } catch { /* continue */ }
    }

    let importCount = 0;
    let skippedCount = 0;

    setPlayerDrafts((prev) => {
      const next = new Map(prev);
      for (const row of matched) {
        const teamPlayers = playersByTeam.get(row.teamId!) || [];
        const normalizedName = row.playerName.toLowerCase().replace(/[^a-z]/g, '');

        // Find matching player
        let resolvedPlayerId = row.playerId;
        let resolvedPlayerName = row.playerName;

        if (!resolvedPlayerId) {
          const found = teamPlayers.find((p) => {
            const pName = (p.display_name || p.name || '').toLowerCase().replace(/[^a-z]/g, '');
            return pName === normalizedName;
          });
          if (found) {
            resolvedPlayerId = found.id;
            resolvedPlayerName = found.display_name || found.name || row.playerName;
          }
        }

        if (!resolvedPlayerId) {
          // Try partial match (last name match)
          const nameParts = row.playerName.toLowerCase().split(/\s+/);
          const lastName = nameParts[nameParts.length - 1]?.replace(/[^a-z]/g, '');
          if (lastName && lastName.length > 2) {
            const found = teamPlayers.find((p) => {
              const pName = (p.display_name || p.name || '').toLowerCase();
              return pName.endsWith(lastName) || pName.includes(lastName);
            });
            if (found) {
              resolvedPlayerId = found.id;
              resolvedPlayerName = found.display_name || found.name || row.playerName;
            }
          }
        }

        if (!resolvedPlayerId) {
          // Use a UI-only temp key — NEVER sent to the database
          resolvedPlayerId = `_unmatched:${row.teamId}:${normalizedName}:${Date.now()}`;
          skippedCount++;

          next.set(resolvedPlayerId, {
            fixture_id: fixtureId,
            player_id: resolvedPlayerId,
            team_id: row.teamId!,
            player_name: resolvedPlayerName,
            disposals: row.disposals || null,
            kicks: row.kicks || null,
            handballs: row.handballs || null,
            marks: row.marks || null,
            tackles: null,
            clearances: null,
            dirty: true,
            _unmatched: true,
          });
        } else {
          importCount++;

          next.set(resolvedPlayerId, {
            fixture_id: fixtureId,
            player_id: resolvedPlayerId,
            team_id: row.teamId!,
            player_name: resolvedPlayerName,
            disposals: row.disposals || null,
            kicks: row.kicks || null,
            handballs: row.handballs || null,
            marks: row.marks || null,
            tackles: null,
            clearances: null,
            dirty: true,
          });
        }
      }
      return next;
    });

    const msg = skippedCount > 0
      ? `Imported ${importCount} players. ${skippedCount} unmatched (shown but will NOT be saved — resolve manually or add via Add Player).`
      : `Imported ${importCount} player stat rows.`;
    pushToast(msg, skippedCount > 0 ? 'info' : 'success');
    setBulkPreview(null);
    setBulkJsonInput('');
  }

  // Compute prev/next siblings in the same round — must be above early returns to keep hook order stable
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

  const dirtyPlayerCount = useMemo(
    () => Array.from(playerDrafts.values()).filter((d) => d.dirty && UUID_RE.test(d.player_id)).length,
    [playerDrafts],
  );

  if (!fixtureId) {
    return <EmptyState title="No fixture" description="Fixture ID is missing from the URL." />;
  }

  if (fixtureQuery.isLoading) {
    return <p className="eg-admin-muted">Loading fixture…</p>;
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
    setOcrPasteJson('');
    setAddPlayerTeamId('');
    setAddPlayerId('');
    navigate(`/admin/fixtures/${id}`);
  }

  const sections = [
    { key: 'scores' as const, label: 'Scores' },
    { key: 'players' as const, label: `Player Stats (${playerStatsQuery.data?.length ?? 0})` },
    { key: 'ocr' as const, label: `OCR Data (${ocrQuery.data?.length ?? 0})` },
    { key: 'submissions' as const, label: `Submissions (${submissionsQuery.data?.length ?? 0})` },
  ];

  return (
    <div className="eg-admin-stack">
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Link to="/admin/fixtures" style={{ color: '#bfe4ff', fontSize: '0.84rem' }}>
          ← Fixtures
        </Link>
        <h3 style={{ margin: 0, flex: 1 }}>
          R{fixture.round ?? '?'}: {homeName} vs {awayName}
        </h3>
        <span style={{ fontSize: '0.8rem', color: 'var(--admin-muted)' }}>
          {fixture.status} · {formatDateTime(fixture.start_time)}
        </span>
      </div>

      {siblings.total > 1 ? (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 12px',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 10,
          fontSize: '0.82rem',
        }}>
          <button
            type="button"
            disabled={!siblings.prev}
            onClick={() => siblings.prev && goToFixture(siblings.prev.id)}
            style={{
              background: 'none',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              color: siblings.prev ? '#bfe4ff' : 'rgba(255,255,255,0.2)',
              padding: '4px 10px',
              cursor: siblings.prev ? 'pointer' : 'default',
              fontSize: '0.82rem',
            }}
          >
            ← Prev{siblings.prev ? `: ${teamById.get(siblings.prev.home_team_id || '') || 'TBD'} v ${teamById.get(siblings.prev.away_team_id || '') || 'TBD'}` : ''}
          </button>
          <span style={{ color: 'var(--admin-muted)' }}>
            Match {siblings.position} of {siblings.total} in Round {fixture.round ?? '?'}
          </span>
          <button
            type="button"
            disabled={!siblings.next}
            onClick={() => siblings.next && goToFixture(siblings.next.id)}
            style={{
              background: 'none',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              color: siblings.next ? '#bfe4ff' : 'rgba(255,255,255,0.2)',
              padding: '4px 10px',
              cursor: siblings.next ? 'pointer' : 'default',
              fontSize: '0.82rem',
            }}
          >
            Next{siblings.next ? `: ${teamById.get(siblings.next.home_team_id || '') || 'TBD'} v ${teamById.get(siblings.next.away_team_id || '') || 'TBD'}` : ''} →
          </button>
        </div>
      ) : null}

      <div className="eg-admin-toolbar">
        {sections.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => {
              setActiveSection(s.key);
              if (s.key === 'scores' && !scoreDraft) initScoreDraft();
              if (s.key === 'players' && playerDrafts.size === 0) initPlayerDrafts();
            }}
            style={{
              fontWeight: activeSection === s.key ? 700 : 400,
              borderColor: activeSection === s.key ? 'rgba(34,203,253,0.6)' : undefined,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {activeSection === 'scores' ? (
        <AdminCard title="Fixture Scores" subtitle="Edit team scores and status"
          actions={
            <button
              type="button"
              className="eg-admin-btn"
              disabled={scoreMutation.isPending || !scoreDraft}
              onClick={() => {
                if (!scoreDraft) { initScoreDraft(); return; }
                scoreMutation.mutate();
              }}
            >
              {scoreMutation.isPending ? 'Saving…' : scoreDraft ? 'Save Scores' : 'Edit Scores'}
            </button>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <fieldset style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 10 }}>
              <legend style={{ fontSize: '0.84rem', fontWeight: 700 }}>{homeName} (Home)</legend>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label className="eg-admin-stack-field">
                  <span>Goals</span>
                  <input
                    type="number"
                    min={0}
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
                    type="number"
                    min={0}
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

            <fieldset style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 10 }}>
              <legend style={{ fontSize: '0.84rem', fontWeight: 700 }}>{awayName} (Away)</legend>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <label className="eg-admin-stack-field">
                  <span>Goals</span>
                  <input
                    type="number"
                    min={0}
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
                    type="number"
                    min={0}
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
                  if (!scoreDraft) initScoreDraft();
                  setScoreDraft((prev) => prev ? { ...prev, status: e.target.value } : prev);
                }}
              >
                <option value="SCHEDULED">Scheduled</option>
                <option value="LIVE">Live</option>
                <option value="FINAL">Final</option>
              </select>
            </label>
            <label className="eg-admin-inline-field">
              <span>Quick</span>
              <div className="eg-admin-inline-buttons">
                <button type="button" onClick={() => statusMutation.mutate('FINAL')}>
                  Mark FINAL
                </button>
              </div>
            </label>
          </div>

          <div style={{ fontSize: '0.78rem', color: 'var(--admin-muted)', marginTop: 4 }}>
            <p style={{ margin: 0 }}>Fixture ID: <code className="mono">{fixture.id}</code></p>
            <p style={{ margin: '2px 0 0' }}>Venue: {fixture.venue || '—'} · Start: {formatDateTime(fixture.start_time)}</p>
            {fixture.corrected_at ? <p style={{ margin: '2px 0 0' }}>Corrected: {formatDateTime(fixture.corrected_at)}</p> : null}
            {fixture.submitted_at ? <p style={{ margin: '2px 0 0' }}>Submitted: {formatDateTime(fixture.submitted_at)}</p> : null}
          </div>
        </AdminCard>
      ) : null}

      {activeSection === 'players' ? (
        <AdminCard
          title="Player Stats"
          subtitle="Edit individual player stats for this fixture"
          actions={
            <button
              type="button"
              className="eg-admin-btn"
              disabled={playerStatsMutation.isPending || dirtyPlayerCount === 0}
              onClick={() => playerStatsMutation.mutate()}
            >
              {playerStatsMutation.isPending ? 'Saving…' : `Save ${dirtyPlayerCount} change(s)`}
            </button>
          }
        >
          {playerDrafts.size === 0 && !playerStatsQuery.isLoading ? (
            <div>
              <EmptyState title="No player stats" description="No player stats exist for this fixture yet. Add players or paste OCR data." />
              <button type="button" className="eg-admin-btn" style={{ marginTop: 8 }} onClick={initPlayerDrafts}>
                Load Existing Stats
              </button>
            </div>
          ) : null}

          {playerDrafts.size > 0 ? (
            <div className="eg-admin-table-wrap">
              <table className="eg-admin-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Team</th>
                    <th>D</th>
                    <th>K</th>
                    <th>H</th>
                    <th>M</th>
                    <th>T</th>
                    <th>CLR</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPlayerDrafts.map((stat) => {
                    const isUnmatched = stat._unmatched || stat.player_id.startsWith('_unmatched:') || stat.player_id.startsWith('bulk:');
                    return (
                    <tr key={stat.player_id} style={isUnmatched ? { background: 'rgba(239,68,68,0.08)', borderLeft: '3px solid rgba(239,68,68,0.5)' } : stat.dirty ? { background: 'rgba(34,203,253,0.06)' } : undefined}>
                      <td>
                        <strong>{stat.player_name || stat.player_id.slice(0, 8)}</strong>
                        {isUnmatched ? (
                          <p style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f87171', margin: '2px 0 0' }}>UNMATCHED — will not save</p>
                        ) : (
                          <p className="mono">{stat.player_id.slice(0, 12)}</p>
                        )}
                      </td>
                      <td>{teamById.get(stat.team_id) || stat.team_id.slice(0, 8)}</td>
                      <td>
                        <input
                          type="number" min={0} style={{ width: 52 }}
                          value={stat.disposals ?? ''}
                          onChange={(e) => updatePlayerDraft(stat.player_id, 'disposals', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number" min={0} style={{ width: 52 }}
                          value={stat.kicks ?? ''}
                          onChange={(e) => updatePlayerDraft(stat.player_id, 'kicks', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number" min={0} style={{ width: 52 }}
                          value={stat.handballs ?? ''}
                          onChange={(e) => updatePlayerDraft(stat.player_id, 'handballs', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number" min={0} style={{ width: 52 }}
                          value={stat.marks ?? ''}
                          onChange={(e) => updatePlayerDraft(stat.player_id, 'marks', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number" min={0} style={{ width: 52 }}
                          value={stat.tackles ?? ''}
                          onChange={(e) => updatePlayerDraft(stat.player_id, 'tackles', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="number" min={0} style={{ width: 52 }}
                          value={stat.clearances ?? ''}
                          onChange={(e) => updatePlayerDraft(stat.player_id, 'clearances', e.target.value)}
                        />
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10, marginTop: 6 }}>
            <p style={{ margin: '0 0 6px', fontSize: '0.82rem', fontWeight: 700 }}>Add Player</p>
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
              <button type="button" className="eg-admin-btn" onClick={addPlayerRow} disabled={!addPlayerId}>
                Add
              </button>
            </div>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10, marginTop: 6 }}>
            <p style={{ margin: '0 0 6px', fontSize: '0.82rem', fontWeight: 700 }}>Paste OCR / JSON Stats (by player_id)</p>
            <label className="eg-admin-stack-field">
              <span>JSON array of player stat objects</span>
              <textarea
                value={ocrPasteJson}
                onChange={(e) => setOcrPasteJson(e.target.value)}
                placeholder={'[\n  { "player_id": "...", "team_id": "...", "disposals": 12, "kicks": 8, ... }\n]'}
                rows={4}
              />
            </label>
            <button type="button" className="eg-admin-btn" onClick={applyOcrJson} disabled={!ocrPasteJson.trim()} style={{ marginTop: 6 }}>
              Apply JSON to Table
            </button>
          </div>

          <div style={{
            borderTop: '2px solid rgba(34,203,253,0.2)',
            paddingTop: 14,
            marginTop: 12,
            background: 'rgba(34,203,253,0.02)',
            borderRadius: 10,
            padding: 14,
          }}>
            <p style={{ margin: '0 0 4px', fontSize: '0.88rem', fontWeight: 800, color: '#7dd3fc' }}>
              Paste Player Stats JSON
            </p>
            <p style={{ margin: '0 0 10px', fontSize: '0.78rem', color: 'var(--admin-muted)' }}>
              Paste a full JSON blob with <code>playerStats</code> array. Each row needs: <code>teamSlug</code>, <code>playerName</code>, <code>kicks</code>, <code>handballs</code>, <code>disposals</code>, <code>marks</code>, <code>fantasyPoints</code>.
              Players are matched by name + team. Fixture: <strong>R{fixture.round} {homeName} vs {awayName}</strong>
            </p>
            <label className="eg-admin-stack-field">
              <span>JSON payload</span>
              <textarea
                value={bulkJsonInput}
                onChange={(e) => { setBulkJsonInput(e.target.value); setBulkPreview(null); setBulkError(null); }}
                placeholder={'{\n  "playerStats": [\n    { "teamSlug": "sydney-swans", "playerName": "Isaac Heeney", "kicks": 14, "handballs": 10, "disposals": 24, "marks": 6, "fantasyPoints": 126 }\n  ]\n}'}
                rows={6}
                style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}
              />
            </label>
            {bulkError ? (
              <p className="eg-admin-error" style={{ marginTop: 6 }}>{bulkError}</p>
            ) : null}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                className="eg-admin-btn"
                onClick={previewBulkJson}
                disabled={!bulkJsonInput.trim()}
              >
                Preview Import
              </button>
              {bulkPreview && bulkPreview.some((r) => r.matched) ? (
                <button
                  type="button"
                  className="eg-admin-btn"
                  style={{ background: 'rgba(34,197,94,0.2)', borderColor: 'rgba(34,197,94,0.4)' }}
                  onClick={() => void applyBulkImport()}
                >
                  Apply Import ({bulkPreview.filter((r) => r.matched).length} rows)
                </button>
              ) : null}
            </div>

            {bulkPreview ? (
              <div style={{ marginTop: 10 }}>
                <p style={{ fontSize: '0.82rem', fontWeight: 700, marginBottom: 6 }}>
                  Preview: {bulkPreview.filter((r) => r.matched).length} matched, {bulkPreview.filter((r) => !r.matched).length} unmatched of {bulkPreview.length} total
                </p>
                <div className="eg-admin-table-wrap" style={{ maxHeight: 320, overflow: 'auto' }}>
                  <table className="eg-admin-table" style={{ fontSize: '0.78rem' }}>
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th>Team</th>
                        <th>D</th>
                        <th>K</th>
                        <th>H</th>
                        <th>M</th>
                        <th>FP</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkPreview.map((row, i) => (
                        <tr
                          key={`${row.playerName}-${i}`}
                          style={{
                            background: row.matched
                              ? 'rgba(34,197,94,0.06)'
                              : 'rgba(239,68,68,0.08)',
                          }}
                        >
                          <td><strong>{row.playerName}</strong></td>
                          <td>{row.teamLabel}</td>
                          <td>{row.disposals}</td>
                          <td>{row.kicks}</td>
                          <td>{row.handballs}</td>
                          <td>{row.marks}</td>
                          <td>{row.fantasyPoints}</td>
                          <td>
                            <span style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: 6,
                              background: row.matched ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                              color: row.matched ? '#4ade80' : '#f87171',
                            }}>
                              {row.matched ? 'Matched' : 'No team'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        </AdminCard>
      ) : null}

      {activeSection === 'ocr' ? (
        <AdminCard title="OCR Queue" subtitle="OCR processing data linked to this fixture">
          {ocrQuery.isLoading ? <p className="eg-admin-muted">Loading OCR data…</p> : null}
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

      {activeSection === 'submissions' ? (
        <AdminCard title="Fixture Submissions" subtitle="Coach submissions for this fixture">
          {submissionsQuery.isLoading ? <p className="eg-admin-muted">Loading submissions…</p> : null}
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
                      // Parse screenshot_urls - may be array, JSON string, or null
                      let rawUrls = sub.screenshot_urls;
                      if (typeof rawUrls === 'string') {
                        try { rawUrls = JSON.parse(rawUrls); } catch { rawUrls = []; }
                      }
                      const urls = Array.isArray(rawUrls) ? rawUrls : [];

                      // Parse screenshots - may be array, JSON string, or null
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
                        <div style={{
                          marginTop: 8,
                          padding: '10px 12px',
                          borderRadius: 10,
                          border: '1px solid rgba(34,203,253,0.25)',
                          background: 'rgba(34,203,253,0.04)',
                        }}>
                          <p style={{
                            margin: '0 0 8px',
                            fontSize: '0.84rem',
                            fontWeight: 700,
                            color: '#bfe4ff',
                          }}>
                            Screenshots ({unique.length})
                          </p>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
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
                                <a key={i} href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                                  <img
                                    src={url}
                                    alt={label}
                                    style={{
                                      width: '100%',
                                      maxHeight: 200,
                                      borderRadius: 8,
                                      border: '1px solid rgba(255,255,255,0.12)',
                                      objectFit: 'cover',
                                      display: 'block',
                                    }}
                                  />
                                  <p style={{
                                    margin: '4px 0 0',
                                    fontSize: '0.76rem',
                                    color: 'var(--admin-muted)',
                                    textAlign: 'center',
                                  }}>
                                    {label}
                                  </p>
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
