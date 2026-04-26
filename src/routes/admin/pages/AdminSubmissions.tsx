import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AdminPermissionError,
  listCompetitions,
  listTeams,
  listMissingPlayerStatsFixtures,
  listSeasons,
  listFixtureSubmissions,
  listOcrQueue,
  setOcrQueueStatus,
} from '@/lib/adminApi';
import { runFixturePlayerStatsOcrWorkflow } from '@/lib/adminPlayerStatsOcrWorkflow';
import type { AdminMissingPlayerStatsFixture, AdminOcrQueueItem, EgJobStatus } from '@/lib/adminTypes';
import { useAdminLayoutContext } from '../AdminLayout';
import { formatDateTime, useDebouncedValue, usePagination } from '../useAdminTools';
import { AdminCard, EmptyState, Pager } from './AdminUi';

const PAGE_SIZE = 15;

export default function AdminSubmissions() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { globalSearch, pushToast, adminToken } = useAdminLayoutContext();

  const [submissionPage, setSubmissionPage] = useState(1);
  const [ocrPage, setOcrPage] = useState(1);
  const [status, setStatus] = useState<'all' | string>('all');
  const [ocrStatus, setOcrStatus] = useState<EgJobStatus | 'all'>('all');
  const [searchInput, setSearchInput] = useState('');
  const [missingSeasonId, setMissingSeasonId] = useState('');
  const [runningFixtureIds, setRunningFixtureIds] = useState<string[]>([]);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);

  const search = useDebouncedValue((searchInput || globalSearch).trim(), 300);

  const submissionsQuery = useQuery({
    queryKey: ['admin', 'fixture-submissions', submissionPage, status, search],
    queryFn: () => listFixtureSubmissions({ page: submissionPage, pageSize: PAGE_SIZE, status, search }),
    placeholderData: keepPreviousData,
    refetchInterval: 20_000,
  });

  const ocrQuery = useQuery({
    queryKey: ['admin', 'ocr-queue', ocrPage, ocrStatus, search],
    queryFn: () => listOcrQueue({ page: ocrPage, pageSize: PAGE_SIZE, status: ocrStatus, search }),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  });

  const seasonsQuery = useQuery({
    queryKey: ['admin', 'seasons', 'lookup'],
    queryFn: () => listSeasons(''),
    staleTime: 10 * 60_000,
  });

  const competitionsQuery = useQuery({
    queryKey: ['admin', 'competitions', 'lookup'],
    queryFn: () => listCompetitions(''),
    staleTime: 10 * 60_000,
  });

  const teamsQuery = useQuery({
    queryKey: ['admin', 'teams', 'lookup'],
    queryFn: () => listTeams('', 250),
    staleTime: 10 * 60_000,
  });

  const defaultSeasonId = useMemo(() => {
    const activeCompetition = (competitionsQuery.data || []).find((competition) => competition.active && competition.season_id);
    if (activeCompetition?.season_id) return activeCompetition.season_id;
    return seasonsQuery.data?.[0]?.id || '';
  }, [competitionsQuery.data, seasonsQuery.data]);

  useEffect(() => {
    if (!missingSeasonId && defaultSeasonId) {
      setMissingSeasonId(defaultSeasonId);
    }
  }, [defaultSeasonId, missingSeasonId]);

  const missingFixturesQuery = useQuery({
    queryKey: ['admin', 'missing-player-stats', missingSeasonId],
    queryFn: () => listMissingPlayerStatsFixtures(missingSeasonId),
    enabled: Boolean(missingSeasonId),
    placeholderData: keepPreviousData,
    refetchInterval: 15_000,
  });

  const ocrMutation = useMutation({
    mutationFn: (args: { id: string; status: EgJobStatus; error?: string }) =>
      setOcrQueueStatus({ queueId: args.id, status: args.status, error: args.error }),
    onSuccess: () => {
      pushToast('OCR item updated.', 'success');
      queryClient.invalidateQueries({ queryKey: ['admin', 'ocr-queue'] });
    },
    onError: (error) => {
      if (error instanceof AdminPermissionError) {
        pushToast('Admin privileges required for this action.', 'error');
      } else {
        pushToast(error instanceof Error ? error.message : 'Failed to update OCR item', 'error');
      }
    },
  });

  const submissionPager = usePagination(submissionsQuery.data?.total ?? 0, PAGE_SIZE);
  const ocrPager = usePagination(ocrQuery.data?.total ?? 0, PAGE_SIZE);

  const selectedOcrJson = useMemo(() => {
    const map = new Map<string, AdminOcrQueueItem>();
    for (const row of ocrQuery.data?.rows || []) map.set(row.id, row);
    return map;
  }, [ocrQuery.data?.rows]);

  const missingFixtures = missingFixturesQuery.data || [];
  const teamMetaById = useMemo(() => {
    const map = new Map<string, { slug: string; label: string }>();
    for (const team of teamsQuery.data || []) {
      map.set(team.id, {
        slug: String(team.slug || team.team_key || '').trim(),
        label: team.short_name || team.name,
      });
    }
    return map;
  }, [teamsQuery.data]);

  const runnableMissingFixtures = useMemo(
    () => missingFixtures.filter((fixture) => fixture.can_run_ocr),
    [missingFixtures],
  );

  const [expandedOcrId, setExpandedOcrId] = useState<string>('');

  async function runFixtureOcr(fixture: AdminMissingPlayerStatsFixture) {
    const homeTeam = fixture.home_team_id ? teamMetaById.get(fixture.home_team_id) : null;
    const awayTeam = fixture.away_team_id ? teamMetaById.get(fixture.away_team_id) : null;
    if (!fixture.home_team_id || !fixture.away_team_id || !homeTeam?.slug || !awayTeam?.slug) {
      pushToast('Fixture teams or slugs are missing, so OCR cannot run yet.', 'error');
      return false;
    }

    setRunningFixtureIds((prev) => (prev.includes(fixture.fixture_id) ? prev : [...prev, fixture.fixture_id]));
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
      const extractedRows = Number(result.summary.playerStatRows || 0) || 0;
      const importedRows = Number(result.importedRows || 0) || 0;
      pushToast(
        result.unmatchedRows > 0
          ? `${fixture.home_team_name || 'Home'} vs ${fixture.away_team_name || 'Away'} imported ${importedRows}/${extractedRows} row(s); ${result.unmatchedRows} need review.`
          : `${fixture.home_team_name || 'Home'} vs ${fixture.away_team_name || 'Away'} imported ${importedRows} row(s).`,
        result.unmatchedRows > 0 ? 'info' : 'success',
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'ocr-queue'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'missing-player-stats', missingSeasonId] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'fixtures', 'playerStatsIds'] }),
      ]);
      return true;
    } catch (error) {
      pushToast(error instanceof Error ? error.message : `Failed to run OCR for fixture ${fixture.fixture_id}`, 'error');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'ocr-queue'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'missing-player-stats', missingSeasonId] }),
      ]);
      return false;
    } finally {
      setRunningFixtureIds((prev) => prev.filter((fixtureId) => fixtureId !== fixture.fixture_id));
    }
  }

  async function runAllMissingOcr() {
    if (!runnableMissingFixtures.length) return;

    setBatchProgress({ done: 0, total: runnableMissingFixtures.length });
    try {
      for (let index = 0; index < runnableMissingFixtures.length; index += 1) {
        await runFixtureOcr(runnableMissingFixtures[index]);
        setBatchProgress({ done: index + 1, total: runnableMissingFixtures.length });
      }
      pushToast(`Finished OCR batch for ${runnableMissingFixtures.length} fixture(s).`, 'success');
    } finally {
      setBatchProgress(null);
    }
  }

  return (
    <div className="eg-admin-stack">
      <AdminCard
        title="Missing Player Stats"
        subtitle="Submitted fixtures without saved player stats. This now reads the uploaded player-stat screenshots and saves the matched rows straight into fixture stats."
        actions={
          <div className="eg-admin-inline-buttons">
            <button
              type="button"
              onClick={() => void runAllMissingOcr()}
              disabled={Boolean(batchProgress) || runnableMissingFixtures.length === 0}
            >
              {batchProgress
                ? `Running ${batchProgress.done}/${batchProgress.total}`
                : `Auto OCR + Save All Missing (${runnableMissingFixtures.length})`}
            </button>
          </div>
        }
      >
        <div className="eg-admin-toolbar wrap">
          <label className="eg-admin-inline-field">
            <span>Season</span>
            <select value={missingSeasonId} onChange={(event) => setMissingSeasonId(event.target.value)}>
              <option value="">Select season</option>
              {(seasonsQuery.data || []).map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name || season.slug || season.id}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="eg-admin-stat-grid">
          <article>
            <h4>{missingFixtures.length}</h4>
            <p>Submitted Missing Stats</p>
          </article>
          <article>
            <h4>{runnableMissingFixtures.length}</h4>
            <p>Ready For OCR</p>
          </article>
          <article>
            <h4>{missingFixtures.filter((fixture) => !fixture.can_run_ocr).length}</h4>
            <p>Blocked</p>
          </article>
          <article>
            <h4>{missingFixtures.filter((fixture) => fixture.latest_ocr_status === 'failed').length}</h4>
            <p>Latest OCR Failed</p>
          </article>
        </div>

        {missingFixturesQuery.isLoading ? <p className="eg-admin-muted">Loading missing player stats…</p> : null}
        {missingFixturesQuery.error ? (
          <p className="eg-admin-error">
            {missingFixturesQuery.error instanceof Error ? missingFixturesQuery.error.message : 'Failed to load missing player stats'}
          </p>
        ) : null}

        {!missingFixturesQuery.isLoading && !missingFixtures.length ? (
          <EmptyState title="No missing player stats" description="Every submitted fixture in the selected season already has player stats, or no submissions exist yet." />
        ) : (
          <div className="eg-admin-list">
            {missingFixtures.map((fixture) => {
              const isRunning = runningFixtureIds.includes(fixture.fixture_id);
              return (
                <article key={fixture.fixture_id}>
                  <div>
                    <strong>
                      {fixture.home_team_name || 'Home'} vs {fixture.away_team_name || 'Away'}
                    </strong>
                    <span>Round {fixture.round ?? '?'}</span>
                  </div>
                  <p>
                    Submitted: {fixture.submitted_at ? formatDateTime(fixture.submitted_at) : 'Unknown'}
                    {' · '}
                    Screenshots: {fixture.screenshot_count}
                    {' · '}
                    Latest OCR: {fixture.latest_ocr_status || 'none'}
                  </p>
                  {fixture.latest_ocr_updated_at ? (
                    <p>Last OCR update: {formatDateTime(fixture.latest_ocr_updated_at)}</p>
                  ) : null}
                  {!fixture.can_run_ocr && fixture.blocked_reason ? <p>{fixture.blocked_reason}</p> : null}
                  <div className="eg-admin-inline-buttons">
                    <button
                      type="button"
                      onClick={() => void runFixtureOcr(fixture)}
                      disabled={isRunning || !fixture.can_run_ocr || Boolean(batchProgress)}
                    >
                      {isRunning ? 'Running OCR…' : 'Auto OCR + Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/fixtures/${fixture.fixture_id}`)}
                    >
                      Open Fixture
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </AdminCard>

      <div className="eg-admin-grid two">
        <AdminCard title="Fixture Submissions" subtitle="Incoming match submissions from coaches">
        <div className="eg-admin-toolbar">
          <label className="eg-admin-inline-field">
            <span>Search</span>
            <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Fixture ID or notes" />
          </label>
          <label className="eg-admin-inline-field">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
        </div>

        {submissionsQuery.isLoading ? <p className="eg-admin-muted">Loading submissions…</p> : null}
        {submissionsQuery.error ? (
          <p className="eg-admin-error">
            {submissionsQuery.error instanceof Error
              ? submissionsQuery.error.message
              : 'Failed to load submissions'}
          </p>
        ) : null}

        {!submissionsQuery.isLoading && !(submissionsQuery.data?.rows.length || 0) ? (
          <EmptyState title="No submissions" description="No fixture submissions match the current filters." />
        ) : (
          <>
            <div className="eg-admin-list">
              {(submissionsQuery.data?.rows || []).map((submission) => (
                <article key={submission.id}>
                  <div>
                    <strong>{submission.fixture_id}</strong>
                    <span>{submission.status || 'unknown'}</span>
                  </div>
                  <p>{submission.notes || 'No notes'}</p>
                  <p>{formatDateTime(submission.updated_at)}</p>
                </article>
              ))}
            </div>
            <Pager
              page={submissionPage}
              pages={submissionPager.pages}
              onPage={setSubmissionPage}
              totalLabel={submissionPager.label}
            />
          </>
        )}
        </AdminCard>

        <AdminCard title="OCR Queue" subtitle="Retry, mark failed, and inspect JSON results">
        <div className="eg-admin-toolbar">
          <label className="eg-admin-inline-field">
            <span>Status</span>
            <select value={ocrStatus} onChange={(event) => setOcrStatus(event.target.value as EgJobStatus | 'all')}>
              <option value="all">All</option>
              <option value="queued">Queued</option>
              <option value="running">Running</option>
              <option value="succeeded">Succeeded</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
        </div>

        {ocrQuery.isLoading ? <p className="eg-admin-muted">Loading OCR queue…</p> : null}
        {ocrQuery.error ? (
          <p className="eg-admin-error">
            {ocrQuery.error instanceof Error ? ocrQuery.error.message : 'Failed to load OCR queue'}
          </p>
        ) : null}

        {!ocrQuery.isLoading && !(ocrQuery.data?.rows.length || 0) ? (
          <EmptyState title="No OCR items" description="Queue OCR jobs to populate this list." />
        ) : (
          <>
            <div className="eg-admin-list">
              {(ocrQuery.data?.rows || []).map((row) => (
                <article key={row.id}>
                  <div>
                    <strong>{row.fixture_id || 'No fixture'}</strong>
                    <span>{row.status}</span>
                  </div>
                  <p>{row.error || 'No error'}</p>
                  <p>{formatDateTime(row.updated_at)}</p>
                  <div className="eg-admin-inline-buttons">
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
                    <button
                      type="button"
                      onClick={() => setExpandedOcrId((prev) => (prev === row.id ? '' : row.id))}
                    >
                      {expandedOcrId === row.id ? 'Hide JSON' : 'View JSON'}
                    </button>
                  </div>
                  {expandedOcrId === row.id ? (
                    <pre className="eg-admin-json">{JSON.stringify(selectedOcrJson.get(row.id)?.result || {}, null, 2)}</pre>
                  ) : null}
                </article>
              ))}
            </div>
            <Pager page={ocrPage} pages={ocrPager.pages} onPage={setOcrPage} totalLabel={ocrPager.label} />
          </>
        )}
        </AdminCard>
      </div>
    </div>
  );
}
