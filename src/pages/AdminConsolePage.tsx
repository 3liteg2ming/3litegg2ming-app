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
  preseason_seed: number | null;
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

const ADMIN_TOKEN_KEY = 'eg_admin_token';
const ADMIN_TOKEN_EXPIRES_AT_KEY = 'eg_admin_token_expires_at';
const REG_TABLE_CANDIDATES = ['eg_preseason_registrations', 'EG_preseason_registrations'] as const;

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
  if (Array.isArray(data)) return (data[0] || {}) as PasscodeResponse;
  return (data || {}) as PasscodeResponse;
}

function parseSessionPing(data: any): boolean {
  if (typeof data === 'boolean') return data;
  if (Array.isArray(data)) {
    const first = data[0];
    if (typeof first === 'boolean') return first;
    return Boolean((first as SessionPingResponse | undefined)?.ok);
  }
  return Boolean((data as SessionPingResponse | undefined)?.ok);
}

async function callSessionPing(token: string): Promise<{ ok: boolean; diagnostics: string[] }> {
  const diagnostics: string[] = [];
  const normalized = String(token || '').trim();
  if (!normalized) return { ok: false, diagnostics: ['[Ping] empty token'] };

  const pingNew = await supabase.rpc('eg_admin_session_ping', { token: normalized });
  if (!pingNew.error) {
    diagnostics.push('[Ping] eg_admin_session_ping(token) ok');
    return { ok: parseSessionPing(pingNew.data), diagnostics };
  }
  diagnostics.push(`[Ping] eg_admin_session_ping(token) ${pingNew.error.message || 'failed'}`);

  const pingNewPrefixed = await supabase.rpc('eg_admin_session_ping', { p_token: normalized });
  if (!pingNewPrefixed.error) {
    diagnostics.push('[Ping] eg_admin_session_ping(p_token) ok');
    return { ok: parseSessionPing(pingNewPrefixed.data), diagnostics };
  }
  diagnostics.push(`[Ping] eg_admin_session_ping(p_token) ${pingNewPrefixed.error.message || 'failed'}`);

  const pingLegacy = await supabase.rpc('eg_admin_validate_session', { p_token: normalized });
  if (!pingLegacy.error) {
    diagnostics.push('[Ping] eg_admin_validate_session(p_token) ok');
    return { ok: parseSessionPing(pingLegacy.data), diagnostics };
  }
  diagnostics.push(`[Ping] eg_admin_validate_session(p_token) ${pingLegacy.error.message || 'failed'}`);

  return { ok: false, diagnostics };
}

async function callAdminPasscode(code: string): Promise<PasscodeAttemptResult> {
  const diagnostics: string[] = [];
  const normalizedCode = String(code || '').trim();

  // Preferred path: DB-backed RPC.
  const rpcPreferred = await supabase.rpc('eg_admin_exchange_passcode', { code: normalizedCode });
  if (!rpcPreferred.error) {
    const payload = parsePasscodePayload(rpcPreferred.data);
    diagnostics.push(`[RPC] eg_admin_exchange_passcode(code) response received`);
    if (payload?.ok && payload?.token) {
      diagnostics.push(`[RPC] unlocked`);
      return { response: payload, diagnostics };
    }
    diagnostics.push(`[RPC] passcode rejected`);
    return { response: payload, diagnostics };
  }
  diagnostics.push(`[RPC] eg_admin_exchange_passcode(code) ${rpcPreferred.error.message || 'request failed'}`);

  // Backward-compatible signature.
  const rpcFallback = await supabase.rpc('eg_admin_exchange_passcode', { p_code: normalizedCode });
  if (!rpcFallback.error) {
    const payload = parsePasscodePayload(rpcFallback.data);
    diagnostics.push(`[RPC] eg_admin_exchange_passcode(p_code) response received`);
    if (payload?.ok && payload?.token) {
      diagnostics.push(`[RPC] unlocked`);
      return { response: payload, diagnostics };
    }
    diagnostics.push(`[RPC] passcode rejected`);
    return { response: payload, diagnostics };
  }
  diagnostics.push(`[RPC] eg_admin_exchange_passcode(p_code) ${rpcFallback.error.message || 'request failed'}`);

  const invoked = await supabase.functions.invoke('admin-passcode', { body: { code: normalizedCode } });
  if (!invoked.error) {
    diagnostics.push(`[Edge invoke] response received`);
    return { response: parsePasscodePayload(invoked.data), diagnostics };
  }
  diagnostics.push(`[Edge invoke] ${invoked.error.message || 'request failed'}`);

  // Fallback path for environments where functions.invoke transport fails.
  const url = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const anon = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '');
  if (!url || !anon) {
    diagnostics.push(`[Edge HTTP] missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY`);
    const e = new Error(invoked.error.message || 'Missing Supabase env vars.');
    (e as any).diagnostics = diagnostics;
    throw e;
  }

  try {
    const res = await fetch(`${url}/functions/v1/admin-passcode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anon,
        Authorization: `Bearer ${anon}`,
      },
      body: JSON.stringify({ code: normalizedCode }),
    });

    const payload = (await res.json().catch(() => ({}))) as PasscodeResponse;
    diagnostics.push(`[Edge HTTP] status ${res.status}`);
    if (!res.ok) {
      if (res.status === 401) {
        return { response: { ok: false, error: 'Invalid passcode.' }, diagnostics };
      }
      const e = new Error(payload.error || `Function error (${res.status})`);
      (e as any).diagnostics = diagnostics;
      throw e;
    }
    return { response: parsePasscodePayload(payload), diagnostics };
  } catch (err: any) {
    diagnostics.push(`[Edge HTTP] ${String(err?.message || 'request failed')}`);
    const e = new Error(err?.message || 'Failed to fetch');
    (e as any).diagnostics = diagnostics;
    throw e;
  }
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
  for (const table of REG_TABLE_CANDIDATES) {
    const probe = await supabase.from(table).select('user_id', { head: true, count: 'exact' });
    if (!probe.error) return table;
    if (!String(probe.error.message || '').toLowerCase().includes('does not exist')) return null;
  }
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

  const [competitionKey, setCompetitionKey] = useState<CompetitionKey>('preseason');
  const [seasonMap, setSeasonMap] = useState<SeasonMap>({ preseason: null, afl26: null });
  const [teamCount, setTeamCount] = useState(10);

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [fixtures, setFixtures] = useState<FixtureRow[]>([]);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [regTable, setRegTable] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricCard[]>([]);

  const [teamFilter, setTeamFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roundFilter, setRoundFilter] = useState('all');
  const [userSearch, setUserSearch] = useState('');

  const [fixtureDrafts, setFixtureDrafts] = useState<Record<string, FixtureRow>>({});
  const [profileDrafts, setProfileDrafts] = useState<Record<string, ProfileRow>>({});
  const [registrationTeamDrafts, setRegistrationTeamDrafts] = useState<Record<string, string>>({});

  const hasToken = Boolean(token);
  const sessionToken = token.trim();

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
        await ensureSessionValid();
        return await fn();
      } catch (err: any) {
        const message = String(err?.message || 'Request failed.');
        setError(message);
        if (/invalid|expired|token/i.test(message)) {
          clearSession('Session expired — please unlock again.');
        }
        return null;
      }
    },
    [clearSession, ensureSessionValid],
  );

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
    const withSeed = await supabase
      .from('eg_teams')
      .select('id,name,logo_url,preseason_seed')
      .order('name', { ascending: true });
    if (!withSeed.error) {
      setTeams((withSeed.data || []) as TeamRow[]);
      return;
    }

    const msg = String(withSeed.error.message || '').toLowerCase();
    const missingSeedColumn = msg.includes('preseason_seed') && (msg.includes('does not exist') || msg.includes('column'));
    if (!missingSeedColumn) throw new Error(withSeed.error.message || 'Unable to load teams');

    const fallback = await supabase.from('eg_teams').select('id,name,logo_url').order('name', { ascending: true });
    if (fallback.error) throw new Error(fallback.error.message || 'Unable to load teams');

    const patched = ((fallback.data || []) as Array<Omit<TeamRow, 'preseason_seed'>>).map((row) => ({
      ...row,
      preseason_seed: null,
    }));
    setTeams(patched);
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
    async (mapValue: SeasonMap) => {
      const cards: MetricCard[] = [];

      for (const comp of competitions) {
        const seasonId = mapValue[comp.key];
        if (!seasonId) {
          cards.push({ label: `${comp.label} fixtures`, value: 0, hint: 'Season slug missing from eg_seasons' });
          continue;
        }
        const res = await supabase
          .from('eg_fixtures')
          .select('id', { count: 'exact', head: true })
          .eq('season_id', seasonId);
        cards.push({ label: `${comp.label} fixtures`, value: res.count || 0, hint: `season_id: ${seasonId.slice(0, 8)}…` });
      }

      const [missingLogoRes, badJoinRes, profileMissingTeamRes] = await Promise.all([
        supabase
          .from('eg_teams')
          .select('id', { count: 'exact', head: true })
          .or('logo_url.is.null,logo_url.eq.'),
        supabase
          .from('eg_fixture_cards')
          .select('id', { count: 'exact', head: true })
          .or('home_team_name.is.null,away_team_name.is.null'),
        supabase.from('eg_profiles').select('user_id', { count: 'exact', head: true }).is('team_id', null),
      ]);

      cards.push({
        label: 'Teams missing logos',
        value: missingLogoRes.count || 0,
        hint: 'Update eg_teams.logo_url',
      });
      cards.push({
        label: 'Fixtures with broken joins',
        value: badJoinRes.count || 0,
        hint: 'Check eg_fixture_cards view + team ids',
      });
      cards.push({
        label: 'Profiles without team',
        value: profileMissingTeamRes.count || 0,
        hint: 'Common reason for “My Team” filters showing empty',
      });

      setMetrics(cards);
    },
    [],
  );

  const refreshAll = useCallback(async () => {
    if (!hasToken) return;
    await withRpcGuard(async () => {
      setLoading(true);
      const mapValue = await loadSeasonMap();
      await Promise.all([loadTeams(), loadProfiles(), loadRegistrations(), loadFixtures(mapValue), loadDiagnostics(mapValue)]);
      setLoading(false);
      return true;
    });
    setLoading(false);
  }, [hasToken, loadDiagnostics, loadFixtures, loadProfiles, loadRegistrations, loadSeasonMap, loadTeams, withRpcGuard]);

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
  }, [clearSession, validateToken]);

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
    return fixtures.filter((f) => {
      if (statusFilter !== 'all' && f.status !== statusFilter) return false;
      if (teamFilter !== 'all' && f.home_team_id !== teamFilter && f.away_team_id !== teamFilter) return false;
      if (roundFilter !== 'all') {
        const target = Number(roundFilter);
        const actual = competitionKey === 'preseason' ? f.week_index : f.round;
        if (actual !== target) return false;
      }
      return true;
    });
  }, [competitionKey, fixtures, roundFilter, statusFilter, teamFilter]);

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
    if (!q) return profiles;
    return profiles.filter((p) => {
      const teamName = teams.find((t) => t.id === p.team_id)?.name || '';
      return [p.display_name, p.psn, p.user_id, teamName].join(' ').toLowerCase().includes(q);
    });
  }, [profiles, teams, userSearch]);

  async function unlockAdmin(event: React.FormEvent) {
    event.preventDefault();
    setGateError('');
    setGateDiagnostics([]);
    setUnlocking(true);

    try {
      const { response: data, diagnostics } = await callAdminPasscode(passcode.trim());
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

      setNotice('Fixture saved.');
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

    setActioning(`fxd:${id}`);
    await withRpcGuard(async () => {
      const { error: rpcError } = await supabase.rpc('eg_admin_delete_fixture', {
        p_token: sessionToken,
        p_fixture_id: id,
      });
      if (rpcError) throw new Error(rpcError.message || 'Unable to delete fixture');
      setNotice('Fixture deleted.');
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
      setNotice('Preseason regenerated.');
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
      setNotice('Profile updated.');
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
      setNotice(`Admin ${isAdmin ? 'enabled' : 'disabled'} for user.`);
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

    setActioning(`r:${userId}:${action}`);
    await withRpcGuard(async () => {
      const { error: rpcError } = await supabase.rpc('eg_admin_update_registration', {
        p_token: sessionToken,
        p_user_id: userId,
        p_action: action,
        p_team_id: action === 'approve' ? pickedTeamId : null,
      });
      if (rpcError) throw new Error(rpcError.message || 'Unable to update registration');
      setNotice(`Registration ${action}d.`);
      await loadRegistrations();
      return true;
    });
    setActioning('');
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

          {activeTab === 'overview' ? (
            <section className="egAdminGrid">
              {metrics.map((card) => (
                <article className="egAdminStat" key={card.label}>
                  <h3>{card.label}</h3>
                  <strong>{card.value}</strong>
                  <p>{card.hint}</p>
                </article>
              ))}
              <article className="egAdminStat wide">
                <h3>Why fixtures empty?</h3>
                <strong>{emptyFixtureReason || 'Fixtures loaded.'}</strong>
                <p>Check selected competition, season slug mapping, and row counts.</p>
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
                    {fixtureRowsForTable.length === 0 ? (
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
                    {filteredProfiles.length === 0 ? (
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
              </div>

              <div className="egAdminTableWrap">
                <table className="egAdminTable">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>PSN</th>
                      <th>Status</th>
                      <th>Team</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registrations.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="egAdminEmptyRow">
                          No registrations found.
                        </td>
                      </tr>
                    ) : (
                      registrations.map((row) => {
                        const userId = text(row.user_id);
                        const status = text(row.status || 'PENDING').toUpperCase();
                        const psn = text(row.psn_name || row.psn || '');
                        const teamId = text(row.team_id || row.selected_team_id || registrationTeamDrafts[userId] || '');
                        return (
                          <tr key={userId || Math.random()}>
                            <td className="mono">{userId ? `${userId.slice(0, 8)}…` : 'Unknown'}</td>
                            <td>{psn || 'TBC'}</td>
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
              {metrics.map((card) => (
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
