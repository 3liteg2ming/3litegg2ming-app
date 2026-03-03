import { supabase } from './supabaseClient';
import type {
  AdminAuditLog,
  AdminCompetition,
  AdminContentBlock,
  AdminFeatureFlag,
  AdminFixture,
  AdminFixtureSubmission,
  AdminJob,
  AdminOcrQueueItem,
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

const ADMIN_ERROR_MESSAGE = 'Admin privileges required';

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

function isLikelyUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
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
    .select('id,name,full_name,display_name,team_id,goals,behinds,disposals', { count: 'exact' });

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

  let query = supabase
    .from('eg_fixtures')
    .select(
      [
        'id',
        'season_id',
        'round',
        'status',
        'venue',
        'start_time',
        'home_team_id',
        'away_team_id',
        'home_total',
        'away_total',
        'home_goals',
        'home_behinds',
        'away_goals',
        'away_behinds',
        'submitted_at',
        'verified_at',
        'disputed_at',
        'corrected_at',
      ].join(','),
      { count: 'exact' },
    );

  if (params.seasonId && params.seasonId !== 'all') query = query.eq('season_id', params.seasonId);
  if (params.round != null) query = query.eq('round', params.round);
  if (params.status && params.status !== 'all') query = query.eq('status', params.status);
  if (params.teamId && params.teamId !== 'all') {
    query = query.or(`home_team_id.eq.${params.teamId},away_team_id.eq.${params.teamId}`);
  }
  if (params.search?.trim()) {
    const q = params.search.trim();
    query = query.ilike('venue', `%${q}%`);
  }

  const { data, error, count } = await query
    .order('round', { ascending: false })
    .order('start_time', { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);

  return {
    rows: ((data || []) as unknown[]) as AdminFixture[],
    total: count ?? 0,
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
    .from('eg_fixture_submissions')
    .select('id,fixture_id,submitted_by_user_id,submitted_team_id,status,source,notes,created_at,updated_at', {
      count: 'exact',
    });

  if (params.status && params.status !== 'all') query = query.eq('status', params.status);
  if (params.search?.trim()) {
    const q = params.search.trim();
    if (isLikelyUuid(q)) {
      query = query.eq('fixture_id', q);
    } else {
      query = query.ilike('notes', `%${q}%`);
    }
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    if (error.message.includes('does not exist')) {
      return { rows: [], total: 0 };
    }
    throw new Error(error.message);
  }

  return {
    rows: (data || []) as AdminFixtureSubmission[],
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
}) {
  const { data, error } = await supabase.rpc('eg_admin_update_fixture', {
    p_fixture_id: args.fixtureId,
    p_status: args.status ?? null,
    p_start_time: args.startTime ?? null,
    p_venue: args.venue ?? null,
  });
  if (error) unwrapRpcError(error);
  return data as AdminFixture;
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
