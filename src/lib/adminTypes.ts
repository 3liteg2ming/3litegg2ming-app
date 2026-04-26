export type EgRole = 'user' | 'coach' | 'admin' | 'super_admin';
export type EgAuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'UPSERT'
  | 'RPC'
  | 'PUBLISH'
  | 'UNPUBLISH'
  | 'REBUILD'
  | 'BULK'
  | 'LOGIN_AS'
  | 'OTHER';
export type EgJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type AdminProfile = {
  user_id: string;
  created_at: string;
  updated_at: string;
  display_name: string | null;
  psn: string | null;
  email: string | null;
  team_id: string | null;
  role: EgRole;
  is_banned: boolean;
};

export type AdminTeam = {
  id: string;
  name: string;
  short_name: string | null;
  slug: string | null;
  team_key: string | null;
  logo_url: string | null;
};

export type AdminSeason = {
  id: string;
  name: string | null;
  slug: string | null;
  created_at?: string | null;
};

export type AdminCompetition = {
  id: string;
  name: string | null;
  slug?: string | null;
  season_id?: string | null;
  active?: boolean | null;
};

export type AdminPlayer = {
  id: string;
  name: string | null;
  full_name: string | null;
  display_name: string | null;
  team_id: string | null;
  goals?: number | null;
  behinds?: number | null;
  disposals?: number | null;
};

export type AdminFixture = {
  id: string;
  season_id: string | null;
  round: number | null;
  status: string | null;
  venue: string | null;
  start_time: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_name?: string | null;
  away_team_name?: string | null;
  home_total: number | null;
  away_total: number | null;
  home_goals: number | null;
  home_behinds: number | null;
  away_goals: number | null;
  away_behinds: number | null;
  submitted_at?: string | null;
  verified_at?: string | null;
  disputed_at?: string | null;
  corrected_at?: string | null;
  quarter_scores_json?: unknown;
};

export type AdminFeatureFlag = {
  key: string;
  created_at: string;
  updated_at: string;
  enabled: boolean;
  description: string | null;
  payload: Record<string, unknown>;
};

export type AdminContentBlock = {
  key: string;
  created_at: string;
  updated_at: string;
  published: boolean;
  title: string | null;
  body: string | null;
  payload: Record<string, unknown>;
};

export type AdminJob = {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  type: string;
  status: EgJobStatus;
  progress: number;
  message: string | null;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error: string | null;
};

export type AdminOcrQueueItem = {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  fixture_id: string | null;
  status: EgJobStatus;
  source_images: unknown[];
  result: Record<string, unknown>;
  error: string | null;
};

export type AdminPlayerStatsOcrDraftRow = {
  teamSlug: string;
  playerRef: {
    playerId: string | null;
    aflPlayerId: number | null;
    playerName: string | null;
  };
  kicks: number | null;
  handballs: number | null;
  disposals: number | null;
  marks: number | null;
  tackles: number | null;
  fantasyPoints: number | null;
};

export type AdminPlayerStatsOcrDraft = {
  fixtureId: string;
  homeTeamSlug: string;
  awayTeamSlug: string;
  playerStats: AdminPlayerStatsOcrDraftRow[];
  warnings?: string[];
};

export type AdminPlayerStatsOcrResult = {
  draft: AdminPlayerStatsOcrDraft;
  warnings: string[];
  summary?: Record<string, unknown>;
  rawText?: string | null;
  rawResponseId?: string | null;
  model?: string | null;
};

export type AdminAuditLog = {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_role: EgRole | null;
  action: EgAuditAction;
  entity_table: string | null;
  entity_id: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
  request_id: string | null;
};

export type AdminFixtureSubmission = {
  id: string;
  fixture_id: string;
  submitted_by_user_id: string | null;
  submitted_team_id: string | null;
  status: string | null;
  source: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminMissingPlayerStatsFixture = {
  fixture_id: string;
  season_id: string | null;
  round: number | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  submitted_at: string | null;
  screenshot_count: number;
  latest_ocr_status: EgJobStatus | null;
  latest_ocr_queue_id: string | null;
  latest_ocr_updated_at: string | null;
  can_run_ocr: boolean;
  blocked_reason: string | null;
};

export type AdminFixtureSubmissionImage = {
  id: string;
  fixture_id: string;
  submission_id: string;
  image_type: string;
  page_number: number | null;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  ocr_status: string | null;
  public_url: string;
};

export type AdminPageParams = {
  page: number;
  pageSize: number;
};

export type AdminPagedResult<T> = {
  rows: T[];
  total: number;
};

export type StorageObjectItem = {
  name: string;
  id: string | null;
  updated_at: string | null;
  created_at: string | null;
  last_accessed_at?: string | null;
  metadata?: Record<string, unknown> | null;
};
