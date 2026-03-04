import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CircleOff,
  KeyRound,
  LogOut,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  UserRoundCog,
  Wrench,
} from 'lucide-react';

import { supabase } from '../lib/supabaseClient';
import '../styles/admin-console.css';

type AdminTab = 'overview' | 'fixtures' | 'users' | 'registrations' | 'diagnostics';
type CompetitionKey = 'preseason' | 'afl26';

type TeamRow = {
  id: string;
  name: string;
  logo_url: string | null;
};

type SeasonMap = Record<CompetitionKey, string | null>;

type FixtureRow = {
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

type ProfileRow = {
  user_id: string;
  display_name: string;
  psn: string;
  team_id: string | null;
  role?: string | null;
  is_admin?: boolean | null;
};

type RegistrationRow = Record<string, any>;

type MetricCard = {
  label: string;
  value: number;
  hint: string;
};

type HealthItem = {
  label: string;
  value: number;
  hint: string;
};

const ADMIN_TOKEN_KEY = 'eg_admin_token';
const ADMIN_TOKEN_EXPIRES_AT_KEY = 'eg_admin_token_expires_at';
const REG_TABLE_CANDIDATES = ['eg_preseason_registrations_pretty'] as const;

const competitions: Array<{ key: CompetitionKey; label: string; slug: string }> = [
  { key: 'preseason', label: 'Knockout Preseason', slug: 'preseason' },
  { key: 'afl26', label: 'AFL26 Season Two', slug: 'afl26-season-two' },
];

type PasscodeResponse = {
  ok?: boolean;
  token?: string;
  expires_at?: string;
  expires_in?: number;
  error?: string;
};

type PasscodeAttemptResult = {
  response: PasscodeResponse;
  diagnostics: string[];
};

type SessionPingResponse = {
  ok?: boolean;
};

function parsePasscodePayload(data: any): PasscodeResponse {
  if (typeof data === 'string') {
    return { ok: Boolean(data.trim()), token: data.trim() };
  }
  if (Array.isArray(data)) {
    const first = data[0];
    if (typeof first === 'string') return { ok: Boolean(first.trim()), token: first.trim() };
    return (first || {}) as PasscodeResponse;
  }
  if (data && typeof data === 'object' && typeof data.token === 'string') {
    return data as PasscodeResponse;
  }
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

async function callSessionPing(token: string): Promise<{ ok: boolean; diagnostics: string[] }> {
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

async function callAdminPasscode(code: string): Promise<PasscodeAttemptResult> {
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

const tabs: Array<{ key: AdminTab; label: string; icon: JSX.Element }> = [
  { key: 'overview', label: 'Overview', icon: <Sparkles size={16} /> },
  { key: 'fixtures', label: 'Fixtures', icon: <Wrench size={16} /> },
  { key: 'users', label: 'Users', icon: <UserRoundCog size={16} /> },
  { key: 'registrations', label: 'Registrations', icon: <Shield size={16} /> },
  { key: 'diagnostics', label: 'Diagnostics', icon: <AlertTriangle size={16} /> },
];

function text(v: unknown): string {
  return String(v ?? '').trim();
}

function numberOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function safeIso(v: string): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const tzAdjusted = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tzAdjusted.toISOString().slice(0, 16);
}

function fromDatetimeLocal(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function seasonLabelForKey(key: CompetitionKey) {
  return competitions.find((c) => c.key === key)?.label || 'Competition';
}

async function findRegistrationsTable(): Promise<string | null> {
  const table = REG_TABLE_CANDIDATES[0];
  const probe = await supabase.from(table).select('user_id', { head: true, count: 'exact' });
  if (!probe.error) return table;
  return null;
}

export default function AdminConsolePage() {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [token, setToken] = useState<string>('');
  const [tokenExpiresAt, setTokenExpiresAt] = useState<number | null>(null);
  const [gateLoading, setGateLoading] = useState(true);
  const [passcode, setPasscode] = useState('');
  const [gateError, setGateError] = useState('');
  const [gateDiagnostics, setGateDiagnostics] = useState<string[]>([]);
  const [unlocking, setUnlocking] = useState(false);

  const [loading, setLoading] = useState(false);
  const [actioning, setActioning] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lastRpcError, setLastRpcError] = useState('');
  const [authUserId, setAuthUserId] = useState('');

  const [competitionKey, setCompetitionKey] = useState<CompetitionKey>('preseason');
  const [seasonMap, setSeasonMap] = useState<SeasonMap>({ preseason: null, afl26: null });
  const [teamCount, setTeamCount] = useState(10);

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [fixtures, setFixtures] = useState<FixtureRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [regTable, setRegTable] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricCard[]>([]);
  const [health, setHealth] = useState<HealthItem[]>([]);

  const [teamFilter, setTeamFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roundFilter, setRoundFilter] = useState('all');
  const [fixturesSearch, setFixturesSearch] = useState('');
  const [fixtureSort, setFixtureSort] = useState<'start' | 'round' | 'status'>('start');
  const [userSearch, setUserSearch] = useState('');
  const [userSort, setUserSort] = useState<'display' | 'team' | 'admin'>('display');
  const [registrationSearch, setRegistrationSearch] = useState('');
  const [registrationSort, setRegistrationSort] = useState<'created' | 'display' | 'status'>('created');

  const [fixtureDrafts, setFixtureDrafts] = useState<Record<string, FixtureRow>>({});
  const [profileDrafts, setProfileDrafts] = useState<Record<string, ProfileRow>>({});
  const [registrationTeamDrafts, setRegistrationTeamDrafts] = useState<Record<string, string>>({});

  const hasToken = Boolean(token);
  const sessionToken = token.trim();

  const pushNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => {
      setNotice((prev) => (prev === message ? '' : prev));
    }, 2200);
  }, []);

  const clearSession = useCallback((message?: string) => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_TOKEN_EXPIRES_AT_KEY);
    setToken('');
    setTokenExpiresAt(null);
    if (message) setGateError(message);
  }, []);

  const validateToken = useCallback(async (candidate: string) => {
    const normalized = String(candidate || '').trim();
    if (!normalized) return false;
    const ping = await callSessionPing(normalized);
    return ping.ok;
  }, []);

  const ensureSessionValid = useCallback(async () => {
    const normalized = String(sessionToken || '').trim();
    if (!normalized) throw new Error('Session expired — please unlock again.');
    const ok = await validateToken(normalized);
    if (!ok) {
      clearSession('Session expired — please unlock again.');
      throw new Error('Session expired — please unlock again.');
    }
    return normalized;
  }, [clearSession, sessionToken, validateToken]);

  const withRpcGuard = useCallback(
    async <T,>(fn: () => Promise<T>) => {
      try {
        setError('');
        setLastRpcError('');
        await ensureSessionValid();
        return await fn();
      } catch (err: any) {
        const message = String(err?.message || 'Request failed.');
        setError(message);
        setLastRpcError(message);
        if (/invalid|expired|token/i.test(message)) {
          clearSession('Session expired — please unlock again.');
        }
        return null;
      }
    },
    [clearSession, ensureSessionValid],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setAuthUserId(text(data?.user?.id));
    })();
    return () => {
      active = false;
    };
  }, []);

  const loadSeasonMap = useCallback(async () => {
    const next: SeasonMap = { preseason: null, afl26: null };
    await Promise.all(
      competitions.map(async (comp) => {
        const { data } = await supabase.from('eg_seasons').select('id').eq('slug', comp.slug).maybeSingle();
        next[comp.key] = text(data?.id) || null;
      }),
    );
    setSeasonMap(next);
    return next;
  }, []);

  const loadTeams = useCallback(async () => {
    const { data, error: teamsError } = await supabase.from('eg_teams').select('id,name,logo_url').order('name', { ascending: true });
    if (teamsError) throw new Error(teamsError.message || 'Unable to load teams');
    setTeams((data || []) as TeamRow[]);
  }, []);

  const loadProfiles = useCallback(async () => {
    const { data, error: profilesError } = await supabase.from('eg_profiles').select('*').limit(2000);
    if (profilesError) throw new Error(profilesError.message || 'Unable to load profiles');

    const rows = ((data || []) as any[]).map((row) => ({
      user_id: text(row.user_id || row.id),
      display_name: text(row.display_name),
      psn: text(row.psn),
      team_id: text(row.team_id) || null,
      role: text(row.role) || null,
      is_admin: typeof row.is_admin === 'boolean' ? row.is_admin : null,
    }));

    setProfiles(rows.filter((r) => r.user_id));
  }, []);

  const loadRegistrations = useCallback(async () => {
    const table = regTable || (await findRegistrationsTable());
    setRegTable(table);
    if (!table) {
      setRegistrations([]);
      return;
    }

    const { data, error: regError } = await supabase.from(table).select('*').limit(2000);
    if (regError) throw new Error(regError.message || 'Unable to load registrations');
    setRegistrations((data || []) as RegistrationRow[]);
  }, [regTable]);

  const loadFixtures = useCallback(
    async (mapValue: SeasonMap) => {
      const seasonId = mapValue[competitionKey];
      if (!seasonId) {
        setFixtures([]);
        return;
      }

      const { data, error: fixturesError } = await supabase
        .from('eg_fixture_cards')
        .select(
          'id,season_id,round,week_index,stage_name,status,start_time,venue,home_team_id,away_team_id,home_team_name,away_team_name,home_goals,home_behinds,home_total,away_goals,away_behinds,away_total',
        )
        .eq('season_id', seasonId)
        .order('week_index', { ascending: true, nullsFirst: false })
        .order('round', { ascending: true, nullsFirst: false })
        .order('start_time', { ascending: true, nullsFirst: false });

      if (fixturesError) throw new Error(fixturesError.message || 'Unable to load fixtures');

      const mapped = ((data || []) as any[]).map((f) => ({
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

      setFixtures(mapped);
      setFixtureDrafts({});
    },
    [competitionKey],
  );

  const loadDiagnostics = useCallback(
    async (mapValue: SeasonMap, rows: RegistrationRow[]) => {
      const preseasonSeasonId = mapValue.preseason;
      const seasonTwoSeasonId = mapValue.afl26;

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

      const metricCards: MetricCard[] = [
        {
          label: 'Knockout registrations',
          value: preseasonRegistrations,
          hint: 'season_slug = preseason',
        },
        {
          label: 'Users',
          value: usersRes.count || 0,
          hint: 'Rows in eg_profiles',
        },
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
        supabase.from('eg_fixture_cards').select('id', { count: 'exact', head: true }).or('home_team_name.is.null,away_team_name.is.null'),
        supabase.from('eg_profiles').select('user_id', { count: 'exact', head: true }).is('team_id', null),
      ]);

      const healthItems: HealthItem[] = [
        { label: 'Broken joins', value: badJoinRes.count || 0, hint: 'eg_fixture_cards rows missing team names' },
        { label: 'Teams missing logos', value: missingLogoRes.count || 0, hint: 'eg_teams.logo_url is empty' },
        { label: 'Profiles without team_id', value: profileMissingTeamRes.count || 0, hint: 'Optional, but affects “My Team” UX' },
      ];

      setMetrics(metricCards);
      setHealth(healthItems);
    },
    [],
  );

  const refreshAll = useCallback(async () => {
    if (!hasToken) return;
    await withRpcGuard(async () => {
      setLoading(true);
      const mapValue = await loadSeasonMap();
      const registrationsRows = await (async () => {
        const table = regTable || (await findRegistrationsTable());
        setRegTable(table);
        if (!table) {
          setRegistrations([]);
          return [] as RegistrationRow[];
        }
        const { data, error: regError } = await supabase.from(table).select('*').limit(2000);
        if (regError) throw new Error(regError.message || 'Unable to load registrations');
        const rows = (data || []) as RegistrationRow[];
        setRegistrations(rows);
        return rows;
      })();
      await Promise.all([loadTeams(), loadProfiles(), loadFixtures(mapValue), loadDiagnostics(mapValue, registrationsRows)]);
      setLoading(false);
      return true;
    });
    setLoading(false);
  }, [hasToken, loadDiagnostics, loadFixtures, loadProfiles, loadSeasonMap, loadTeams, regTable, withRpcGuard]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const stored = localStorage.getItem(ADMIN_TOKEN_KEY) || '';
      const storedToken = stored.trim();
      const storedExpiryRaw = localStorage.getItem(ADMIN_TOKEN_EXPIRES_AT_KEY);
      const storedExpiry = storedExpiryRaw ? Number(storedExpiryRaw) : null;

      if (!storedToken) {
        if (mounted) setGateLoading(false);
        return;
      }
      if (storedExpiry && Number.isFinite(storedExpiry) && Date.now() >= storedExpiry) {
        if (mounted) {
          clearSession('Session expired — please unlock again.');
          setGateLoading(false);
        }
        return;
      }

      const ping = await callSessionPing(storedToken);
      const ok = ping.ok;
      if (!mounted) return;
      if (ok) {
        setToken(storedToken);
        setTokenExpiresAt(Number.isFinite(storedExpiry || NaN) ? (storedExpiry as number) : null);
      } else {
        clearSession('Session expired — please unlock again.');
      }
      setGateLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [clearSession]);

  useEffect(() => {
    if (!tokenExpiresAt) return;
    const id = window.setInterval(() => {
      if (Date.now() >= tokenExpiresAt) {
        clearSession('Session expired — please unlock again.');
      }
    }, 30_000);
    return () => window.clearInterval(id);
  }, [clearSession, tokenExpiresAt]);

  useEffect(() => {
    if (!hasToken) return;
    const id = window.setInterval(async () => {
      const ping = await callSessionPing(sessionToken);
      if (!ping.ok) {
        clearSession('Session expired — please unlock again.');
      }
    }, 60_000);
    return () => window.clearInterval(id);
  }, [clearSession, hasToken, sessionToken]);

  useEffect(() => {
    if (!hasToken) return;
    refreshAll();
  }, [hasToken, refreshAll, competitionKey]);

  const availableRounds = useMemo(() => {
    const values = fixtures
      .map((f) => (competitionKey === 'preseason' ? f.week_index : f.round))
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    return Array.from(new Set(values)).sort((a, b) => a - b);
  }, [competitionKey, fixtures]);

  const filteredFixtures = useMemo(() => {
    const q = fixturesSearch.trim().toLowerCase();
    const filtered = fixtures.filter((f) => {
      if (statusFilter !== 'all' && f.status !== statusFilter) return false;
      if (teamFilter !== 'all' && f.home_team_id !== teamFilter && f.away_team_id !== teamFilter) return false;
      if (roundFilter !== 'all') {
        const target = Number(roundFilter);
        const actual = competitionKey === 'preseason' ? f.week_index : f.round;
        if (actual !== target) return false;
      }
      if (q) {
        const haystack = [f.home_team_name, f.away_team_name, f.venue, f.stage_name, f.status].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    return filtered.sort((a, b) => {
      if (fixtureSort === 'status') return String(a.status).localeCompare(String(b.status));
      if (fixtureSort === 'round') {
        const ar = competitionKey === 'preseason' ? a.week_index || 0 : a.round || 0;
        const br = competitionKey === 'preseason' ? b.week_index || 0 : b.round || 0;
        if (ar !== br) return ar - br;
      }
      const at = a.start_time ? new Date(a.start_time).getTime() : Number.MAX_SAFE_INTEGER;
      const bt = b.start_time ? new Date(b.start_time).getTime() : Number.MAX_SAFE_INTEGER;
      return at - bt;
    });
  }, [competitionKey, fixtureSort, fixtures, fixturesSearch, roundFilter, statusFilter, teamFilter]);

  const statusCounts = useMemo(() => {
    const counts = { all: fixtures.length, SCHEDULED: 0, FINAL: 0 };
    for (const f of fixtures) {
      if (f.status === 'FINAL') counts.FINAL += 1;
      else counts.SCHEDULED += 1;
    }
    return counts;
  }, [fixtures]);

  const filteredProfiles = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    const filtered = !q
      ? profiles
      : profiles.filter((p) => {
          const teamName = teams.find((t) => t.id === p.team_id)?.name || '';
          return [p.display_name, p.psn, p.user_id, teamName].join(' ').toLowerCase().includes(q);
        });
    const sorted = [...filtered].sort((a, b) => {
      if (userSort === 'admin') {
        const aAdmin = Boolean(a.is_admin || a.role === 'admin');
        const bAdmin = Boolean(b.is_admin || b.role === 'admin');
        if (aAdmin !== bAdmin) return aAdmin ? -1 : 1;
      } else if (userSort === 'team') {
        const aTeam = teams.find((t) => t.id === a.team_id)?.name || '';
        const bTeam = teams.find((t) => t.id === b.team_id)?.name || '';
        const teamCmp = aTeam.localeCompare(bTeam);
        if (teamCmp !== 0) return teamCmp;
      }
      return String(a.display_name).localeCompare(String(b.display_name));
    });
    return sorted;
  }, [profiles, teams, userSearch, userSort]);

  const filteredRegistrations = useMemo(() => {
    const q = registrationSearch.trim().toLowerCase();
    const filtered = !q
      ? registrations
      : registrations.filter((reg) => {
          const userId = text(reg.user_id);
          const profile = profiles.find((p) => p.user_id === userId);
          const display = text(reg.coach_display_name || reg.display_name || profile?.display_name);
          const psn = text(reg.coach_psn || reg.psn_name || reg.psn || profile?.psn);
          const status = text(reg.status || 'PENDING');
          const prefsFromView = text(reg.pref_team_names);
          const prefs = prefsFromView || extractPreferenceTeamIds(reg).map((id) => teams.find((t) => t.id === id)?.name || '').filter(Boolean).join(' ');
          return [userId, display, psn, status, prefs].join(' ').toLowerCase().includes(q);
        });
    return [...filtered].sort((a, b) => {
      if (registrationSort === 'display') {
        const ad = text(a.coach_display_name || a.display_name || profiles.find((p) => p.user_id === text(a.user_id))?.display_name);
        const bd = text(b.coach_display_name || b.display_name || profiles.find((p) => p.user_id === text(b.user_id))?.display_name);
        return ad.localeCompare(bd);
      }
      if (registrationSort === 'status') {
        return text(a.status || 'PENDING').localeCompare(text(b.status || 'PENDING'));
      }
      const at = new Date(text(a.created_at || a.updated_at || 0)).getTime();
      const bt = new Date(text(b.created_at || b.updated_at || 0)).getTime();
      return (Number.isFinite(bt) ? bt : 0) - (Number.isFinite(at) ? at : 0);
    });
  }, [profiles, registrationSearch, registrationSort, registrations, teams]);

  async function unlockAdmin(event: React.FormEvent) {
    event.preventDefault();
    setGateError('');
    setGateDiagnostics([]);
    setUnlocking(true);

    try {
      const { response: data, diagnostics } = await callAdminPasscode(passcode.trim());
      setLastRpcError('');
      setGateDiagnostics(diagnostics);
      if (!data?.ok || !data?.token) {
        setGateError('Invalid passcode.');
        return;
      }

      const fresh = String(data.token || '').trim();
      const ok = (await callSessionPing(fresh)).ok;
      if (!ok) {
        clearSession('Session token rejected by server.');
        return;
      }

      const expiresAtFromServer = data.expires_at ? new Date(data.expires_at).getTime() : null;
      const expiresInSec = Number(data.expires_in || 3600);
      const expiresAt =
        typeof expiresAtFromServer === 'number' && Number.isFinite(expiresAtFromServer) && expiresAtFromServer > Date.now()
          ? expiresAtFromServer
          : Date.now() + Math.max(60, expiresInSec) * 1000;
      localStorage.setItem(ADMIN_TOKEN_KEY, fresh);
      localStorage.setItem(ADMIN_TOKEN_EXPIRES_AT_KEY, String(expiresAt));
      setToken(fresh);
      setTokenExpiresAt(expiresAt);
      setPasscode('');
    } catch (err: any) {
      const diagnostics = Array.isArray(err?.diagnostics) ? (err.diagnostics as string[]) : [];
      if (diagnostics.length) setGateDiagnostics(diagnostics);
      const raw = String(err?.message || 'Unable to unlock admin console.');
      setLastRpcError(raw);
      if (/failed to fetch/i.test(raw)) {
        setGateError('Cannot reach Supabase endpoint. Run the admin RPC migration and confirm VITE_SUPABASE_URL/ANON_KEY are correct.');
      } else if (/failed to send a request to the edge function/i.test(raw)) {
        setGateError('Cannot reach Supabase Edge Function. RPC fallback can bypass this once migration is applied.');
      } else if (/function error \(404\)|not found/i.test(raw)) {
        setGateError('Edge Function `admin-passcode` is not deployed.');
      } else if (/eg_admin_exchange_passcode|does not exist/i.test(raw)) {
        setGateError('Admin RPC is missing. Run migration: 20260303_admin_passcode_rpc_fallback.sql');
      } else if (/server config missing/i.test(raw)) {
        setGateError('Function is deployed but missing env vars (ADMIN_PASSCODE or service role envs).');
      } else {
        setGateError(raw);
      }
    } finally {
      setUnlocking(false);
      setGateLoading(false);
    }
  }

  function logout() {
    clearSession();
    setFixtureDrafts({});
    setProfileDrafts({});
    setRegistrations([]);
    setPasscode('');
    setGateError('');
    setGateDiagnostics([]);
  }

  function updateFixtureDraft(id: string, patch: Partial<FixtureRow>) {
    setFixtureDrafts((prev) => {
      const source = prev[id] || fixtures.find((f) => f.id === id);
      if (!source) return prev;
      return { ...prev, [id]: { ...source, ...patch } };
    });
  }

  function addFixtureDraft() {
    const seasonId = seasonMap[competitionKey];
    if (!seasonId) {
      setError('Cannot add fixture: selected competition is missing a season row.');
      return;
    }

    const key = `new-${Date.now()}`;
    setFixtureDrafts((prev) => ({
      ...prev,
      [key]: {
        season_id: seasonId,
        round: competitionKey === 'preseason' ? 1 : (availableRounds[availableRounds.length - 1] || 1),
        week_index: competitionKey === 'preseason' ? 1 : null,
        stage_name: competitionKey === 'preseason' ? 'Round 1' : null,
        status: 'SCHEDULED',
        start_time: null,
        venue: null,
        home_team_id: null,
        away_team_id: null,
        home_goals: null,
        home_behinds: null,
        home_total: null,
        away_goals: null,
        away_behinds: null,
        away_total: null,
      },
    }));
  }

  async function saveFixture(id: string) {
    const draft = fixtureDrafts[id];
    if (!draft) return;

    if (!draft.home_team_id || !draft.away_team_id) {
      setError('Home and away teams are required.');
      return;
    }

    setActioning(`fx:${id}`);
    await withRpcGuard(async () => {
      const payload: Record<string, any> = {
        season_id: draft.season_id,
        round: draft.round,
        week_index: draft.week_index,
        stage_name: draft.stage_name,
        is_preseason: competitionKey === 'preseason',
        status: draft.status,
        start_time: draft.start_time,
        venue: draft.venue,
        home_team_id: draft.home_team_id,
        away_team_id: draft.away_team_id,
        home_goals: draft.home_goals,
        home_behinds: draft.home_behinds,
        home_total: draft.home_total,
        away_goals: draft.away_goals,
        away_behinds: draft.away_behinds,
        away_total: draft.away_total,
      };

      if (draft.id) payload.id = draft.id;

      const { error: rpcError } = await supabase.rpc('eg_admin_upsert_fixture', {
        p_token: sessionToken,
        payload,
      });

      if (rpcError) throw new Error(rpcError.message || 'Unable to save fixture');

      pushNotice('Fixture saved.');
      await refreshAll();
      return true;
    });
    setActioning('');
  }

  async function deleteFixture(id: string) {
    if (!id || id.startsWith('new-')) {
      setFixtureDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }

    if (!window.confirm('Delete this fixture? This cannot be undone.')) return;
    setActioning(`fxd:${id}`);
    await withRpcGuard(async () => {
      const { error: rpcError } = await supabase.rpc('eg_admin_delete_fixture', {
        p_token: sessionToken,
        p_fixture_id: id,
      });
      if (rpcError) throw new Error(rpcError.message || 'Unable to delete fixture');
      pushNotice('Fixture deleted.');
      await refreshAll();
      return true;
    });
    setActioning('');
  }

  async function regeneratePreseason() {
    setActioning('regen');
    await withRpcGuard(async () => {
      const { error: rpcError } = await supabase.rpc('eg_admin_regenerate_preseason', {
        p_token: sessionToken,
        p_team_count: teamCount,
      });
      if (rpcError) throw new Error(rpcError.message || 'Failed to regenerate preseason');
      pushNotice('Preseason regenerated.');
      await refreshAll();
      return true;
    });
    setActioning('');
  }

  function updateProfileDraft(userId: string, patch: Partial<ProfileRow>) {
    setProfileDrafts((prev) => {
      const source = prev[userId] || profiles.find((p) => p.user_id === userId);
      if (!source) return prev;
      return { ...prev, [userId]: { ...source, ...patch } };
    });
  }

  async function saveProfile(userId: string) {
    const draft = profileDrafts[userId];
    if (!draft) return;

    setActioning(`p:${userId}`);
    await withRpcGuard(async () => {
      const { error: rpcError } = await supabase.rpc('eg_admin_update_profile', {
        p_token: sessionToken,
        p_user_id: userId,
        p_display_name: draft.display_name || null,
        p_psn: draft.psn || null,
        p_team_id: draft.team_id || null,
      });
      if (rpcError) throw new Error(rpcError.message || 'Unable to update profile');
      pushNotice('Profile updated.');
      await refreshAll();
      return true;
    });
    setActioning('');
  }

  async function setProfileAdmin(userId: string, isAdmin: boolean) {
    setActioning(`pa:${userId}`);
    await withRpcGuard(async () => {
      const { error: rpcError } = await supabase.rpc('eg_admin_set_profile_admin', {
        p_token: sessionToken,
        p_user_id: userId,
        p_is_admin: isAdmin,
      });
      if (rpcError) throw new Error(rpcError.message || 'Unable to change admin flag');
      pushNotice(`Admin ${isAdmin ? 'enabled' : 'disabled'} for user.`);
      await refreshAll();
      return true;
    });
    setActioning('');
  }

  async function updateRegistration(userId: string, action: 'approve' | 'deny' | 'unassign') {
    const pickedTeamId = registrationTeamDrafts[userId] || null;
    if (action === 'approve' && !pickedTeamId) {
      setError('Pick a team before approving registration.');
      return;
    }
    if ((action === 'deny' || action === 'unassign') && !window.confirm(`Confirm ${action} for this registration?`)) {
      return;
    }

    setActioning(`r:${userId}:${action}`);
    await withRpcGuard(async () => {
      const { error: rpcError } = await supabase.rpc('eg_admin_update_registration', {
        p_token: sessionToken,
        p_user_id: userId,
        p_action: action,
        p_team_id: action === 'approve' ? pickedTeamId : null,
      });
      if (rpcError) throw new Error(rpcError.message || 'Unable to update registration');
      pushNotice(`Registration ${action}d.`);
      await loadRegistrations();
      return true;
    });
    setActioning('');
  }

  async function clearPreseasonFixtures() {
    if (!window.confirm('Clear all preseason fixtures? This cannot be undone.')) return;
    setActioning('clear-preseason');
    await withRpcGuard(async () => {
      const mapValue = await loadSeasonMap();
      const seasonId = mapValue.preseason;
      if (!seasonId) throw new Error('Preseason season_id not found.');

      const { data, error: listError } = await supabase.from('eg_fixtures').select('id').eq('season_id', seasonId).limit(3000);
      if (listError) throw new Error(listError.message || 'Unable to load preseason fixtures.');

      for (const row of (data || []) as Array<{ id: string }>) {
        const { error: deleteError } = await supabase.rpc('eg_admin_delete_fixture', {
          p_token: sessionToken,
          p_fixture_id: row.id,
        });
        if (deleteError) throw new Error(deleteError.message || 'Failed to clear preseason fixtures.');
      }

      pushNotice('Preseason fixtures cleared.');
      await refreshAll();
      return true;
    });
    setActioning('');
  }

  function extractPreferenceTeamIds(reg: RegistrationRow): string[] {
    const ids = new Set<string>();

    const preferenceRaw = reg.preferences;
    if (Array.isArray(preferenceRaw)) {
      for (const value of preferenceRaw) {
        const id = text(value);
        if (id) ids.add(id);
      }
    }

    if (Array.isArray(reg.pref_team_ids)) {
      for (const value of reg.pref_team_ids) {
        const id = text(value);
        if (id) ids.add(id);
      }
    }

    for (const key of ['pref_team_1', 'pref_team_2', 'pref_team_3', 'pref_team_4']) {
      const id = text(reg[key]);
      if (id) ids.add(id);
    }

    return Array.from(ids).slice(0, 4);
  }

  function exportRegistrationsCsv() {
    const teamById = new Map(teams.map((t) => [t.id, t]));
    const profileById = new Map(profiles.map((p) => [p.user_id, p]));
    const rows = registrations.map((reg) => {
      const userId = text(reg.user_id);
      const profile = profileById.get(userId);
      const prefNames = extractPreferenceTeamIds(reg).map((teamId) => teamById.get(teamId)?.name || 'Unknown');
      const directTeamName = text(reg.pref_team_names || reg.team_name);
      return {
        user_id: userId,
        display_name: text(reg.coach_display_name || reg.display_name || reg.profile_display_name || profile?.display_name),
        psn: text(reg.coach_psn || reg.psn_name || reg.psn || reg.profile_psn || profile?.psn),
        status: text(reg.status || 'PENDING').toUpperCase(),
        season_slug: text(reg.season_slug || 'preseason'),
        preferences: prefNames.length ? prefNames.join(' | ') : directTeamName,
        created_at: text(reg.created_at),
      };
    });

    const header = ['user_id', 'display_name', 'psn', 'status', 'season_slug', 'preferences', 'created_at'];
    const escape = (v: string) => `"${String(v || '').replace(/"/g, '""')}"`;
    const csv = [header.join(','), ...rows.map((row) => header.map((key) => escape((row as any)[key])).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eg_preseason_registrations_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const fixtureRowsForTable = useMemo(() => {
    const draftRows = Object.entries(fixtureDrafts)
      .filter(([id]) => id.startsWith('new-'))
      .map(([id, draft]) => ({ id, ...draft }));

    const liveRows = filteredFixtures.map((fixture) => ({
      ...fixture,
      ...(fixture.id && fixtureDrafts[fixture.id] ? fixtureDrafts[fixture.id] : {}),
      id: fixture.id,
    }));

    return [...draftRows, ...liveRows];
  }, [filteredFixtures, fixtureDrafts]);

  const emptyFixtureReason = useMemo(() => {
    if (!seasonMap[competitionKey]) return 'Selected competition slug is missing in eg_seasons.';
    if (fixtures.length === 0) return 'No fixtures exist for this season yet.';
    if (filteredFixtures.length === 0) return 'Current filters hide all fixtures.';
    return '';
  }, [competitionKey, filteredFixtures.length, fixtures.length, seasonMap]);

  if (gateLoading) {
    return (
      <section className="egAdminBoot">
        <RefreshCw size={20} className="spin" />
        <p>Checking admin session…</p>
      </section>
    );
  }

  return (
    <section className="egAdminRoot">
      {!hasToken ? (
        <div className="egAdminGate" role="dialog" aria-modal="true" aria-label="Admin passcode">
          <div className="egAdminGate__panel">
            <div className="egAdminGate__badge">
              <KeyRound size={16} /> Passcode Required
            </div>
            <h1>Elite Gaming Admin Console</h1>
            <p>Enter passcode to unlock admin tools for 1 hour.</p>
            <form onSubmit={unlockAdmin} className="egAdminGate__form">
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter passcode"
                autoFocus
              />
              <button type="submit" disabled={unlocking || !passcode.trim()}>
                {unlocking ? 'Verifying…' : 'Unlock'}
              </button>
            </form>
            {gateError ? <div className="egAdminGate__error">{gateError}</div> : null}
            {gateDiagnostics.length ? (
              <details className="egAdminGate__diag">
                <summary>Connection diagnostics</summary>
                <ul>
                  {gateDiagnostics.map((line, idx) => (
                    <li key={`${line}-${idx}`}>{line}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="egAdminMobileLock">Admin is desktop-only. Open this page on a larger screen.</div>

      <div className="egAdminShell" aria-hidden={!hasToken}>
        <aside className="egAdminSidebar">
          <div className="egAdminBrand">Elite Gaming Admin</div>
          <nav>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={tab.key === activeTab ? 'is-active' : ''}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
          <button type="button" className="egAdminLogout" onClick={logout}>
            <LogOut size={15} /> Logout
          </button>
        </aside>

        <div className="egAdminMain">
          <header className="egAdminTopbar">
            <div>
              <h2>{tabs.find((t) => t.key === activeTab)?.label || 'Overview'}</h2>
              <p>{seasonLabelForKey(competitionKey)} management</p>
              <p className="egAdminSessionLine">
                {hasToken
                  ? `Unlocked (${tokenExpiresAt ? `expires in ${Math.max(0, Math.ceil((tokenExpiresAt - Date.now()) / 60000))}m` : 'session active'})`
                  : 'Locked'}
              </p>
            </div>
            <button type="button" className="egAdminBtn ghost" onClick={refreshAll} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
            </button>
          </header>

          {error ? <div className="egAdminBanner is-error">{error}</div> : null}
          {notice ? <div className="egAdminBanner is-ok">{notice}</div> : null}
          {notice ? <div className="egAdminToast">{notice}</div> : null}

          {activeTab === 'overview' ? (
            <section className="egAdminGrid">
              <article className="egAdminStat wide">
                <h3>System Status</h3>
                <ul>
                  <li>
                    <Check size={14} />
                    <span>
                      <strong>Supabase:</strong> Connected
                    </span>
                  </li>
                  <li>
                    {authUserId ? <Check size={14} /> : <CircleOff size={14} />}
                    <span>
                      <strong>Current user:</strong> {authUserId ? `${authUserId.slice(0, 8)}…` : 'Unknown'}
                    </span>
                  </li>
                  <li>
                    {hasToken ? <Check size={14} /> : <CircleOff size={14} />}
                    <span>
                      <strong>Admin session:</strong> {hasToken ? 'Active' : 'Missing'}
                    </span>
                  </li>
                  <li>
                    {lastRpcError ? <AlertTriangle size={14} /> : <Check size={14} />}
                    <span>
                      <strong>Last RPC:</strong> {lastRpcError || 'No errors'}
                    </span>
                  </li>
                </ul>
              </article>
              {metrics.map((card) => (
                <article className="egAdminStat" key={card.label}>
                  <h3>{card.label}</h3>
                  <strong>{card.value}</strong>
                  <p>{card.hint}</p>
                </article>
              ))}
              <article className="egAdminStat wide">
                <h3>Health</h3>
                <ul>
                  {health.map((item) => (
                    <li key={item.label}>
                      {item.value > 0 ? <AlertTriangle size={14} /> : <Check size={14} />}
                      <span>
                        <strong>{item.label}:</strong> {item.value} <em>{item.hint}</em>
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
              <article className="egAdminStat wide">
                <h3>Why fixtures empty?</h3>
                <strong>{emptyFixtureReason || 'Fixtures loaded.'}</strong>
                <p>Check competition mapping, selected filters, and eg_fixture_cards joins.</p>
              </article>
            </section>
          ) : null}

          {activeTab === 'fixtures' ? (
            <section className="egAdminCard">
              <div className="egAdminToolbar">
                <label>
                  Competition
                  <select value={competitionKey} onChange={(e) => setCompetitionKey(e.target.value as CompetitionKey)}>
                    {competitions.map((comp) => (
                      <option key={comp.key} value={comp.key}>
                        {comp.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Round / Week
                  <select value={roundFilter} onChange={(e) => setRoundFilter(e.target.value)}>
                    <option value="all">All</option>
                    {availableRounds.map((roundValue) => (
                      <option key={roundValue} value={String(roundValue)}>
                        {competitionKey === 'preseason' ? `Week ${roundValue}` : `Round ${roundValue}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Team
                  <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
                    <option value="all">All teams</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Status
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="all">All ({statusCounts.all})</option>
                    <option value="SCHEDULED">Scheduled ({statusCounts.SCHEDULED})</option>
                    <option value="FINAL">Final ({statusCounts.FINAL})</option>
                  </select>
                </label>
                <label className="searchField">
                  <Search size={14} />
                  <input
                    type="text"
                    value={fixturesSearch}
                    onChange={(e) => setFixturesSearch(e.target.value)}
                    placeholder="Search team/venue"
                  />
                </label>
                <label>
                  Sort
                  <select value={fixtureSort} onChange={(e) => setFixtureSort(e.target.value as typeof fixtureSort)}>
                    <option value="start">Start time</option>
                    <option value="round">{competitionKey === 'preseason' ? 'Week' : 'Round'}</option>
                    <option value="status">Status</option>
                  </select>
                </label>
                <div className="egAdminToolbar__actions">
                  <button type="button" className="egAdminBtn" onClick={addFixtureDraft}>
                    Add fixture
                  </button>
                  <label className="inline-field">
                    Team count
                    <input
                      type="number"
                      min={4}
                      step={2}
                      value={teamCount}
                      onChange={(e) => setTeamCount(Math.max(4, Number(e.target.value) || 10))}
                    />
                  </label>
                  <button
                    type="button"
                    className="egAdminBtn gold"
                    onClick={regeneratePreseason}
                    disabled={actioning === 'regen' || competitionKey !== 'preseason'}
                    title={competitionKey !== 'preseason' ? 'Only available for preseason' : ''}
                  >
                    {actioning === 'regen' ? 'Generating…' : 'Regenerate preseason R1+R2'}
                  </button>
                  <button
                    type="button"
                    className="egAdminBtn danger"
                    onClick={clearPreseasonFixtures}
                    disabled={actioning === 'clear-preseason' || competitionKey !== 'preseason'}
                    title={competitionKey !== 'preseason' ? 'Only available for preseason' : ''}
                  >
                    {actioning === 'clear-preseason' ? 'Clearing…' : 'Clear preseason fixtures'}
                  </button>
                </div>
              </div>

              <div className="egAdminTableWrap">
                <table className="egAdminTable">
                  <thead>
                    <tr>
                      <th>Home</th>
                      <th>Away</th>
                      <th>{competitionKey === 'preseason' ? 'Week' : 'Round'}</th>
                      <th>Start time</th>
                      <th>Venue</th>
                      <th>Status</th>
                      <th>Score</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={8} className="egAdminEmptyRow">
                          <span className="egAdminInlineSkeleton" />
                        </td>
                      </tr>
                    ) : fixtureRowsForTable.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="egAdminEmptyRow">
                          {emptyFixtureReason || 'No fixtures'}
                        </td>
                      </tr>
                    ) : (
                      fixtureRowsForTable.map((row) => {
                        const rowId = text(row.id) || '';
                        const isBusy = actioning === `fx:${rowId}` || actioning === `fxd:${rowId}`;
                        return (
                          <tr key={rowId || `${row.home_team_id}-${row.away_team_id}-${row.start_time || ''}`}>
                            <td>
                              <select
                                value={row.home_team_id || ''}
                                onChange={(e) => updateFixtureDraft(rowId, { home_team_id: e.target.value || null })}
                              >
                                <option value="">Select</option>
                                {teams.map((team) => (
                                  <option key={team.id} value={team.id}>
                                    {team.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <select
                                value={row.away_team_id || ''}
                                onChange={(e) => updateFixtureDraft(rowId, { away_team_id: e.target.value || null })}
                              >
                                <option value="">Select</option>
                                {teams.map((team) => (
                                  <option key={team.id} value={team.id}>
                                    {team.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input
                                type="number"
                                min={1}
                                value={String(competitionKey === 'preseason' ? row.week_index || '' : row.round || '')}
                                onChange={(e) => {
                                  const val = numberOrNull(e.target.value);
                                  if (competitionKey === 'preseason') {
                                    updateFixtureDraft(rowId, {
                                      week_index: val,
                                      round: val,
                                      stage_name: val ? `Round ${val}` : null,
                                    });
                                  } else {
                                    updateFixtureDraft(rowId, { round: val });
                                  }
                                }}
                              />
                            </td>
                            <td>
                              <input
                                type="datetime-local"
                                value={safeIso(row.start_time || '')}
                                onChange={(e) => updateFixtureDraft(rowId, { start_time: fromDatetimeLocal(e.target.value) })}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                value={row.venue || ''}
                                onChange={(e) => updateFixtureDraft(rowId, { venue: e.target.value })}
                                placeholder="Venue"
                              />
                            </td>
                            <td>
                              <select
                                value={row.status || 'SCHEDULED'}
                                onChange={(e) => updateFixtureDraft(rowId, { status: e.target.value.toUpperCase() })}
                              >
                                <option value="SCHEDULED">SCHEDULED</option>
                                <option value="FINAL">FINAL</option>
                              </select>
                            </td>
                            <td>
                              <div className="scoreGrid">
                                <input
                                  type="number"
                                  placeholder="H"
                                  value={String(row.home_total ?? '')}
                                  onChange={(e) => updateFixtureDraft(rowId, { home_total: numberOrNull(e.target.value) })}
                                />
                                <input
                                  type="number"
                                  placeholder="A"
                                  value={String(row.away_total ?? '')}
                                  onChange={(e) => updateFixtureDraft(rowId, { away_total: numberOrNull(e.target.value) })}
                                />
                              </div>
                            </td>
                            <td>
                              <div className="rowActions">
                                <button type="button" className="egAdminBtn tiny" onClick={() => saveFixture(rowId)} disabled={isBusy}>
                                  {actioning === `fx:${rowId}` ? 'Saving…' : 'Save'}
                                </button>
                                <button
                                  type="button"
                                  className="egAdminBtn tiny danger"
                                  onClick={() => deleteFixture(rowId)}
                                  disabled={isBusy}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {activeTab === 'users' ? (
            <section className="egAdminCard">
              <div className="egAdminToolbar">
                <label className="searchField">
                  <Search size={14} />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search display name, PSN or team"
                  />
                </label>
                <label>
                  Sort
                  <select value={userSort} onChange={(e) => setUserSort(e.target.value as typeof userSort)}>
                    <option value="display">Display name</option>
                    <option value="team">Team</option>
                    <option value="admin">Admin first</option>
                  </select>
                </label>
              </div>

              <div className="egAdminTableWrap">
                <table className="egAdminTable">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Display name</th>
                      <th>PSN</th>
                      <th>Team</th>
                      <th>Admin</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="egAdminEmptyRow">
                          <span className="egAdminInlineSkeleton" />
                        </td>
                      </tr>
                    ) : filteredProfiles.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="egAdminEmptyRow">
                          No profiles found.
                        </td>
                      </tr>
                    ) : (
                      filteredProfiles.map((profile) => {
                        const userId = profile.user_id;
                        const draft = profileDrafts[userId] || profile;
                        return (
                          <tr key={userId}>
                            <td className="mono">{userId.slice(0, 8)}…</td>
                            <td>
                              <input
                                type="text"
                                value={draft.display_name || ''}
                                onChange={(e) => updateProfileDraft(userId, { display_name: e.target.value })}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                value={draft.psn || ''}
                                onChange={(e) => updateProfileDraft(userId, { psn: e.target.value })}
                              />
                            </td>
                            <td>
                              <select
                                value={draft.team_id || ''}
                                onChange={(e) => updateProfileDraft(userId, { team_id: e.target.value || null })}
                              >
                                <option value="">Unassigned</option>
                                {teams.map((team) => (
                                  <option key={team.id} value={team.id}>
                                    {team.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <button
                                type="button"
                                className={`egAdminBtn tiny ${(draft.is_admin || draft.role === 'admin') ? 'gold' : 'ghost'}`}
                                onClick={() => setProfileAdmin(userId, !(draft.is_admin || draft.role === 'admin'))}
                                disabled={actioning === `pa:${userId}`}
                              >
                                {(draft.is_admin || draft.role === 'admin') ? 'Admin' : 'User'}
                              </button>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="egAdminBtn tiny"
                                onClick={() => saveProfile(userId)}
                                disabled={actioning === `p:${userId}`}
                              >
                                {actioning === `p:${userId}` ? 'Saving…' : 'Save'}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {activeTab === 'registrations' ? (
            <section className="egAdminCard">
              <div className="egAdminToolbar">
                <div className="egAdminTag">Table: {regTable || 'not found'}</div>
                <button type="button" className="egAdminBtn ghost" onClick={loadRegistrations}>
                  Reload registrations
                </button>
                <button type="button" className="egAdminBtn" onClick={exportRegistrationsCsv} disabled={registrations.length === 0}>
                  Export CSV
                </button>
                <label className="searchField">
                  <Search size={14} />
                  <input
                    type="text"
                    value={registrationSearch}
                    onChange={(e) => setRegistrationSearch(e.target.value)}
                    placeholder="Search registrations"
                  />
                </label>
                <label>
                  Sort
                  <select value={registrationSort} onChange={(e) => setRegistrationSort(e.target.value as typeof registrationSort)}>
                    <option value="created">Newest</option>
                    <option value="display">Display</option>
                    <option value="status">Status</option>
                  </select>
                </label>
              </div>

              <div className="egAdminTableWrap">
                <table className="egAdminTable">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Display</th>
                      <th>PSN</th>
                      <th>Preferences</th>
                      <th>Status</th>
                      <th>Team</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="egAdminEmptyRow">
                          <span className="egAdminInlineSkeleton" />
                        </td>
                      </tr>
                    ) : filteredRegistrations.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="egAdminEmptyRow">
                          No registrations found.
                        </td>
                      </tr>
                    ) : (
                      filteredRegistrations.map((row) => {
                        const userId = text(row.user_id);
                        const profile = profiles.find((p) => p.user_id === userId);
                        const status = text(row.status || 'PENDING').toUpperCase();
                        const psn = text(row.coach_psn || row.psn_name || row.psn || row.profile_psn || profile?.psn || '');
                        const display = text(
                          row.coach_display_name || row.display_name || row.profile_display_name || profile?.display_name || 'Unknown',
                        );
                        const prefIds = extractPreferenceTeamIds(row);
                        const directTeamName = text(row.pref_team_names || row.team_name);
                        const teamId = text(row.team_id || row.selected_team_id || registrationTeamDrafts[userId] || '');
                        return (
                          <tr key={`${userId}-${text(row.created_at)}`}>
                            <td className="mono">{userId ? `${userId.slice(0, 8)}…` : 'Unknown'}</td>
                            <td>{display || 'TBC'}</td>
                            <td>{psn || 'TBC'}</td>
                            <td>
                              <div className="egAdminPreferenceChips">
                                {prefIds.length ? (
                                  prefIds.map((id) => {
                                    const team = teams.find((t) => t.id === id);
                                    return (
                                      <span className="egAdminPrefChip" key={id} title={team?.name || 'Unknown team'}>
                                        {team?.logo_url ? <img src={team.logo_url} alt={team.name} /> : <span className="dot" />}
                                        {team?.name || 'Unknown'}
                                      </span>
                                    );
                                  })
                                ) : directTeamName ? (
                                  <span className="egAdminPrefChip" title={directTeamName}>
                                    {directTeamName}
                                  </span>
                                ) : (
                                  <span className="egAdminTextMuted">No preferences</span>
                                )}
                              </div>
                            </td>
                            <td>{status}</td>
                            <td>
                              <select
                                value={teamId}
                                onChange={(e) =>
                                  setRegistrationTeamDrafts((prev) => ({
                                    ...prev,
                                    [userId]: e.target.value,
                                  }))
                                }
                              >
                                <option value="">Unassigned</option>
                                {teams.map((team) => (
                                  <option key={team.id} value={team.id}>
                                    {team.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <div className="rowActions">
                                <button
                                  type="button"
                                  className="egAdminBtn tiny"
                                  onClick={() => updateRegistration(userId, 'approve')}
                                  disabled={actioning === `r:${userId}:approve`}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="egAdminBtn tiny ghost"
                                  onClick={() => updateRegistration(userId, 'deny')}
                                  disabled={actioning === `r:${userId}:deny`}
                                >
                                  Deny
                                </button>
                                <button
                                  type="button"
                                  className="egAdminBtn tiny danger"
                                  onClick={() => updateRegistration(userId, 'unassign')}
                                  disabled={actioning === `r:${userId}:unassign`}
                                >
                                  Unassign
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {activeTab === 'diagnostics' ? (
            <section className="egAdminGrid">
              {health.map((card) => (
                <article className="egAdminStat" key={card.label}>
                  <h3>{card.label}</h3>
                  <strong>{card.value}</strong>
                  <p>{card.hint}</p>
                </article>
              ))}
              <article className="egAdminStat wide">
                <h3>Quick checks</h3>
                <ul>
                  <li>{fixtures.length === 0 ? <CircleOff size={14} /> : <Check size={14} />} Fixtures loaded for selected season</li>
                  <li>{teams.length === 0 ? <CircleOff size={14} /> : <Check size={14} />} Teams available for joins/filtering</li>
                  <li>{profiles.length === 0 ? <CircleOff size={14} /> : <Check size={14} />} Profiles available for assignment</li>
                </ul>
              </article>
            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}
