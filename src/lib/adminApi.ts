import { requireSupabaseClient } from './supabaseClient';
import { saveAdminFixture, startSuperadminAutoSession } from './adminConsoleRepo';
import { fetchAllFixtures, fetchSeasonFixturesBySeasonId, normalizeFixtureStatus } from './fixturesRepo';
import type {
  AdminAuditLog,
  AdminCompetition,
  AdminContentBlock,
  AdminFeatureFlag,
  AdminFixture,
  AdminFixtureSubmissionImage,
  AdminFixtureSubmission,
  AdminJob,
  AdminMissingPlayerStatsFixture,
  AdminOcrQueueItem,
  AdminPlayerStatsOcrDraft,
  AdminPlayerStatsOcrResult,
  AdminPageParams,
  AdminPagedResult,
  AdminPlayer,
  AdminProfile,
  AdminSeason,
  AdminTeam,
  EgJobStatus,
  EgRole,
  StorageObjectItem,
} from './adminTypes';

const supabase = requireSupabaseClient();

const ADMIN_ERROR_MESSAGE = 'Admin privileges required';
const ADMIN_WRITE_SESSION_MESSAGE = 'Admin write access is locked. Enter the admin passcode in the header to save manual results.';

export class AdminPermissionError extends Error {
  constructor(message = ADMIN_ERROR_MESSAGE) {
    super(message);
    this.name = 'AdminPermissionError';
  }
}

function unwrapRpcError(error: unknown): never {
  const message = String((error as { message?: string })?.message || 'Unknown RPC error');
  if (message.includes(ADMIN_ERROR_MESSAGE)) {
    throw new AdminPermissionError();
  }
  throw new Error(message);
}

function isMissingRpcError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message || '').toLowerCase();
  return (
    message.includes('does not exist') ||
    message.includes('undefined function') ||
    message.includes('could not find the function') ||
    message.includes('schema cache')
  );
}

function isAdminSessionError(error: unknown): boolean {
  const message = String((error as { message?: string })?.message || '').toLowerCase();
  return (
    message.includes('session expired') ||
    message.includes('admin session') ||
    message.includes('invalid token') ||
    message.includes('token') ||
    message.includes('passcode')
  );
}

function rangeFromPage({ page, pageSize }: AdminPageParams): [number, number] {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(100, Math.max(5, pageSize));
  const from = (safePage - 1) * safeSize;
  return [from, from + safeSize - 1];
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeNullableInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.trunc(numeric);
  return rounded >= 0 ? rounded : null;
}

function normalizePlayerStatsOcrDraft(value: unknown): AdminPlayerStatsOcrDraft | null {
  const row = normalizeJsonObject(value);
  const fixtureId = String(row.fixtureId || '').trim();
  const homeTeamSlug = String(row.homeTeamSlug || '').trim();
  const awayTeamSlug = String(row.awayTeamSlug || '').trim();
  const playerStats = Array.isArray(row.playerStats) ? row.playerStats : [];

  if (!fixtureId || !homeTeamSlug || !awayTeamSlug || !playerStats.length) {
    return null;
  }

  return {
    fixtureId,
    homeTeamSlug,
    awayTeamSlug,
    playerStats: playerStats
      .map((item) => {
        const raw = normalizeJsonObject(item);
        const playerRef = normalizeJsonObject(raw.playerRef);
        const teamSlug = String(raw.teamSlug || '').trim();
        if (!teamSlug) return null;
        return {
          teamSlug,
          playerRef: {
            playerId: String(playerRef.playerId || '').trim() || null,
            aflPlayerId: normalizeNullableInteger(playerRef.aflPlayerId),
            playerName: String(playerRef.playerName || '').trim() || null,
          },
          kicks: normalizeNullableInteger(raw.kicks),
          handballs: normalizeNullableInteger(raw.handballs),
          disposals: normalizeNullableInteger(raw.disposals),
          marks: normalizeNullableInteger(raw.marks),
          tackles: normalizeNullableInteger(raw.tackles),
          fantasyPoints: normalizeNullableInteger(raw.fantasyPoints ?? raw.fantasy_points),
        };
      })
      .filter(Boolean) as AdminPlayerStatsOcrDraft['playerStats'],
    warnings: Array.isArray(row.warnings)
      ? row.warnings.map((warning) => String(warning || '').trim()).filter(Boolean)
      : [],
  };
}

function normalizePlayerStatsOcrResult(value: unknown): AdminPlayerStatsOcrResult | null {
  const row = normalizeJsonObject(value);
  const draft =
    normalizePlayerStatsOcrDraft(row.draft) ||
    normalizePlayerStatsOcrDraft(value);

  if (!draft) return null;

  return {
    draft,
    warnings: Array.isArray(row.warnings)
      ? row.warnings.map((warning) => String(warning || '').trim()).filter(Boolean)
      : draft.warnings || [],
    summary: normalizeJsonObject(row.summary),
    rawText: typeof row.rawText === 'string' ? row.rawText : null,
    rawResponseId: typeof row.rawResponseId === 'string' ? row.rawResponseId : null,
    model: typeof row.model === 'string' ? row.model : null,
  };
}

function isLikelyUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

function chunkValues<T>(values: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

async function safeSelect<T>(table: string, selectSql: string, limit = 100): Promise<T[]> {
  const { data, error } = await supabase.from(table).select(selectSql).limit(limit);
  if (error) {
    if (error.message.includes('does not exist')) return [];
    throw new Error(error.message);
  }
  return (data || []) as T[];
}

export async function getCurrentAdminProfile(): Promise<AdminProfile | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  if (!data.user?.id) return null;

  const { data: profile, error: profileError } = await supabase
    .from('eg_profiles')
    .select('*')
    .eq('user_id', data.user.id)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  return (profile as AdminProfile | null) ?? null;
}

export async function listProfiles(
  params: AdminPageParams & {
    search?: string;
    role?: EgRole | 'all';
    teamId?: string | 'all';
    banned?: 'all' | 'active' | 'banned';
  },
): Promise<AdminPagedResult<AdminProfile>> {
  const [from, to] = rangeFromPage(params);
  let query = supabase.from('eg_profiles').select('*', { count: 'exact' });

  if (params.role && params.role !== 'all') query = query.eq('role', params.role);
  if (params.teamId && params.teamId !== 'all') query = query.eq('team_id', params.teamId);
  if (params.banned === 'active') query = query.eq('is_banned', false);
  if (params.banned === 'banned') query = query.eq('is_banned', true);
  if (params.search?.trim()) {
    const q = params.search.trim();
    query = query.or(
      `display_name.ilike.%${q}%,psn.ilike.%${q}%,email.ilike.%${q}%`,
    );
  }

  const { data, error, count } = await query.order('updated_at', { ascending: false }).range(from, to);
  if (error) throw new Error(error.message);

  return {
    rows: ((data || []) as AdminProfile[]) ?? [],
    total: count ?? 0,
  };
}

export async function listTeams(search = '', limit = 250): Promise<AdminTeam[]> {
  let query = supabase
    .from('eg_teams')
    .select('id,name,short_name,slug,team_key,logo_url')
    .order('name', { ascending: true })
    .limit(limit);

  if (search.trim()) {
    const q = search.trim();
    query = query.or(`name.ilike.%${q}%,short_name.ilike.%${q}%,slug.ilike.%${q}%,team_key.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as AdminTeam[];
}

export async function listSeasons(search = ''): Promise<AdminSeason[]> {
  let query = supabase.from('eg_seasons').select('id,name,slug,created_at').order('created_at', { ascending: false }).limit(200);
  if (search.trim()) {
    const q = search.trim();
    query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%`);
  }
  const { data, error } = await query;
  if (error) {
    if (error.message.includes('does not exist')) return [];
    throw new Error(error.message);
  }
  return (data || []) as AdminSeason[];
}

export async function listCompetitions(search = ''): Promise<AdminCompetition[]> {
  const attempts = [
    'id,name,slug,season_id,active',
    'id,name,season_id,active',
    'id,name,slug',
    'id,name',
  ] as const;

  for (const selectCols of attempts) {
    let query = supabase.from('eg_competitions').select(selectCols).limit(200);
    if (search.trim()) {
      const q = search.trim();
      query = query.or(`name.ilike.%${q}%,slug.ilike.%${q}%`);
    }
    const { data, error } = await query;
    if (!error) {
      return ((data || []) as unknown[]) as AdminCompetition[];
    }
    if (!error.message.includes('does not exist') && !error.message.includes('column')) {
      throw new Error(error.message);
    }
  }

  return [];
}

export async function listPlayers(
  params: AdminPageParams & { search?: string; teamId?: string | 'all' },
): Promise<AdminPagedResult<AdminPlayer>> {
  const [from, to] = rangeFromPage(params);
  let query = supabase
    .from('eg_players')
    .select('id,name,full_name,display_name,team_id', { count: 'exact' });

  if (params.search?.trim()) {
    const q = params.search.trim();
    query = query.or(`name.ilike.%${q}%,full_name.ilike.%${q}%,display_name.ilike.%${q}%`);
  }

  if (params.teamId && params.teamId !== 'all') {
    query = query.eq('team_id', params.teamId);
  }

  const { data, error, count } = await query.order('name', { ascending: true }).range(from, to);
  if (error) throw new Error(error.message);

  return {
    rows: (data || []) as AdminPlayer[],
    total: count ?? 0,
  };
}

export async function listFixtures(
  params: AdminPageParams & {
    seasonId?: string | 'all';
    round?: number | null;
    teamId?: string | 'all';
    status?: string | 'all';
    search?: string;
  },
): Promise<AdminPagedResult<AdminFixture>> {
  const [from, to] = rangeFromPage(params);
  const fixtures =
    params.seasonId && params.seasonId !== 'all'
      ? (await fetchSeasonFixturesBySeasonId(params.seasonId, { limit: 3000, offset: 0 })).fixtures
      : await fetchAllFixtures({ limit: 3000, offset: 0 });

  const rows = fixtures
    .filter((fixture) => (params.round != null ? fixture.round === params.round : true))
    .filter((fixture) => (params.status && params.status !== 'all' ? normalizeFixtureStatus(fixture.status, fixture) === params.status : true))
    .filter((fixture) =>
      params.teamId && params.teamId !== 'all'
        ? fixture.home_team_id === params.teamId || fixture.away_team_id === params.teamId
        : true,
    )
    .filter((fixture) => {
      if (!params.search?.trim()) return true;
      const q = params.search.trim().toLowerCase();
      return String(fixture.venue || '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const roundDiff = (b.round || 0) - (a.round || 0);
      if (roundDiff !== 0) return roundDiff;
      const aTime = a.start_time ? new Date(a.start_time).getTime() : -1;
      const bTime = b.start_time ? new Date(b.start_time).getTime() : -1;
      return bTime - aTime;
    });

  return {
    rows: rows.slice(from, to + 1).map((fixture) => ({
      id: fixture.id,
      season_id: fixture.season_id,
      round: fixture.round,
      status: fixture.status,
      venue: fixture.venue,
      start_time: fixture.start_time,
      home_team_id: fixture.home_team_id,
      away_team_id: fixture.away_team_id,
      home_team_name: fixture.home_team_name,
      away_team_name: fixture.away_team_name,
      home_total: fixture.home_total,
      away_total: fixture.away_total,
      home_goals: fixture.home_goals,
      home_behinds: fixture.home_behinds,
      away_goals: fixture.away_goals,
      away_behinds: fixture.away_behinds,
      submitted_at: fixture.submitted_at,
      verified_at: fixture.verified_at,
      disputed_at: fixture.disputed_at,
      corrected_at: fixture.corrected_at,
      allow_late_submission: fixture.allow_late_submission,
      late_submission_approved_at: fixture.late_submission_approved_at,
      late_submission_approved_by: fixture.late_submission_approved_by,
    })),
    total: rows.length,
  };
}

export async function listFeatureFlags(search = ''): Promise<AdminFeatureFlag[]> {
  let query = supabase
    .from('eg_feature_flags')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(250);

  if (search.trim()) {
    const q = search.trim();
    query = query.or(`key.ilike.%${q}%,description.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return ((data || []) as AdminFeatureFlag[]).map((row) => ({
    ...row,
    payload: normalizeJsonObject(row.payload),
  }));
}

export async function listContentBlocks(search = ''): Promise<AdminContentBlock[]> {
  let query = supabase
    .from('eg_content_blocks')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(250);

  if (search.trim()) {
    const q = search.trim();
    query = query.or(`key.ilike.%${q}%,title.ilike.%${q}%,body.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return ((data || []) as AdminContentBlock[]).map((row) => ({
    ...row,
    payload: normalizeJsonObject(row.payload),
  }));
}

export async function listJobs(
  params: AdminPageParams & { status?: EgJobStatus | 'all'; type?: string; search?: string },
): Promise<AdminPagedResult<AdminJob>> {
  const [from, to] = rangeFromPage(params);
  let query = supabase.from('eg_admin_jobs').select('*', { count: 'exact' });

  if (params.status && params.status !== 'all') query = query.eq('status', params.status);
  if (params.type?.trim()) query = query.ilike('type', `%${params.type.trim()}%`);
  if (params.search?.trim()) query = query.or(`message.ilike.%${params.search.trim()}%,error.ilike.%${params.search.trim()}%`);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);

  return {
    rows: ((data || []) as AdminJob[]).map((row) => ({
      ...row,
      input: normalizeJsonObject(row.input),
      output: normalizeJsonObject(row.output),
    })),
    total: count ?? 0,
  };
}

export async function listOcrQueue(
  params: AdminPageParams & { status?: EgJobStatus | 'all'; search?: string },
): Promise<AdminPagedResult<AdminOcrQueueItem>> {
  const [from, to] = rangeFromPage(params);
  let query = supabase.from('eg_ocr_queue').select('*', { count: 'exact' });

  if (params.status && params.status !== 'all') query = query.eq('status', params.status);
  if (params.search?.trim()) {
    const q = params.search.trim();
    if (isLikelyUuid(q)) {
      query = query.eq('fixture_id', q);
    } else {
      query = query.ilike('error', `%${q}%`);
    }
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);

  return {
    rows: ((data || []) as AdminOcrQueueItem[]).map((row) => ({
      ...row,
      source_images: Array.isArray(row.source_images) ? row.source_images : [],
      result: normalizeJsonObject(row.result),
    })),
    total: count ?? 0,
  };
}

export async function listFixtureSubmissions(
  params: AdminPageParams & { status?: string | 'all'; search?: string },
): Promise<AdminPagedResult<AdminFixtureSubmission>> {
  const [from, to] = rangeFromPage(params);
  let query = supabase
    .from('submissions')
    .select('id,fixture_id,submitted_by,team_id,notes,submitted_at', {
      count: 'exact',
    });

  if (params.status && params.status !== 'all' && params.status !== 'submitted') {
    return { rows: [], total: 0 };
  }
  if (params.search?.trim()) {
    const q = params.search.trim();
    if (isLikelyUuid(q)) {
      query = query.eq('fixture_id', q);
    } else {
      query = query.ilike('notes', `%${q}%`);
    }
  }

  const { data, error, count } = await query
    .order('submitted_at', { ascending: false })
    .range(from, to);

  if (error) {
    if (error.message.includes('does not exist')) {
      return { rows: [], total: 0 };
    }
    throw new Error(error.message);
  }

  return {
    rows: ((data || []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id || ''),
      fixture_id: String(row.fixture_id || ''),
      submitted_by_user_id: row.submitted_by ? String(row.submitted_by) : null,
      submitted_team_id: row.team_id ? String(row.team_id) : null,
      status: 'submitted',
      source: 'submissions',
      notes: row.notes ? String(row.notes) : null,
      created_at: String(row.submitted_at || ''),
      updated_at: String(row.submitted_at || ''),
    })),
    total: count ?? 0,
  };
}

export async function listAuditLogs(
  params: AdminPageParams & {
    actorUserId?: string;
    action?: string | 'all';
    entityTable?: string;
    keyword?: string;
    dateFrom?: string;
    dateTo?: string;
  },
): Promise<AdminPagedResult<AdminAuditLog>> {
  const [from, to] = rangeFromPage(params);
  let query = supabase.from('eg_audit_log').select('*', { count: 'exact' });

  if (params.actorUserId?.trim()) query = query.eq('actor_user_id', params.actorUserId.trim());
  if (params.action && params.action !== 'all') query = query.eq('action', params.action);
  if (params.entityTable?.trim()) query = query.ilike('entity_table', `%${params.entityTable.trim()}%`);

  if (params.keyword?.trim()) {
    const q = params.keyword.trim();
    query = query.or(`summary.ilike.%${q}%,entity_id.ilike.%${q}%`);
  }

  if (params.dateFrom) query = query.gte('created_at', `${params.dateFrom}T00:00:00Z`);
  if (params.dateTo) query = query.lte('created_at', `${params.dateTo}T23:59:59Z`);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);

  return {
    rows: ((data || []) as AdminAuditLog[]).map((row) => ({
      ...row,
      metadata: normalizeJsonObject(row.metadata),
    })),
    total: count ?? 0,
  };
}

export async function setUserRoleAndTeam(userId: string, role: EgRole, teamId: string | null) {
  const { data, error } = await supabase.rpc('eg_admin_set_user_role_and_team', {
    p_user_id: userId,
    p_role: role,
    p_team_id: teamId,
  });
  if (error) unwrapRpcError(error);

  // RPC returns null when 0 rows matched (user has no eg_profiles row).
  // Fall back to a direct upsert so the change is never silently lost.
  if (!data) {
    const { error: upsertError } = await supabase
      .from('eg_profiles')
      .upsert({ user_id: userId, role, team_id: teamId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (upsertError) throw new Error(upsertError.message);
  }

  return data as AdminProfile;
}

export async function setUserBan(userId: string, isBanned: boolean) {
  const { data, error } = await supabase.rpc('eg_admin_set_ban', {
    p_user_id: userId,
    p_is_banned: isBanned,
  });
  if (error) unwrapRpcError(error);
  return data as AdminProfile;
}

export async function upsertFeatureFlag(args: {
  key: string;
  enabled: boolean;
  description: string;
  payload: Record<string, unknown>;
}) {
  const { data, error } = await supabase.rpc('eg_admin_upsert_flag', {
    p_key: args.key,
    p_enabled: args.enabled,
    p_description: args.description,
    p_payload: args.payload,
  });
  if (error) unwrapRpcError(error);
  return data as AdminFeatureFlag;
}

export async function upsertContentBlock(args: {
  key: string;
  published: boolean;
  title: string;
  body: string;
  payload: Record<string, unknown>;
}) {
  const { data, error } = await supabase.rpc('eg_admin_upsert_content', {
    p_key: args.key,
    p_published: args.published,
    p_title: args.title,
    p_body: args.body,
    p_payload: args.payload,
  });
  if (error) unwrapRpcError(error);
  return data as AdminContentBlock;
}

export async function enqueueAdminJob(type: string, input: Record<string, unknown>) {
  const { data, error } = await supabase.rpc('eg_admin_enqueue_job', {
    p_type: type,
    p_input: input,
  });
  if (error) unwrapRpcError(error);
  return data as AdminJob;
}

export async function setAdminJobStatus(args: {
  jobId: string;
  status: EgJobStatus;
  progress: number;
  message?: string;
  output?: Record<string, unknown>;
  error?: string;
}) {
  const { data, error } = await supabase.rpc('eg_admin_set_job_status', {
    p_job_id: args.jobId,
    p_status: args.status,
    p_progress: args.progress,
    p_message: args.message ?? null,
    p_output: args.output ?? null,
    p_error: args.error ?? null,
  });
  if (error) unwrapRpcError(error);
  return data as AdminJob;
}

export async function updateFixture(args: {
  fixtureId: string;
  status?: string | null;
  startTime?: string | null;
  venue?: string | null;
  allowLateSubmission?: boolean | null;
}) {
  const rpcArgs: Record<string, unknown> = {
    p_fixture_id: args.fixtureId,
    p_status: args.status ?? null,
    p_start_time: args.startTime ?? null,
    p_venue: args.venue ?? null,
  };
  if (args.allowLateSubmission !== undefined) {
    rpcArgs.p_allow_late_submission = args.allowLateSubmission;
  }

  const { data, error } = await supabase.rpc('eg_admin_update_fixture', rpcArgs);
  if (!error) return data as AdminFixture;

  // Fallback: direct DB update when RPC is unavailable
  const patch: Record<string, unknown> = {};
  if (args.status !== undefined) patch.status = args.status;
  if (args.startTime !== undefined) patch.start_time = args.startTime;
  if (args.venue !== undefined) patch.venue = args.venue;
  if (args.allowLateSubmission !== undefined) {
    patch.allow_late_submission = args.allowLateSubmission;
    patch.late_submission_approved_at = args.allowLateSubmission ? new Date().toISOString() : null;
  }

  const { error: updateErr } = await supabase.from('eg_fixtures').update(patch).eq('id', args.fixtureId);
  if (updateErr) unwrapRpcError(updateErr);

  const { data: row, error: fetchErr } = await supabase.from('eg_fixtures').select('*').eq('id', args.fixtureId).single();
  if (fetchErr) unwrapRpcError(fetchErr);
  return row as AdminFixture;
}

export async function swapFixtureTeams(fixtureId: string) {
  const { data, error } = await supabase.rpc('eg_admin_swap_fixture_teams', {
    p_fixture_id: fixtureId,
  });
  if (error) unwrapRpcError(error);
  return data as AdminFixture;
}

export async function clearFixtureScores(fixtureId: string) {
  const { data, error } = await supabase.rpc('eg_admin_clear_fixture_scores', {
    p_fixture_id: fixtureId,
  });
  if (error) unwrapRpcError(error);
  return data as AdminFixture;
}

export async function seedFinalsWeek1(seasonId: string): Promise<{ created: number; round: number; season_id: string }> {
  const { data, error } = await supabase.rpc('eg_seed_finals_week1', {
    p_season_id: seasonId,
  });
  if (error) unwrapRpcError(error);
  return (data || { created: 0, round: 0, season_id: seasonId }) as { created: number; round: number; season_id: string };
}

export async function progressFinalsBracket(seasonId: string): Promise<void> {
  const { error } = await supabase.rpc('eg_finals_progression', {
    p_season_id: seasonId,
  });
  if (error) unwrapRpcError(error);
}

export async function setOcrQueueStatus(args: {
  queueId: string;
  status: EgJobStatus;
  result?: Record<string, unknown>;
  error?: string;
}) {
  const { data, error } = await supabase.rpc('eg_admin_set_ocr_status', {
    p_queue_id: args.queueId,
    p_status: args.status,
    p_result: args.result ?? null,
    p_error: args.error ?? null,
  });
  if (error) unwrapRpcError(error);
  return data as AdminOcrQueueItem;
}

export async function listStorageObjects(bucket: string, prefix = ''): Promise<StorageObjectItem[]> {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 200,
    offset: 0,
    sortBy: { column: 'name', order: 'asc' },
  });

  if (error) throw new Error(error.message);

  return (data || []).map((row) => ({
    name: row.name,
    id: row.id || null,
    updated_at: row.updated_at || null,
    created_at: row.created_at || null,
    last_accessed_at: row.last_accessed_at || null,
    metadata: normalizeJsonObject(row.metadata),
  }));
}

export function parseJsonInput(value: string): Record<string, unknown> {
  const raw = value.trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON payload must be an object');
  }
  return parsed as Record<string, unknown>;
}

export async function warmAdminLookups() {
  const [teams, seasons, competitions] = await Promise.all([
    safeSelect<AdminTeam>('eg_teams', 'id,name,short_name,slug,team_key,logo_url', 300),
    safeSelect<AdminSeason>('eg_seasons', 'id,name,slug,created_at', 200),
    safeSelect<AdminCompetition>('eg_competitions', 'id,name,slug,season_id,active', 200),
  ]);

  return { teams, seasons, competitions };
}

export type AdminFixturePlayerStat = {
  fixture_id: string;
  player_id: string;
  team_id: string;
  player_name?: string | null;
  disposals: number | null;
  kicks: number | null;
  handballs: number | null;
  marks: number | null;
  tackles: number | null;
  clearances: number | null;
  fantasy_points: number | null;
};

export async function fetchFixtureDetail(fixtureId: string): Promise<AdminFixture | null> {
  const { data, error } = await supabase
    .from('eg_fixtures')
    .select('*')
    .eq('id', fixtureId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as AdminFixture | null;
}

async function fetchFixtureWriteRow(fixtureId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('eg_fixtures')
    .select('*')
    .eq('id', fixtureId)
    .single();

  if (error) unwrapRpcError(error);
  return normalizeJsonObject(data);
}

async function saveFixtureResultViaAdminSession(args: {
  token: string;
  fixtureId: string;
  homeGoals: number | null;
  homeBehinds: number | null;
  homeTotal: number | null;
  awayGoals: number | null;
  awayBehinds: number | null;
  awayTotal: number | null;
  status?: string | null;
}): Promise<AdminFixture> {
  const existing = await fetchFixtureWriteRow(args.fixtureId);
  const seasonId = String(existing.season_id || '').trim();
  if (!seasonId) {
    throw new Error('Fixture is missing a season_id and cannot be saved from admin tools.');
  }

  const payload: Record<string, unknown> = {
    id: String(existing.id || args.fixtureId),
    season_id: seasonId,
    round: existing.round ?? null,
    week_index: existing.week_index ?? null,
    stage_name: existing.stage_name ?? null,
    stage_index: existing.stage_index ?? null,
    bracket_slot: existing.bracket_slot ?? null,
    next_fixture_id: existing.next_fixture_id ?? null,
    is_preseason: existing.is_preseason ?? false,
    status: args.status ?? existing.status ?? 'SCHEDULED',
    start_time: existing.start_time ?? null,
    venue: existing.venue ?? null,
    home_team_id: existing.home_team_id ?? null,
    away_team_id: existing.away_team_id ?? null,
    home_goals: args.homeGoals,
    home_behinds: args.homeBehinds,
    home_total: args.homeTotal,
    away_goals: args.awayGoals,
    away_behinds: args.awayBehinds,
    away_total: args.awayTotal,
  };

  if (Object.prototype.hasOwnProperty.call(existing, 'allow_late_submission')) {
    payload.allow_late_submission = existing.allow_late_submission ?? false;
  }

  try {
    await saveAdminFixture(args.token, payload);
  } catch (error) {
    if (isAdminSessionError(error)) {
      throw new Error('Admin write access expired. Unlock the passcode in the header and try again.');
    }
    throw error;
  }

  const refreshed = await fetchFixtureDetail(args.fixtureId);
  if (!refreshed) {
    throw new Error('Fixture saved but could not be reloaded.');
  }
  return refreshed;
}

async function trySaveFixtureResultViaSuperadminSession(args: {
  fixtureId: string;
  homeGoals: number | null;
  homeBehinds: number | null;
  homeTotal: number | null;
  awayGoals: number | null;
  awayBehinds: number | null;
  awayTotal: number | null;
  status?: string | null;
}): Promise<AdminFixture | null> {
  try {
    const { response } = await startSuperadminAutoSession();
    const token = String(response?.token || '').trim();
    if (!response?.ok || !token) return null;

    return await saveFixtureResultViaAdminSession({
      token,
      fixtureId: args.fixtureId,
      homeGoals: args.homeGoals,
      homeBehinds: args.homeBehinds,
      homeTotal: args.homeTotal,
      awayGoals: args.awayGoals,
      awayBehinds: args.awayBehinds,
      awayTotal: args.awayTotal,
      status: args.status ?? null,
    });
  } catch {
    return null;
  }
}

export type WormQuarterPoint = {
  q: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  home: number;
  away: number;
};

export async function updateFixtureQuarterScores(
  fixtureId: string,
  points: WormQuarterPoint[],
): Promise<void> {
  const payload = { quarterProgression: points };
  const rpcResult = await supabase.rpc('eg_admin_update_fixture_result', {
    p_fixture_id: fixtureId,
    p_quarter_scores_json: payload,
  });
  if (!rpcResult.error) return;
  if (!isMissingRpcError(rpcResult.error)) unwrapRpcError(rpcResult.error);

  const { error } = await supabase
    .from('eg_fixtures')
    .update({ quarter_scores_json: payload })
    .eq('id', fixtureId);
  if (error) throw new Error(error.message);
}

export async function listFixtureIdsWithPlayerStats(fixtureIds: string[] = []): Promise<Set<string>> {
  try {
    if (!fixtureIds.length) return new Set();

    const { data, error } = await supabase
      .from('eg_fixture_player_stats')
      .select('fixture_id')
      .in('fixture_id', fixtureIds);

    if (error) return new Set();
    return new Set((data || []).map((row) => row.fixture_id as string));
  } catch {
    return new Set();
  }
}

export async function listFixturePlayerStats(fixtureId: string): Promise<AdminFixturePlayerStat[]> {
  const { data, error } = await supabase
    .from('eg_fixture_player_stats')
    .select('fixture_id,player_id,team_id,disposals,kicks,handballs,marks,tackles,clearances,fantasy_points')
    .eq('fixture_id', fixtureId);

  if (error) {
    if (error.message.includes('does not exist')) return [];
    throw new Error(error.message);
  }

  const stats = (data || []) as AdminFixturePlayerStat[];

  const playerIds = stats.map((s) => s.player_id).filter(Boolean);
  if (playerIds.length) {
    const { data: players } = await supabase
      .from('eg_players')
      .select('id,name,display_name')
      .in('id', playerIds);

    const playerMap = new Map<string, string>();
    for (const p of (players || []) as Array<{ id: string; name: string | null; display_name: string | null }>) {
      playerMap.set(p.id, p.display_name || p.name || p.id);
    }

    for (const stat of stats) {
      stat.player_name = playerMap.get(stat.player_id) || null;
    }
  }

  return stats;
}

export async function updateFixtureScores(args: {
  token?: string;
  fixtureId: string;
  homeGoals: number | null;
  homeBehinds: number | null;
  awayGoals: number | null;
  awayBehinds: number | null;
  status?: string | null;
}) {
  const homeTotal =
    args.homeGoals != null && args.homeBehinds != null
      ? args.homeGoals * 6 + args.homeBehinds
      : null;
  const awayTotal =
    args.awayGoals != null && args.awayBehinds != null
      ? args.awayGoals * 6 + args.awayBehinds
      : null;

  const roleBasedResult = await supabase.rpc('eg_admin_update_fixture_result', {
    p_fixture_id: args.fixtureId,
    p_home_goals: args.homeGoals,
    p_home_behinds: args.homeBehinds,
    p_away_goals: args.awayGoals,
    p_away_behinds: args.awayBehinds,
    p_status: args.status ?? null,
  });
  if (!roleBasedResult.error) return roleBasedResult.data as AdminFixture;
  if (!isMissingRpcError(roleBasedResult.error)) unwrapRpcError(roleBasedResult.error);

  if (args.token) {
    return saveFixtureResultViaAdminSession({
      token: args.token,
      fixtureId: args.fixtureId,
      homeGoals: args.homeGoals,
      homeBehinds: args.homeBehinds,
      homeTotal,
      awayGoals: args.awayGoals,
      awayBehinds: args.awayBehinds,
      awayTotal,
      status: args.status ?? null,
    });
  }

  const superadminFallback = await trySaveFixtureResultViaSuperadminSession({
    fixtureId: args.fixtureId,
    homeGoals: args.homeGoals,
    homeBehinds: args.homeBehinds,
    homeTotal,
    awayGoals: args.awayGoals,
    awayBehinds: args.awayBehinds,
    awayTotal,
    status: args.status ?? null,
  });
  if (superadminFallback) return superadminFallback;

  throw new Error(ADMIN_WRITE_SESSION_MESSAGE);
}

export async function upsertFixturePlayerStats(
  token: string,
  fixtureId: string,
  rows: Array<{
    player_id: string;
    team_id: string;
    disposals?: number | null;
    kicks?: number | null;
    handballs?: number | null;
    marks?: number | null;
    tackles?: number | null;
    clearances?: number | null;
    fantasy_points?: number | null;
  }>,
) {
  // Try token-gated RPC first if token available
  if (token) {
    const tokenResult = await supabase.rpc('eg_admin_upsert_player_stats', {
      p_token: token,
      p_fixture_id: fixtureId,
      p_rows: rows,
    });
    if (!tokenResult.error) return;
    // Only fall through if the function doesn't exist (migration not yet applied);
    // otherwise surface the real error so admins aren't silently routed to the
    // auth-based fallback which requires a fixture submission to exist.
    if (!tokenResult.error.message?.includes('does not exist')) {
      unwrapRpcError(tokenResult.error);
    }
  }

  // Fallback to existing auth-based RPC
  const { error } = await supabase.rpc('eg_upsert_fixture_player_stats', {
    p_fixture_id: fixtureId,
    p_rows: rows,
  });

  if (error) unwrapRpcError(error);
}

export async function deleteFixturePlayerStats(token: string, fixtureId: string): Promise<number> {
  // Try token-gated RPC first
  if (token) {
    const tokenResult = await supabase.rpc('eg_admin_delete_fixture_player_stats', {
      p_token: token,
      p_fixture_id: fixtureId,
    });
    if (!tokenResult.error) return (tokenResult.data as number) ?? 0;
    // Only fall through if function doesn't exist; otherwise surface the real error
    if (!tokenResult.error.message?.includes('does not exist')) {
      unwrapRpcError(tokenResult.error);
    }
  }

  // Fallback to auth-based RPC (checks profiles.is_admin via auth.uid())
  const { data, error } = await supabase.rpc('eg_delete_fixture_player_stats', {
    p_fixture_id: fixtureId,
  });
  if (error) unwrapRpcError(error);
  return (data as number) ?? 0;
}

export async function fetchFixtureOcrData(fixtureId: string): Promise<AdminOcrQueueItem[]> {
  const { data, error } = await supabase
    .from('eg_ocr_queue')
    .select('*')
    .eq('fixture_id', fixtureId)
    .order('created_at', { ascending: false });

  if (error) {
    if (error.message.includes('does not exist')) return [];
    throw new Error(error.message);
  }

  return ((data || []) as AdminOcrQueueItem[]).map((row) => ({
    ...row,
    source_images: Array.isArray(row.source_images) ? row.source_images : [],
    result: normalizeJsonObject(row.result),
  }));
}

export async function createOcrQueueItem(args: {
  fixtureId: string;
  sourceImages: unknown[];
}): Promise<AdminOcrQueueItem> {
  const { data, error } = await supabase
    .from('eg_ocr_queue')
    .insert({
      fixture_id: args.fixtureId,
      status: 'running',
      source_images: Array.isArray(args.sourceImages) ? args.sourceImages : [],
      result: {},
      error: null,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  return {
    ...(data as AdminOcrQueueItem),
    source_images: Array.isArray((data as AdminOcrQueueItem).source_images)
      ? (data as AdminOcrQueueItem).source_images
      : [],
    result: normalizeJsonObject((data as AdminOcrQueueItem).result),
  };
}

export async function updateFixtureSubmissionImageOcrStatus(
  imageIds: string[],
  status: 'pending' | 'processing' | 'done' | 'failed',
) {
  const ids = imageIds.map((value) => String(value || '').trim()).filter(Boolean);
  if (!ids.length) return;

  const { error } = await supabase
    .from('eg_fixture_submission_images')
    .update({
      ocr_status: status,
      ocr_confidence: null,
    })
    .in('id', ids);

  if (error) throw new Error(error.message);
}

export async function invokeAdminPlayerStatsOcr(args: {
  token: string;
  fixtureId: string;
}): Promise<{ queueId: string; status: string; summary: Record<string, unknown> }> {
  const { data, error } = await supabase.functions.invoke('admin-ocr-player-stats', {
    body: {
      adminToken: args.token,
      fixtureId: args.fixtureId,
    },
  });

  if (error) {
    throw new Error(error.message || 'Failed to invoke OCR function');
  }

  const payload = normalizeJsonObject(data);
  if (!payload.ok) {
    throw new Error(String(payload.error || 'OCR request failed'));
  }

  return {
    queueId: String(payload.queueId || '').trim(),
    status: String(payload.status || '').trim() || 'unknown',
    summary: normalizeJsonObject(payload.summary),
  };
}

export async function listFixturePlayerStatImages(fixtureId: string): Promise<AdminFixtureSubmissionImage[]> {
  const { data, error } = await supabase
    .from('eg_fixture_submission_images')
    .select('id,fixture_id,submission_id,image_type,page_number,storage_bucket,storage_path,mime_type,ocr_status')
    .eq('fixture_id', fixtureId)
    .eq('image_type', 'player_stat')
    .order('page_number', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    if (error.message.includes('does not exist')) return [];
    throw new Error(error.message);
  }

  return ((data || []) as Array<Record<string, unknown>>).map((row) => {
    const storageBucket = String(row.storage_bucket || 'Assets').trim() || 'Assets';
    const storagePath = String(row.storage_path || '').trim();
    const publicUrl = storagePath
      ? supabase.storage.from(storageBucket).getPublicUrl(storagePath).data.publicUrl
      : '';

    return {
      id: String(row.id || '').trim(),
      fixture_id: String(row.fixture_id || '').trim(),
      submission_id: String(row.submission_id || '').trim(),
      image_type: String(row.image_type || '').trim(),
      page_number: normalizeNullableInteger(row.page_number),
      storage_bucket: storageBucket,
      storage_path: storagePath,
      mime_type: row.mime_type ? String(row.mime_type) : null,
      ocr_status: row.ocr_status ? String(row.ocr_status) : null,
      public_url: publicUrl || '',
    };
  });
}

export async function fetchLatestSuccessfulFixtureOcrDraft(fixtureId: string): Promise<{
  queueId: string;
  updatedAt: string;
  draft: AdminPlayerStatsOcrDraft;
  warnings: string[];
  summary: Record<string, unknown>;
  rawText: string | null;
  model: string | null;
} | null> {
  const { data, error } = await supabase
    .from('eg_ocr_queue')
    .select('*')
    .eq('fixture_id', fixtureId)
    .eq('status', 'succeeded')
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (error.message.includes('does not exist')) return null;
    throw new Error(error.message);
  }

  if (!data) return null;

  const normalized = normalizePlayerStatsOcrResult(data.result);
  if (!normalized) return null;

  return {
    queueId: String(data.id || '').trim(),
    updatedAt: String(data.updated_at || data.created_at || ''),
    draft: normalized.draft,
    warnings: normalized.warnings,
    summary: normalized.summary || {},
    rawText: normalized.rawText || null,
    model: normalized.model || null,
  };
}

export async function listMissingPlayerStatsFixtures(seasonId: string): Promise<AdminMissingPlayerStatsFixture[]> {
  const normalizedSeasonId = String(seasonId || '').trim();
  if (!normalizedSeasonId) return [];

  const fixturesRes = await listFixtures({
    page: 1,
    pageSize: 500,
    seasonId: normalizedSeasonId,
    status: 'all',
    round: null,
    search: '',
    teamId: 'all',
  });

  const fixtures = fixturesRes.rows || [];
  if (!fixtures.length) return [];

  const fixtureIds = fixtures.map((fixture) => fixture.id);
  const fixtureIdsWithStats = await listFixtureIdsWithPlayerStats(fixtureIds);

  const fixturesMissingStats = fixtures.filter((fixture) => !fixtureIdsWithStats.has(fixture.id));
  if (!fixturesMissingStats.length) return [];

  const missingFixtureIds = fixturesMissingStats.map((fixture) => fixture.id);
  const submissionByFixture = new Map<string, string>();
  const screenshotCountByFixture = new Map<string, number>();
  const latestQueueByFixture = new Map<string, { id: string; status: EgJobStatus | null; updated_at: string | null }>();

  for (const chunk of chunkValues(missingFixtureIds, 200)) {
    const [submissionsRes, imagesRes, queueRes] = await Promise.all([
      supabase
        .from('submissions')
        .select('fixture_id,submitted_at')
        .in('fixture_id', chunk)
        .order('submitted_at', { ascending: false }),
      supabase
        .from('eg_fixture_submission_images')
        .select('fixture_id')
        .eq('image_type', 'player_stat')
        .in('fixture_id', chunk),
      supabase
        .from('eg_ocr_queue')
        .select('id,fixture_id,status,updated_at,created_at')
        .in('fixture_id', chunk)
        .order('updated_at', { ascending: false })
        .order('created_at', { ascending: false }),
    ]);

    if (submissionsRes.error && !submissionsRes.error.message.includes('does not exist')) {
      throw new Error(submissionsRes.error.message);
    }
    if (imagesRes.error && !imagesRes.error.message.includes('does not exist')) {
      throw new Error(imagesRes.error.message);
    }
    if (queueRes.error && !queueRes.error.message.includes('does not exist')) {
      throw new Error(queueRes.error.message);
    }

    for (const row of ((submissionsRes.data || []) as Array<Record<string, unknown>>)) {
      const fixtureId = String(row.fixture_id || '').trim();
      const submittedAt = String(row.submitted_at || '').trim();
      if (!fixtureId || !submittedAt || submissionByFixture.has(fixtureId)) continue;
      submissionByFixture.set(fixtureId, submittedAt);
    }

    for (const row of ((imagesRes.data || []) as Array<Record<string, unknown>>)) {
      const fixtureId = String(row.fixture_id || '').trim();
      if (!fixtureId) continue;
      screenshotCountByFixture.set(fixtureId, (screenshotCountByFixture.get(fixtureId) || 0) + 1);
    }

    for (const row of ((queueRes.data || []) as Array<Record<string, unknown>>)) {
      const fixtureId = String(row.fixture_id || '').trim();
      if (!fixtureId || latestQueueByFixture.has(fixtureId)) continue;
      latestQueueByFixture.set(fixtureId, {
        id: String(row.id || '').trim(),
        status: (String(row.status || '').trim() || null) as EgJobStatus | null,
        updated_at: String(row.updated_at || row.created_at || '').trim() || null,
      });
    }
  }

  return fixturesMissingStats
    .filter((fixture) => submissionByFixture.has(fixture.id))
    .map((fixture) => {
      const screenshotCount = screenshotCountByFixture.get(fixture.id) || 0;
      const latestQueue = latestQueueByFixture.get(fixture.id) || null;
      const blockedReason =
        screenshotCount > 0
          ? null
          : 'No uploaded player-stat screenshots found on the submitted result.';

      return {
        fixture_id: fixture.id,
        season_id: fixture.season_id,
        round: fixture.round,
        home_team_id: fixture.home_team_id,
        away_team_id: fixture.away_team_id,
        home_team_name: fixture.home_team_name || null,
        away_team_name: fixture.away_team_name || null,
        submitted_at: submissionByFixture.get(fixture.id) || null,
        screenshot_count: screenshotCount,
        latest_ocr_status: latestQueue?.status || null,
        latest_ocr_queue_id: latestQueue?.id || null,
        latest_ocr_updated_at: latestQueue?.updated_at || null,
        can_run_ocr: blockedReason == null,
        blocked_reason: blockedReason,
      };
    })
    .sort((a, b) => {
      const roundDiff = (a.round || 0) - (b.round || 0);
      if (roundDiff !== 0) return roundDiff;
      const aTime = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
      const bTime = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
      return aTime - bTime;
    });
}

export async function fetchFixtureSubmissionData(fixtureId: string) {
  const { data, error } = await supabase
    .from('submissions')
    .select('*')
    .eq('fixture_id', fixtureId)
    .order('submitted_at', { ascending: false });

  if (error) {
    if (error.message.includes('does not exist')) return [];
    throw new Error(error.message);
  }

  return (data || []) as Array<Record<string, unknown>>;
}

export async function listPlayersForTeam(teamId: string) {
  const { data, error } = await supabase
    .from('eg_players')
    .select('id,name,display_name,team_id,afl_player_id')
    .eq('team_id', teamId)
    .order('name', { ascending: true })
    .limit(100);

  if (error) throw new Error(error.message);
  return (data || []) as Array<{ id: string; name: string | null; display_name: string | null; team_id: string; afl_player_id: number | null }>;
}

/** Look up players by their AFL numeric IDs. Returns a map of aflPlayerId → player row. */
export async function lookupPlayersByAflId(aflPlayerIds: number[]) {
  if (!aflPlayerIds.length) return new Map<number, { id: string; name: string | null; display_name: string | null; team_id: string | null; afl_player_id: number }>();
  const { data, error } = await supabase
    .from('eg_players')
    .select('id,name,display_name,team_id,afl_player_id')
    .in('afl_player_id', aflPlayerIds);

  if (error) throw new Error(error.message);
  const map = new Map<number, { id: string; name: string | null; display_name: string | null; team_id: string | null; afl_player_id: number }>();
  for (const row of (data || []) as Array<{ id: string; name: string | null; display_name: string | null; team_id: string | null; afl_player_id: number }>) {
    if (row.afl_player_id != null) map.set(row.afl_player_id, row);
  }
  return map;
}
