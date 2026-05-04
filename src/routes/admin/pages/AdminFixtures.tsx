import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AdminPermissionError,
  clearFixtureScores,
  listFixtureIdsWithPlayerStats,
  listFixtures,
  listMissingPlayerStatsFixtures,
  listSeasons,
  listTeams,
  seedFinalsWeek1,
  swapFixtureTeams,
  updateFixture,
} from '@/lib/adminApi';
import { exportPlayerStatsPhotos } from '@/lib/adminPlayerStatsPhotoExport';
import { runFixturePlayerStatsOcrWorkflow } from '@/lib/adminPlayerStatsOcrWorkflow';
import { useAdminLayoutContext } from '../AdminLayout';
import { formatDateTime, useDebouncedValue } from '../useAdminTools';
import { AdminCard, EmptyState } from './AdminUi';

type ViewMode = 'rounds' | 'table';

export default function AdminFixtures() {
  const queryClient = useQueryClient();
  const { globalSearch, pushToast, adminToken } = useAdminLayoutContext();

  const [seasonId, setSeasonId] = useState<'all' | string>('all');
  const [teamId, setTeamId] = useState<'all' | string>('all');
  const [status, setStatus] = useState<'all' | string>('all');
  const [roundInput, setRoundInput] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('rounds');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [runningRound, setRunningRound] = useState<number | null>(null);
  const [runningFixtureIds, setRunningFixtureIds] = useState<string[]>([]);
  const [allRoundsProgress, setAllRoundsProgress] = useState<{ done: number; total: number } | null>(null);
  const [seedingFinals, setSeedingFinals] = useState(false);
  const [seedNotice, setSeedNotice] = useState<{ type: 'info' | 'success' | 'error'; message: string } | null>(null);

  async function handleSeedFinalsWeek1() {
    if (seasonId === 'all') {
      setSeedNotice({ type: 'error', message: 'Select a season first, then seed finals from the locked top eight.' });
      pushToast('Select a season to seed finals from.', 'error');
      return;
    }
    setSeedingFinals(true);
    setSeedNotice({
      type: 'info',
      message: 'Refreshing Finals Week 1 from the current ladder. Existing finals slots will be updated if they already exist.',
    });
    try {
      const result = await seedFinalsWeek1(seasonId);
      setSeedNotice({
        type: 'success',
        message: `Finals Week 1 refreshed successfully. ${result.created || 4} fixture slots are now seeded in Round ${result.round}.`,
      });
      pushToast(`Seeded or refreshed ${result.created || 4} finals fixtures (Round ${result.round}).`, 'success');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'fixtures'] }),
        queryClient.invalidateQueries({ queryKey: ['fixtures'] }),
      ]);
    } catch (error) {
      setSeedNotice({
        type: 'error',
        message:
          error instanceof AdminPermissionError
            ? error.message
            : `Failed to seed finals: ${error instanceof Error ? error.message : String(error)}`,
      });
      pushToast(
        error instanceof AdminPermissionError
          ? error.message
          : `Failed to seed finals: ${error instanceof Error ? error.message : String(error)}`,
        'error',
      );
    } finally {
      setSeedingFinals(false);
    }
  }

  const search = useDebouncedValue((searchInput || globalSearch).trim(), 300);
  const roundFilter = roundInput ? Number(roundInput) : null;

  const fixturesQuery = useQuery({
    queryKey: ['admin', 'fixtures', 1, seasonId, teamId, status, roundFilter, search],
    queryFn: () =>
      listFixtures({
        page: 1,
        pageSize: 500,
        seasonId,
        teamId,
        status,
        round: roundFilter,
        search,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: 25_000,
  });

  const seasonsQuery = useQuery({
    queryKey: ['admin', 'seasons', 'lookup'],
    queryFn: () => listSeasons(''),
    staleTime: 10 * 60_000,
  });

  const teamsQuery = useQuery({
    queryKey: ['admin', 'teams', 'lookup'],
    queryFn: () => listTeams('', 250),
    staleTime: 10 * 60_000,
  });

  const missingPlayerStatsQuery = useQuery({
    queryKey: ['admin', 'missing-player-stats', seasonId],
    queryFn: () => listMissingPlayerStatsFixtures(seasonId),
    enabled: seasonId !== 'all' && Boolean(seasonId),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });

  const teamById = useMemo(() => {
    const map = new Map<string, string>();
    for (const team of teamsQuery.data || []) {
      map.set(team.id, team.short_name || team.name);
    }
    return map;
  }, [teamsQuery.data]);

  const teamMetaById = useMemo(() => {
    const map = new Map<string, { slug: string; label: string }>();
    for (const team of teamsQuery.data || []) {
      const slug = String(team.slug || team.team_key || '').trim();
      map.set(team.id, {
        slug,
        label: team.short_name || team.name,
      });
    }
    return map;
  }, [teamsQuery.data]);

  const fixtureMutation = useMutation({
    mutationFn: async (
      args:
        | { mode: 'status'; fixtureId: string; status: string }
        | { mode: 'startTime'; fixtureId: string; startTime: string }
        | { mode: 'venue'; fixtureId: string; venue: string }
        | { mode: 'lateApproval'; fixtureId: string; allowLateSubmission: boolean }
        | { mode: 'swap'; fixtureId: string }
        | { mode: 'clear'; fixtureId: string },
    ) => {
      if (args.mode === 'status') return updateFixture({ fixtureId: args.fixtureId, status: args.status });
      if (args.mode === 'startTime') return updateFixture({ fixtureId: args.fixtureId, startTime: args.startTime });
      if (args.mode === 'venue') return updateFixture({ fixtureId: args.fixtureId, venue: args.venue });
      if (args.mode === 'lateApproval') {
        return updateFixture({ fixtureId: args.fixtureId, allowLateSubmission: args.allowLateSubmission });
      }
      if (args.mode === 'swap') return swapFixtureTeams(args.fixtureId);
      return clearFixtureScores(args.fixtureId);
    },
    onError: (error) => {
      if (error instanceof AdminPermissionError) {
        pushToast('Admin privileges required for this action.', 'error');
      } else {
        pushToast(error instanceof Error ? error.message : 'Fixture update failed', 'error');
      }
    },
    onSuccess: () => {
      pushToast('Fixture updated.', 'success');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'fixtures'] });
    },
  });

  const allFixtures = fixturesQuery.data?.rows || [];
  const fixtureIds = useMemo(() => allFixtures.map((fixture) => fixture.id), [allFixtures]);

  const playerStatsQuery = useQuery({
    queryKey: ['admin', 'fixtures', 'playerStatsIds', fixtureIds.join(',')],
    queryFn: () => listFixtureIdsWithPlayerStats(fixtureIds),
    enabled: fixtureIds.length > 0,
    staleTime: 0,
    refetchInterval: 5_000,
  });
  const fixtureIdsWithStats: Set<string> = playerStatsQuery.data ?? new Set();
  const missingPlayerStatsByFixtureId = useMemo(() => {
    const map = new Map<string, NonNullable<(typeof missingPlayerStatsQuery.data)>[number]>();
    for (const fixture of missingPlayerStatsQuery.data || []) {
      map.set(fixture.fixture_id, fixture);
    }
    return map;
  }, [missingPlayerStatsQuery.data]);

  const roundsGrouped = useMemo(() => {
    const map = new Map<number, typeof allFixtures>();
    for (const f of allFixtures) {
      const r = f.round ?? 0;
      if (!map.has(r)) map.set(r, []);
      map.get(r)!.push(f);
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [allFixtures]);

  const hasActiveFilters = seasonId !== 'all' || teamId !== 'all' || status !== 'all' || roundInput !== '' || searchInput !== '';

  function scoreLabel(f: typeof allFixtures[0]) {
    if (f.home_total != null && f.away_total != null) {
      return `${f.home_total} - ${f.away_total}`;
    }
    return null;
  }

  function statusBadge(s: string | null) {
    if (s === 'FINAL') return { bg: 'rgba(52,211,153,0.18)', color: '#6ee7b7', label: 'FINAL' };
    if (s === 'LIVE') return { bg: 'rgba(251,191,36,0.18)', color: '#fcd34d', label: 'LIVE' };
    if (s === 'PENDING_RESULTS') return { bg: 'rgba(251,146,60,0.18)', color: '#fdba74', label: 'PENDING' };
    return { bg: 'rgba(148,163,184,0.12)', color: '#94a3b8', label: 'SCHED' };
  }

  function hasStats(f: typeof allFixtures[0]) {
    return f.home_total != null || f.away_total != null;
  }

  async function runRoundPlayerStatsOcr(round: number, fixturesInRound: typeof allFixtures) {
    if (seasonId === 'all') {
      pushToast('Select a season first so round OCR only targets one season.', 'info');
      return;
    }

    const fixtureIdsInRound = new Set(fixturesInRound.map((fixture) => fixture.id));
    const targets = (missingPlayerStatsQuery.data || []).filter(
      (fixture) =>
        fixture.round === round &&
        fixture.can_run_ocr &&
        fixtureIdsInRound.has(fixture.fixture_id),
    );

    if (!targets.length) {
      pushToast(`No submitted fixtures in Round ${round} are ready for OCR.`, 'info');
      return;
    }

    setRunningRound(round);
    let successCount = 0;
    let unmatchedFixtures = 0;

    try {
      for (const fixture of targets) {
        const homeTeam = fixture.home_team_id ? teamMetaById.get(fixture.home_team_id) : null;
        const awayTeam = fixture.away_team_id ? teamMetaById.get(fixture.away_team_id) : null;

        if (!fixture.home_team_id || !fixture.away_team_id || !homeTeam?.slug || !awayTeam?.slug) {
          unmatchedFixtures += 1;
          pushToast(
            `${fixture.home_team_name || 'Home'} vs ${fixture.away_team_name || 'Away'} is missing team slugs, so OCR was skipped.`,
            'error',
          );
          continue;
        }

        setRunningFixtureIds((prev) =>
          prev.includes(fixture.fixture_id) ? prev : [...prev, fixture.fixture_id],
        );

        try {
          const result = await runFixturePlayerStatsOcrWorkflow({
            fixtureId: fixture.fixture_id,
            homeTeamId: fixture.home_team_id,
            awayTeamId: fixture.away_team_id,
            homeTeamSlug: homeTeam.slug,
            awayTeamSlug: awayTeam.slug,
            homeTeamName: fixture.home_team_name || homeTeam.label || 'Home',
            awayTeamName: fixture.away_team_name || awayTeam.label || 'Away',
            token: adminToken(),
            autoApply: true,
          });

          successCount += 1;
          if (result.unmatchedRows > 0) unmatchedFixtures += 1;
        } catch (error) {
          unmatchedFixtures += 1;
          pushToast(
            error instanceof Error
              ? error.message
              : `Failed OCR for ${fixture.home_team_name || 'Home'} vs ${fixture.away_team_name || 'Away'}`,
            'error',
          );
        } finally {
          setRunningFixtureIds((prev) => prev.filter((fixtureId) => fixtureId !== fixture.fixture_id));
        }
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'fixtures'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'fixtures', 'playerStatsIds'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'missing-player-stats', seasonId] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'ocr-queue'] }),
      ]);

      pushToast(
        unmatchedFixtures > 0
          ? `Round ${round} OCR finished for ${successCount}/${targets.length} fixture(s). Some still need review.`
          : `Round ${round} OCR saved player stats for ${successCount} fixture(s).`,
        unmatchedFixtures > 0 ? 'info' : 'success',
      );
    } finally {
      setRunningRound(null);
    }
  }

  async function runAllRoundsPlayerStatsOcr() {
    if (seasonId === 'all') {
      pushToast('Select a season first so OCR only targets one season.', 'info');
      return;
    }

    const targets = (missingPlayerStatsQuery.data || []).filter((fixture) => fixture.can_run_ocr);
    if (!targets.length) {
      pushToast('No submitted fixtures across rounds are ready for OCR.', 'info');
      return;
    }

    setAllRoundsProgress({ done: 0, total: targets.length });
    let successCount = 0;
    let unmatchedFixtures = 0;

    try {
      for (let i = 0; i < targets.length; i++) {
        const fixture = targets[i];
        const homeTeam = fixture.home_team_id ? teamMetaById.get(fixture.home_team_id) : null;
        const awayTeam = fixture.away_team_id ? teamMetaById.get(fixture.away_team_id) : null;

        if (!fixture.home_team_id || !fixture.away_team_id || !homeTeam?.slug || !awayTeam?.slug) {
          unmatchedFixtures += 1;
          pushToast(
            `${fixture.home_team_name || 'Home'} vs ${fixture.away_team_name || 'Away'} is missing team slugs, so OCR was skipped.`,
            'error',
          );
          setAllRoundsProgress({ done: i + 1, total: targets.length });
          continue;
        }

        setRunningFixtureIds((prev) =>
          prev.includes(fixture.fixture_id) ? prev : [...prev, fixture.fixture_id],
        );

        try {
          const result = await runFixturePlayerStatsOcrWorkflow({
            fixtureId: fixture.fixture_id,
            homeTeamId: fixture.home_team_id,
            awayTeamId: fixture.away_team_id,
            homeTeamSlug: homeTeam.slug,
            awayTeamSlug: awayTeam.slug,
            homeTeamName: fixture.home_team_name || homeTeam.label || 'Home',
            awayTeamName: fixture.away_team_name || awayTeam.label || 'Away',
            token: adminToken(),
            autoApply: true,
          });
          successCount += 1;
          if (result.unmatchedRows > 0) unmatchedFixtures += 1;
        } catch (error) {
          unmatchedFixtures += 1;
          pushToast(
            error instanceof Error
              ? error.message
              : `Failed OCR for ${fixture.home_team_name || 'Home'} vs ${fixture.away_team_name || 'Away'}`,
            'error',
          );
        } finally {
          setRunningFixtureIds((prev) => prev.filter((fixtureId) => fixtureId !== fixture.fixture_id));
          setAllRoundsProgress({ done: i + 1, total: targets.length });
        }
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'fixtures'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'fixtures', 'playerStatsIds'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'missing-player-stats', seasonId] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'ocr-queue'] }),
      ]);

      pushToast(
        unmatchedFixtures > 0
          ? `All-rounds OCR finished for ${successCount}/${targets.length} fixture(s). Some still need review.`
          : `All-rounds OCR saved player stats for ${successCount} fixture(s).`,
        unmatchedFixtures > 0 ? 'info' : 'success',
      );
    } finally {
      setAllRoundsProgress(null);
    }
  }

  const allRoundsRunnableCount = useMemo(
    () => (missingPlayerStatsQuery.data || []).filter((fixture) => fixture.can_run_ocr).length,
    [missingPlayerStatsQuery.data],
  );

  const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(null);

  async function handleExportPhotos() {
    if (exportProgress !== null) return;
    setExportProgress({ done: 0, total: 0 });
    try {
      const result = await exportPlayerStatsPhotos({
        seasonId: seasonId !== 'all' ? seasonId : undefined,
        onProgress: (done, total) => setExportProgress({ done, total }),
      });
      if (result.total === 0) {
        pushToast('No player-stat photos found for rounds 1–11.', 'info');
      } else if (result.downloaded === 0) {
        pushToast(`All ${result.total} photos failed to download. Check your connection and try again.`, 'error');
      } else if (result.skipped > 0) {
        pushToast(
          `Downloaded ${result.downloaded} photo${result.downloaded !== 1 ? 's' : ''}. ${result.skipped} could not be fetched and were skipped.`,
          'info',
        );
      } else {
        pushToast(`Downloaded ${result.downloaded} player-stat photo${result.downloaded !== 1 ? 's' : ''} as ZIP.`, 'success');
      }
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Export failed.', 'error');
    } finally {
      setExportProgress(null);
    }
  }

  return (
    <div className="eg-admin-grid">
      <AdminCard title="Fixtures & Results" subtitle="Tap any fixture to edit scores, stats, and data">
        {/* ─── FILTER TOGGLE + VIEW MODE ──────────────── */}
        <div className="eg-fx-controls">
          <button
            type="button"
            className="eg-fx-filter-toggle"
            onClick={() => setFiltersOpen((p) => !p)}
          >
            {filtersOpen ? 'Hide Filters' : 'Filters'}
            {hasActiveFilters ? (
              <span className="eg-fx-filter-dot" />
            ) : null}
          </button>
          <div className="eg-fx-view-toggle">
            <button
              type="button"
              className={`eg-fx-view-btn${viewMode === 'rounds' ? ' is-active' : ''}`}
              onClick={() => setViewMode('rounds')}
            >
              Rounds
            </button>
            <button
              type="button"
              className={`eg-fx-view-btn${viewMode === 'table' ? ' is-active' : ''}`}
              onClick={() => setViewMode('table')}
            >
              Table
            </button>
          </div>
          {hasActiveFilters ? (
            <button
              type="button"
              className="eg-fx-clear-btn"
              onClick={() => {
                setSeasonId('all');
                setTeamId('all');
                setStatus('all');
                setRoundInput('');
                setSearchInput('');
              }}
            >
              Clear
            </button>
          ) : null}
          <button
            type="button"
            className="eg-fx-clear-btn"
            onClick={() => void runAllRoundsPlayerStatsOcr()}
            disabled={
              seasonId === 'all' ||
              allRoundsProgress !== null ||
              runningRound !== null ||
              missingPlayerStatsQuery.isLoading ||
              allRoundsRunnableCount === 0
            }
            title={
              seasonId === 'all'
                ? 'Select a season first to extract player stats from all uploaded photos'
                : allRoundsRunnableCount === 0
                  ? 'No submitted fixtures are ready for OCR'
                  : 'Run AI extraction on every uploaded player-stats photo across all rounds in the selected season'
            }
            style={{ marginLeft: 'auto' }}
          >
            {allRoundsProgress !== null
              ? `Extracting ${allRoundsProgress.done}/${allRoundsProgress.total}…`
              : seasonId === 'all'
                ? 'Extract Player Stats — Pick Season'
                : `Extract Player Stats — All Rounds${allRoundsRunnableCount ? ` (${allRoundsRunnableCount})` : ''}`}
          </button>
          <button
            type="button"
            className="eg-fx-clear-btn"
            onClick={handleSeedFinalsWeek1}
            disabled={seedingFinals}
            title={seasonId === 'all' ? 'Select a season first' : 'Seed Finals Week 1 from current ladder'}
          >
            {seedingFinals ? 'Seeding…' : 'Seed Finals Week 1'}
          </button>
          <button
            type="button"
            className="eg-fx-clear-btn"
            onClick={() => void handleExportPhotos()}
            disabled={exportProgress !== null}
            title="Download all player-stat photos for rounds 1–11 as a ZIP file"
          >
            {exportProgress !== null
              ? exportProgress.total > 0
                ? `Downloading ${exportProgress.done} of ${exportProgress.total}…`
                : 'Preparing…'
              : 'Download Player Stats Photos'}
          </button>
        </div>
        {seedNotice ? (
          <p
            className={
              seedNotice.type === 'error'
                ? 'eg-admin-error'
                : `eg-admin-muted eg-fx-seed-notice eg-fx-seed-notice--${seedNotice.type}`
            }
            style={{ margin: '8px 0 0' }}
          >
            {seedNotice.message}
          </p>
        ) : null}

        {/* ─── COLLAPSIBLE FILTERS ────────────────────── */}
        {filtersOpen ? (
          <div className="eg-fx-filters">
            <label className="eg-admin-inline-field">
              <span>Venue search</span>
              <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="MCG" />
            </label>
            <label className="eg-admin-inline-field">
              <span>Season</span>
              <select value={seasonId} onChange={(event) => setSeasonId(event.target.value)}>
                <option value="all">All seasons</option>
                {(seasonsQuery.data || []).map((season) => (
                  <option value={season.id} key={season.id}>
                    {season.name || season.slug || season.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="eg-admin-inline-field">
              <span>Team</span>
              <select value={teamId} onChange={(event) => setTeamId(event.target.value)}>
                <option value="all">All teams</option>
                {(teamsQuery.data || []).map((team) => (
                  <option value={team.id} key={team.id}>
                    {team.short_name || team.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="eg-admin-inline-field">
              <span>Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="all">Any</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="PENDING_RESULTS">Pending Results</option>
                <option value="LIVE">Live</option>
                <option value="FINAL">Final</option>
              </select>
            </label>
            <label className="eg-admin-inline-field narrow">
              <span>Round</span>
              <input value={roundInput} onChange={(event) => setRoundInput(event.target.value)} placeholder="e.g. 4" />
            </label>
          </div>
        ) : null}

        {fixturesQuery.isLoading ? <p className="eg-admin-muted">Loading fixtures...</p> : null}
        {fixturesQuery.error ? (
          <p className="eg-admin-error">
            {fixturesQuery.error instanceof Error ? fixturesQuery.error.message : 'Failed to load fixtures'}
          </p>
        ) : null}

        {!fixturesQuery.isLoading && !allFixtures.length ? (
          <EmptyState title="No fixtures" description="No fixtures matched your filters." />
        ) : null}

        {/* ─── ROUNDS VIEW ────────────────────────────── */}
        {viewMode === 'rounds' && roundsGrouped.length > 0 ? (
          <div className="eg-fx-rounds">
            {roundsGrouped.map(([round, fixtures]) => {
              const finalCount = fixtures.filter((f) => f.status === 'FINAL').length;
              const totalCount = fixtures.length;
              const allFinal = finalCount === totalCount;
              const roundMissingFixtures = (missingPlayerStatsQuery.data || []).filter((fixture) =>
                fixtures.some((row) => row.id === fixture.fixture_id),
              );
              const roundRunnableFixtures = roundMissingFixtures.filter((fixture) => fixture.can_run_ocr);
              const roundHasRunningFixture = fixtures.some((fixture) => runningFixtureIds.includes(fixture.id));
              return (
                <div key={round} className="eg-fx-round">
                  <div className={`eg-fx-round-header${allFinal ? ' eg-fx-round-header--done' : ''}`}>
                    <div className="eg-fx-round-headerMain">
                      <strong>Round {round || '?'}</strong>
                      <span className={allFinal ? 'eg-fx-round-complete' : ''}>
                        {finalCount}/{totalCount} final
                      </span>
                    </div>
                    <div className="eg-fx-round-headerActions">
                      {seasonId === 'all' ? (
                        <span className="eg-fx-round-ocrMeta">Pick a season to run round OCR</span>
                      ) : roundMissingFixtures.length > 0 ? (
                        <span className="eg-fx-round-ocrMeta">
                          {roundRunnableFixtures.length}/{roundMissingFixtures.length} OCR ready
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className="eg-fx-round-ocrBtn"
                        disabled={
                          seasonId === 'all' ||
                          runningRound === round ||
                          roundRunnableFixtures.length === 0 ||
                          missingPlayerStatsQuery.isLoading
                        }
                        onClick={() => void runRoundPlayerStatsOcr(round, fixtures)}
                      >
                        {runningRound === round || roundHasRunningFixture
                          ? `Running OCR${roundRunnableFixtures.length ? ` (${runningFixtureIds.filter((id) => fixtures.some((fixture) => fixture.id === id)).length}/${roundRunnableFixtures.length})` : ''}`
                          : `OCR Player Stats Round${roundRunnableFixtures.length ? ` (${roundRunnableFixtures.length})` : ''}`}
                      </button>
                    </div>
                  </div>
                  <div className="eg-fx-round-fixtures">
                    {fixtures.map((f) => {
                      const home = f.home_team_id ? teamById.get(f.home_team_id) || 'TBD' : 'TBD';
                      const away = f.away_team_id ? teamById.get(f.away_team_id) || 'TBD' : 'TBD';
                      const badge = statusBadge(f.status);
                      const scored = hasStats(f);
                      const score = scoreLabel(f);
                      const hasStats2 = fixtureIdsWithStats.has(f.id);
                      return (
                        <Link
                          key={f.id}
                          to={`/admin/fixtures/${f.id}`}
                          className={`eg-fx-card${scored ? ' eg-fx-card--scored' : ''}`}
                        >
                          <div className="eg-fx-card-top">
                            <div className="eg-fx-card-teams">
                              <span className="eg-fx-card-team">{home}</span>
                              <span className="eg-fx-card-vs">v</span>
                              <span className="eg-fx-card-team">{away}</span>
                            </div>
                            <div className="eg-fx-card-right">
                              <span
                                className="eg-admin-status-chip"
                                style={{
                                  background: badge.bg,
                                  color: badge.color,
                                }}
                              >
                                {badge.label}
                              </span>
                              {hasStats2 ? (
                                <span
                                  className="eg-fx-stats-tick"
                                  title="Player stats entered"
                                  aria-label="Player stats entered"
                                >
                                  ✓ Stats
                                </span>
                              ) : null}
                              {f.allow_late_submission ? (
                                <span
                                  className="eg-fx-stats-tick"
                                  title="Late submit approved"
                                  aria-label="Late submit approved"
                                >
                                  Late OK
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="eg-fx-card-bottom">
                            {score ? (
                              <span className="eg-fx-card-score">{score}</span>
                            ) : (
                              <span className="eg-fx-card-noscore">No score</span>
                            )}
                            <span className="eg-fx-card-venue">{f.venue || '—'}</span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {/* ─── TABLE VIEW ─────────────────────────────── */}
        {viewMode === 'table' && allFixtures.length > 0 ? (
          <div className="eg-admin-table-wrap">
            <table className="eg-admin-table">
              <thead>
                <tr>
                  <th>Fixture</th>
                  <th>Status</th>
                  <th>Late Submit</th>
                  <th>Start Time</th>
                  <th>Venue</th>
                  <th>Score</th>
                  <th>Danger Zone</th>
                </tr>
              </thead>
              <tbody>
                {allFixtures.map((fixture) => {
                  const home = fixture.home_team_id ? teamById.get(fixture.home_team_id) || fixture.home_team_id : 'TBD';
                  const away = fixture.away_team_id ? teamById.get(fixture.away_team_id) || fixture.away_team_id : 'TBD';

                  return (
                    <tr key={fixture.id}>
                      <td data-label="Fixture">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Link to={`/admin/fixtures/${fixture.id}`} style={{ color: '#def0ff', textDecoration: 'none' }}>
                            <strong>
                              R{fixture.round ?? '?'}: {home} vs {away}
                            </strong>
                          </Link>
                          {fixtureIdsWithStats.has(fixture.id) ? (
                            <span
                              className="eg-fx-stats-tick"
                              title="Player stats entered"
                              aria-label="Player stats entered"
                            >
                              ✓ Stats
                            </span>
                          ) : null}
                        </div>
                        <p className="mono">{fixture.id}</p>
                      </td>
                      <td data-label="Status">
                        <select
                          value={fixture.status || ''}
                          onChange={(event) =>
                            fixtureMutation.mutate({
                              mode: 'status',
                              fixtureId: fixture.id,
                              status: event.target.value,
                            })
                          }
                        >
                          <option value="SCHEDULED">Scheduled</option>
                          <option value="PENDING_RESULTS">Pending Results</option>
                          <option value="LIVE">Live</option>
                          <option value="FINAL">Final</option>
                        </select>
                      </td>
                      <td data-label="Late Submit">
                        <label className="eg-admin-inline-toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(fixture.allow_late_submission)}
                            onChange={(event) =>
                              fixtureMutation.mutate({
                                mode: 'lateApproval',
                                fixtureId: fixture.id,
                                allowLateSubmission: event.target.checked,
                              })
                            }
                          />
                          <span>{fixture.allow_late_submission ? 'Approved' : 'Locked'}</span>
                        </label>
                      </td>
                      <td data-label="Start Time">
                        <div className="eg-admin-inline-action">
                          <input
                            type="datetime-local"
                            defaultValue={
                              fixture.start_time
                                ? new Date(fixture.start_time).toISOString().slice(0, 16)
                                : ''
                            }
                            onBlur={(event) => {
                              if (!event.target.value) return;
                              fixtureMutation.mutate({
                                mode: 'startTime',
                                fixtureId: fixture.id,
                                startTime: new Date(event.target.value).toISOString(),
                              });
                            }}
                          />
                        </div>
                        <p>{formatDateTime(fixture.start_time)}</p>
                      </td>
                      <td data-label="Venue">
                        <div className="eg-admin-inline-action">
                          <input
                            defaultValue={fixture.venue || ''}
                            onBlur={(event) => {
                              const value = event.target.value.trim();
                              if (!value) return;
                              fixtureMutation.mutate({
                                mode: 'venue',
                                fixtureId: fixture.id,
                                venue: value,
                              });
                            }}
                          />
                        </div>
                      </td>
                      <td data-label="Score">
                        {fixture.home_total ?? '—'} - {fixture.away_total ?? '—'}
                      </td>
                      <td data-label="Danger Zone">
                        <div className="eg-admin-danger-actions">
                          <button
                            type="button"
                            onClick={() => {
                              if (!window.confirm(`Swap home/away teams for fixture ${fixture.id}?`)) return;
                              fixtureMutation.mutate({ mode: 'swap', fixtureId: fixture.id });
                            }}
                          >
                            Swap Teams
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!window.confirm(`Clear scores for fixture ${fixture.id}? This is destructive.`)) return;
                              fixtureMutation.mutate({ mode: 'clear', fixtureId: fixture.id });
                            }}
                          >
                            Clear Scores
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </AdminCard>
    </div>
  );
}
