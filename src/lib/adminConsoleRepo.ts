import { fetchSeasonFixturesBySeasonId } from './fixturesRepo';
import { requireSupabaseClient } from './supabaseClient';

const supabase = requireSupabaseClient();
const TTL_MS = 60_000;
const REG_TABLE_CANDIDATES = ['eg_preseason_registrations_pretty'] as const;

export type AdminConsoleCompetitionKey = 'preseason' | 'afl26';
export type AdminConsoleSeasonMap = Record<AdminConsoleCompetitionKey, string | null>;

export type AdminConsoleCompetition = {
  key: AdminConsoleCompetitionKey;
  label: string;
  slug: string;
};

export type AdminConsoleTeam = {
  id: string;
  name: string;
  logo_url: string | null;
};

export type AdminConsoleProfile = {
  user_id: string;
  display_name: string;
  psn: string;
  team_id: string | null;
  role?: string | null;
  is_admin?: boolean | null;
};

export type AdminConsoleFixture = {
  id?: string;
  season_id: string;
  round: number | null;
  week_index: number | null;
  stage_name: string | null;
  status: string;
  start_time: string | null;
  venue: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_goals: number | null;
  home_behinds: number | null;
  home_total: number | null;
  away_goals: number | null;
  away_behinds: number | null;
  away_total: number | null;
  home_team_name?: string | null;
  away_team_name?: string | null;
};

export type AdminConsoleMetric = {
  label: string;
  value: number;
  hint: string;
};

export type AdminConsoleHealth = {
  label: string;
  value: number;
  hint: string;
};

export type PasscodeResponse = {
  ok?: boolean;
  token?: string;
  expires_at?: string;
  expires_in?: number;
  error?: string;
};

export type PasscodeAttemptResult = {
  response: PasscodeResponse;
  diagnostics: string[];
};

type SessionPingResponse = {
  ok?: boolean;
};

const cache = new Map<string, { at: number; value: unknown }>();

function text(v: unknown): string {
  return String(v ?? '').trim();
}

function numberOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isFresh(at: number) {
  return Date.now() - at < TTL_MS;
}

function getCached<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit || !isFresh(hit.at)) return null;
  return hit.value as T;
}

function setCached<T>(key: string, value: T): T {
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function invalidateAdminConsoleCache() {
  cache.clear();
}

function parsePasscodePayload(data: any): PasscodeResponse {
  if (typeof data === 'string') return { ok: Boolean(data.trim()), token: data.trim() };
  if (Array.isArray(data)) {
    const first = data[0];
    if (typeof first === 'string') return { ok: Boolean(first.trim()), token: first.trim() };
    return (first || {}) as PasscodeResponse;
  }
  if (data && typeof data === 'object' && typeof data.token === 'string') return data as PasscodeResponse;
  return (data || {}) as PasscodeResponse;
}

function parseSessionPing(data: any): boolean {
  if (typeof data === 'boolean') return data;
  if (typeof data === 'string') return data.toLowerCase() === 'true';
  if (Array.isArray(data)) {
    const first = data[0];
    if (typeof first === 'boolean') return first;
    if (typeof first === 'string') return first.toLowerCase() === 'true';
    return Boolean((first as SessionPingResponse | undefined)?.ok);
  }
  return Boolean((data as SessionPingResponse | undefined)?.ok);
}

export async function pingAdminSession(token: string): Promise<{ ok: boolean; diagnostics: string[] }> {
  const diagnostics: string[] = [];
  const normalized = String(token || '').trim();
  if (!normalized) return { ok: false, diagnostics: ['[Ping] empty token'] };

  const pingAttempts: Array<{ fn: string; args: Record<string, string>; label: string }> = [
    { fn: 'eg_admin_session_ping', args: { token: normalized }, label: 'eg_admin_session_ping(token)' },
    { fn: 'eg_admin_session_ping', args: { p_token: normalized }, label: 'eg_admin_session_ping(p_token)' },
    { fn: 'eg_is_admin_session_valid', args: { p_token: normalized }, label: 'eg_is_admin_session_valid(p_token)' },
    { fn: 'eg_is_admin_session_valid', args: { token: normalized }, label: 'eg_is_admin_session_valid(token)' },
  ];

  for (const attempt of pingAttempts) {
    const res = await supabase.rpc(attempt.fn, attempt.args);
    if (res.error) {
      diagnostics.push(`[Ping] ${attempt.label} ${res.error.message || 'failed'}`);
      continue;
    }

    const ok = parseSessionPing(res.data);
    diagnostics.push(`[Ping] ${attempt.label} ${ok ? 'ok' : 'false'}`);
    return { ok, diagnostics };
  }

  return { ok: false, diagnostics };
}

export async function exchangeAdminPasscode(code: string): Promise<PasscodeAttemptResult> {
  const diagnostics: string[] = [];
  const normalizedCode = String(code || '').trim();
  const attempts: Array<{ label: string; args: Record<string, string> }> = [
    { label: 'passcode', args: { passcode: normalizedCode } },
    { label: 'code', args: { code: normalizedCode } },
    { label: 'p_code', args: { p_code: normalizedCode } },
  ];

  for (const attempt of attempts) {
    const res = await supabase.rpc('eg_admin_exchange_passcode', attempt.args);
    if (res.error) {
      diagnostics.push(`[RPC] eg_admin_exchange_passcode(${attempt.label}) ${res.error.message || 'request failed'}`);
      continue;
    }
    diagnostics.push(`[RPC] eg_admin_exchange_passcode(${attempt.label}) response received`);
    const payload = parsePasscodePayload(res.data);
    if (payload?.ok && text(payload?.token)) {
      diagnostics.push('[RPC] unlocked');
      return { response: payload, diagnostics };
    }
    diagnostics.push('[RPC] passcode rejected');
    return { response: payload, diagnostics };
  }

  const e = new Error('Cannot reach Supabase RPC endpoint for admin passcode.');
  (e as any).diagnostics = diagnostics;
  throw e;
}

export async function fetchCurrentAuthUserId(): Promise<string> {
  const cached = getCached<string>('auth-user-id');
  if (cached !== null) return cached;

  const { data, error } = await supabase.auth.getUser();
  if (error) throw new Error(error.message);
  return setCached('auth-user-id', text(data?.user?.id));
}

export async function findRegistrationsTable(): Promise<string | null> {
  const cached = getCached<string | null>('registrations-table');
  if (cached !== null) return cached;

  const table = REG_TABLE_CANDIDATES[0];
  const probe = await supabase.from(table).select('user_id', { head: true, count: 'exact' });
  return setCached('registrations-table', probe.error ? null : table);
}

async function loadSeasonMap(competitions: AdminConsoleCompetition[]): Promise<AdminConsoleSeasonMap> {
  const cacheKey = 'season-map';
  const cached = getCached<AdminConsoleSeasonMap>(cacheKey);
  if (cached) return cached;

  const next: AdminConsoleSeasonMap = { preseason: null, afl26: null };
  await Promise.all(
    competitions.map(async (comp) => {
      const { data } = await supabase.from('eg_seasons').select('id').eq('slug', comp.slug).maybeSingle();
      next[comp.key] = text(data?.id) || null;
    }),
  );

  return setCached(cacheKey, next);
}

async function loadTeams(): Promise<AdminConsoleTeam[]> {
  const cached = getCached<AdminConsoleTeam[]>('teams');
  if (cached) return cached;

  const { data, error } = await supabase.from('eg_teams').select('id,name,logo_url').order('name', { ascending: true });
  if (error) throw new Error(error.message || 'Unable to load teams');

  return setCached(
    'teams',
    ((data || []) as any[]).map((row) => ({
      id: text(row.id),
      name: text(row.name) || 'Unknown',
      logo_url: text(row.logo_url) || null,
    })),
  );
}

async function loadProfiles(): Promise<AdminConsoleProfile[]> {
  const cached = getCached<AdminConsoleProfile[]>('profiles');
  if (cached) return cached;

  const { data, error } = await supabase.from('eg_profiles').select('*').limit(2000);
  if (error) throw new Error(error.message || 'Unable to load profiles');

  const rows = ((data || []) as any[]).map((row) => ({
    user_id: text(row.user_id || row.id),
    display_name: text(row.display_name),
    psn: text(row.psn),
    team_id: text(row.team_id) || null,
    role: text(row.role) || null,
    is_admin: typeof row.is_admin === 'boolean' ? row.is_admin : null,
  }));

  return setCached('profiles', rows.filter((row) => row.user_id));
}

async function loadRegistrations(regTable: string | null): Promise<RegistrationRow[]> {
  const table = regTable || (await findRegistrationsTable());
  if (!table) return [];
  const cacheKey = `registrations:${table}`;
  const cached = getCached<RegistrationRow[]>(cacheKey);
  if (cached) return cached;

  const { data, error } = await supabase.from(table).select('*').limit(2000);
  if (error) throw new Error(error.message || 'Unable to load registrations');
  return setCached(cacheKey, (data || []) as RegistrationRow[]);
}

async function loadFixtures(competitionKey: AdminConsoleCompetitionKey, seasonMap: AdminConsoleSeasonMap): Promise<AdminConsoleFixture[]> {
  const seasonId = seasonMap[competitionKey];
  if (!seasonId) return [];
  const cacheKey = `fixtures:${competitionKey}:${seasonId}`;
  const cached = getCached<AdminConsoleFixture[]>(cacheKey);
  if (cached) return cached;

  const { fixtures } = await fetchSeasonFixturesBySeasonId(seasonId, { limit: 3000, offset: 0 });
  const mapped = fixtures.map((f) => ({
    id: text(f.id),
    season_id: text(f.season_id),
    round: numberOrNull(f.round),
    week_index: numberOrNull(f.week_index),
    stage_name: text(f.stage_name) || null,
    status: text(f.status || 'SCHEDULED').toUpperCase(),
    start_time: text(f.start_time) || null,
    venue: text(f.venue) || null,
    home_team_id: text(f.home_team_id) || null,
    away_team_id: text(f.away_team_id) || null,
    home_team_name: text(f.home_team_name) || null,
    away_team_name: text(f.away_team_name) || null,
    home_goals: numberOrNull(f.home_goals),
    home_behinds: numberOrNull(f.home_behinds),
    home_total: numberOrNull(f.home_total),
    away_goals: numberOrNull(f.away_goals),
    away_behinds: numberOrNull(f.away_behinds),
    away_total: numberOrNull(f.away_total),
  }));
  return setCached(cacheKey, mapped);
}

type RegistrationRow = Record<string, any>;

async function loadDiagnostics(seasonMap: AdminConsoleSeasonMap, rows: RegistrationRow[]): Promise<{
  metrics: AdminConsoleMetric[];
  health: AdminConsoleHealth[];
}> {
  const cacheKey = `diagnostics:${seasonMap.preseason}:${seasonMap.afl26}:${rows.length}`;
  const cached = getCached<{ metrics: AdminConsoleMetric[]; health: AdminConsoleHealth[] }>(cacheKey);
  if (cached) return cached;

  const preseasonSeasonId = seasonMap.preseason;
  const seasonTwoSeasonId = seasonMap.afl26;

  const [usersRes, preseasonFixturesRes, seasonTwoFixturesRes] = await Promise.all([
    supabase.from('eg_profiles').select('user_id', { count: 'exact', head: true }),
    preseasonSeasonId
      ? supabase.from('eg_fixtures').select('id', { count: 'exact', head: true }).eq('season_id', preseasonSeasonId)
      : Promise.resolve({ count: 0 } as any),
    seasonTwoSeasonId
      ? supabase.from('eg_fixtures').select('id', { count: 'exact', head: true }).eq('season_id', seasonTwoSeasonId)
      : Promise.resolve({ count: 0 } as any),
  ]);

  const preseasonRegistrations = rows.filter((r) => {
    const slug = text(r.season_slug);
    return !slug || slug === 'preseason';
  }).length;

  const metrics: AdminConsoleMetric[] = [
    { label: 'Knockout registrations', value: preseasonRegistrations, hint: 'season_slug = preseason' },
    { label: 'Users', value: usersRes.count || 0, hint: 'Rows in eg_profiles' },
    {
      label: 'Preseason fixtures',
      value: preseasonFixturesRes.count || 0,
      hint: preseasonSeasonId ? `season_id: ${preseasonSeasonId.slice(0, 8)}…` : 'Preseason slug missing',
    },
    {
      label: 'Season Two fixtures',
      value: seasonTwoFixturesRes.count || 0,
      hint: seasonTwoSeasonId ? `season_id: ${seasonTwoSeasonId.slice(0, 8)}…` : 'Season Two slug missing',
    },
  ];

  const [missingLogoRes, badJoinRes, profileMissingTeamRes] = await Promise.all([
    supabase.from('eg_teams').select('id', { count: 'exact', head: true }).or('logo_url.is.null,logo_url.eq.'),
    supabase.from('eg_fixtures').select('id', { count: 'exact', head: true }).or('home_team_id.is.null,away_team_id.is.null'),
    supabase.from('eg_profiles').select('user_id', { count: 'exact', head: true }).is('team_id', null),
  ]);

  const health: AdminConsoleHealth[] = [
    { label: 'Fixtures missing teams', value: badJoinRes.count || 0, hint: 'eg_fixtures rows missing home_team_id or away_team_id' },
    { label: 'Teams missing logos', value: missingLogoRes.count || 0, hint: 'eg_teams.logo_url is empty' },
    { label: 'Profiles without team_id', value: profileMissingTeamRes.count || 0, hint: 'Optional, but affects “My Team” UX' },
  ];

  return setCached(cacheKey, { metrics, health });
}

export async function fetchAdminConsoleBootstrap(args: {
  competitionKey: AdminConsoleCompetitionKey;
  competitions: AdminConsoleCompetition[];
  regTable: string | null;
}): Promise<{
  seasonMap: AdminConsoleSeasonMap;
  teams: AdminConsoleTeam[];
  profiles: AdminConsoleProfile[];
  registrations: RegistrationRow[];
  regTable: string | null;
  fixtures: AdminConsoleFixture[];
  metrics: AdminConsoleMetric[];
  health: AdminConsoleHealth[];
}> {
  const seasonMap = await loadSeasonMap(args.competitions);
  const registrationTable = args.regTable || (await findRegistrationsTable());

  const [teams, profiles, registrations, fixtures] = await Promise.all([
    loadTeams(),
    loadProfiles(),
    loadRegistrations(registrationTable),
    loadFixtures(args.competitionKey, seasonMap),
  ]);
  const diagnostics = await loadDiagnostics(seasonMap, registrations);

  return {
    seasonMap,
    teams,
    profiles,
    registrations,
    regTable: registrationTable,
    fixtures,
    metrics: diagnostics.metrics,
    health: diagnostics.health,
  };
}

export async function saveAdminFixture(token: string, payload: Record<string, any>) {
  const { error } = await supabase.rpc('eg_admin_upsert_fixture', { p_token: token, payload });
  if (error) throw new Error(error.message || 'Unable to save fixture');
  invalidateAdminConsoleCache();
}

export async function deleteAdminFixture(token: string, fixtureId: string) {
  const { error } = await supabase.rpc('eg_admin_delete_fixture', { p_token: token, p_fixture_id: fixtureId });
  if (error) throw new Error(error.message || 'Unable to delete fixture');
  invalidateAdminConsoleCache();
}

export async function regenerateAdminPreseason(token: string, teamCount: number) {
  const { error } = await supabase.rpc('eg_admin_regenerate_preseason', { p_token: token, p_team_count: teamCount });
  if (error) throw new Error(error.message || 'Failed to regenerate preseason');
  invalidateAdminConsoleCache();
}

export async function saveAdminProfile(token: string, userId: string, patch: {
  display_name?: string | null;
  psn?: string | null;
  team_id?: string | null;
}) {
  const { error } = await supabase.rpc('eg_admin_update_profile', {
    p_token: token,
    p_user_id: userId,
    p_display_name: patch.display_name ?? null,
    p_psn: patch.psn ?? null,
    p_team_id: patch.team_id ?? null,
  });
  if (error) throw new Error(error.message || 'Unable to update profile');
  invalidateAdminConsoleCache();
}

export async function setAdminProfileFlag(token: string, userId: string, isAdmin: boolean) {
  const { error } = await supabase.rpc('eg_admin_set_profile_admin', {
    p_token: token,
    p_user_id: userId,
    p_is_admin: isAdmin,
  });
  if (error) throw new Error(error.message || 'Unable to change admin flag');
  invalidateAdminConsoleCache();
}

export async function updateAdminRegistration(token: string, userId: string, action: 'approve' | 'deny' | 'unassign', teamId: string | null) {
  const { error } = await supabase.rpc('eg_admin_update_registration', {
    p_token: token,
    p_user_id: userId,
    p_action: action,
    p_team_id: action === 'approve' ? teamId : null,
  });
  if (error) throw new Error(error.message || 'Unable to update registration');
  invalidateAdminConsoleCache();
}

export async function clearAdminPreseasonFixtures(token: string, seasonId: string) {
  const { fixtures } = await fetchSeasonFixturesBySeasonId(seasonId, { limit: 3000, offset: 0 });
  for (const row of fixtures) {
    const { error } = await supabase.rpc('eg_admin_delete_fixture', {
      p_token: token,
      p_fixture_id: row.id,
    });
    if (error) throw new Error(error.message || 'Failed to clear preseason fixtures.');
  }
  invalidateAdminConsoleCache();
}
