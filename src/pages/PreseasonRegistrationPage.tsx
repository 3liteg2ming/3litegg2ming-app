import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import RegistrationHeroCard from '../components/RegistrationHeroCard';
import TeamLogoGrid from '../components/TeamLogoGrid';
import { getTeamAssets } from '../lib/teamAssets';
import { useAuth } from '../state/auth/AuthProvider';
import { supabase } from '../lib/supabaseClient';
import '../styles/preseason-registration.css';

type TeamRow = {
  id: string;
  name: string;
  logo_url?: string | null;
  slug?: string | null;
};

type TeamFetchRow = {
  id: string | null;
  name: string | null;
  logo_url?: string | null;
  slug?: string | null;
};

type ProfileRow = {
  display_name?: string | null;
  psn?: string | null;
};

type RegistrationRow = {
  user_id: string;
  season_slug?: string | null;
  coach_display_name?: string | null;
  coach_psn?: string | null;
  pref_team_names?: string | string[] | null;
  preferences?: unknown;
  pref_team_ids?: string[] | null;
  pref_team_1?: string | null;
  pref_team_2?: string | null;
  pref_team_3?: string | null;
  pref_team_4?: string | null;
};

type PrettyRegistrationSummary = {
  coachDisplayName: string;
  coachPsn: string;
  prefTeamNames: string;
};

function text(v: unknown): string {
  return String(v || '').trim();
}

function isPlaceholderPsn(value: unknown): boolean {
  const normalized = text(value).toLowerCase().replace(/\s+/g, '');
  return normalized === 'yourpsn' || normalized === 'yourpsnid';
}

function hasMissingSeasonSlug(error: unknown): boolean {
  const msg = String((error as any)?.message || '').toLowerCase();
  return msg.includes('season_slug') && (msg.includes('column') || msg.includes('does not exist'));
}

function readPrefs(row: RegistrationRow | null): string[] {
  if (!row) return [];

  const direct = row.preferences;
  if (Array.isArray(direct)) {
    const parsed = direct.map((item) => text(item)).filter(Boolean);
    if (parsed.length) return parsed;
  }

  if (typeof direct === 'string') {
    try {
      const parsed = JSON.parse(direct);
      if (Array.isArray(parsed)) {
        const list = parsed.map((item) => text(item)).filter(Boolean);
        if (list.length) return list;
      }
    } catch {
      // ignore malformed string
    }
  }

  if (Array.isArray(row.pref_team_ids) && row.pref_team_ids.length) {
    return row.pref_team_ids.map((id) => text(id)).filter(Boolean);
  }

  return [row.pref_team_1, row.pref_team_2, row.pref_team_3, row.pref_team_4].map((id) => text(id)).filter(Boolean);
}

function assetKeyFromSlugOrName(slug: string, rawName: string): string {
  const s = text(slug).toLowerCase();
  const n = text(rawName).toLowerCase();
  if (s) {
    if (s.includes('port-adelaide')) return 'port adelaide';
    if (s.includes('adelaide')) return 'adelaide';
    if (s.includes('north-melbourne')) return 'north melbourne';
    if (s.includes('melbourne')) return 'melbourne';
    if (s.includes('western-bulldogs') || s.includes('bulldogs')) return 'western bulldogs';
    if (s.includes('gws')) return 'gws';
    if (s.includes('gold-coast')) return 'gold coast';
    if (s.includes('st-kilda')) return 'st kilda';
    if (s.includes('west-coast')) return 'west coast';
    if (s.includes('collingwood')) return 'collingwood';
    if (s.includes('carlton')) return 'carlton';
    if (s.includes('brisbane')) return 'brisbane';
    if (s.includes('fremantle')) return 'fremantle';
    if (s.includes('essendon')) return 'essendon';
    if (s.includes('geelong')) return 'geelong';
    if (s.includes('hawthorn')) return 'hawthorn';
    if (s.includes('richmond')) return 'richmond';
    if (s.includes('sydney')) return 'sydney';
  }
  return n;
}

function normalizeLogoUrl(raw: string | null | undefined, slug: string | null | undefined, rawName: string): string {
  const value = text(raw);

  if (value) {
    if (/^https?:\/\//i.test(value)) return value;
    if (value.startsWith('/storage/v1/object/public/')) {
      const base = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
      if (base) return `${base}${value}`;
    }

    const cleaned = value.replace(/^\/+/, '').replace(/^public\//, '');
    const asAssetsPath = cleaned.replace(/^assets\//i, '');
    const publicUrl = supabase.storage.from('Assets').getPublicUrl(asAssetsPath).data.publicUrl;
    if (publicUrl) return publicUrl;
  }

  const mapped = getTeamAssets(assetKeyFromSlugOrName(text(slug), rawName)).logo;
  return text(mapped);
}

function shortTeamName(name: string): string {
  const raw = text(name);
  if (!raw) return 'Team';

  const normalized = raw.toLowerCase();
  const exactMap: Record<string, string> = {
    'adelaide crows': 'Adelaide',
    adelaide: 'Adelaide',
    'brisbane lions': 'Brisbane',
    brisbane: 'Brisbane',
    'carlton blues': 'Carlton',
    carlton: 'Carlton',
    collingwood: 'Collingwood',
    'essendon bombers': 'Essendon',
    essendon: 'Essendon',
    fremantle: 'Fremantle',
    geelong: 'Geelong',
    'gold coast suns': 'Gold Coast',
    'gold coast': 'Gold Coast',
    gws: 'GWS',
    'greater western sydney': 'GWS',
    hawthorn: 'Hawthorn',
    melbourne: 'Melbourne',
    'north melbourne': 'North Melbourne',
    port: 'Port Adelaide',
    'port adelaide': 'Port Adelaide',
    richmond: 'Richmond',
    'st kilda': 'St Kilda',
    sydney: 'Sydney',
    westcoast: 'West Coast',
    'west coast': 'West Coast',
    bulldogs: 'Bulldogs',
    'western bulldogs': 'Bulldogs',
  };
  if (exactMap[normalized]) return exactMap[normalized];

  const stripped = raw
    .replace(/\bfootball club\b/gi, '')
    .replace(/\bfc\b/gi, '')
    .replace(/\bthe\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped || raw;
}

function dedupeTeams(rows: TeamFetchRow[]): TeamFetchRow[] {
  const byKey = new Map<string, TeamFetchRow>();

  const score = (r: TeamFetchRow) => {
    const hasLogo = Boolean(text(r.logo_url));
    const hasSlug = Boolean(text(r.slug));
    const nameLen = text(r.name).length;
    return (hasLogo ? 100 : 0) + (hasSlug ? 10 : 0) + Math.min(nameLen, 50);
  };

  rows.forEach((row) => {
    const rawName = text(row.name);
    const rawSlug = text(row.slug);
    const display = rawName ? shortTeamName(rawName) : '';
    const key = text(display || rawSlug || row.id).toLowerCase();
    if (!key) return;

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      return;
    }

    if (score(row) > score(existing)) {
      byKey.set(key, row);
    }
  });

  return Array.from(byKey.values());
}

function seasonSlugCandidates(): string[] {
  return ['preseason-2026', 'preseason'];
}

async function loadProfile(userId: string): Promise<ProfileRow | null> {
  const primary = await supabase.from('profiles').select('display_name,psn').eq('user_id', userId).maybeSingle();
  if (!primary.error) return (primary.data || null) as ProfileRow | null;

  const fallback = await supabase.from('eg_profiles').select('display_name,psn').eq('user_id', userId).maybeSingle();
  if (!fallback.error) return (fallback.data || null) as ProfileRow | null;

  throw new Error(primary.error.message || fallback.error.message || 'Unable to load profile.');
}

async function loadRegistrationFromTable(userId: string): Promise<RegistrationRow | null> {
  for (const slug of seasonSlugCandidates()) {
    const scoped = await supabase
      .from('eg_preseason_registrations')
      .select('*')
      .eq('user_id', userId)
      .eq('season_slug', slug)
      .maybeSingle();

    if (!scoped.error) return (scoped.data || null) as RegistrationRow | null;
    if (!hasMissingSeasonSlug(scoped.error)) continue;
  }

  const fallback = await supabase.from('eg_preseason_registrations').select('*').eq('user_id', userId).maybeSingle();
  if (!fallback.error) return (fallback.data || null) as RegistrationRow | null;

  return null;
}

async function loadPrettyRegistration(userId: string): Promise<RegistrationRow | null> {
  for (const slug of seasonSlugCandidates()) {
    const scoped = await supabase
      .from('eg_preseason_registrations_pretty')
      .select('*')
      .eq('user_id', userId)
      .eq('season_slug', slug)
      .maybeSingle();

    if (!scoped.error) return (scoped.data || null) as RegistrationRow | null;
    if (!hasMissingSeasonSlug(scoped.error)) continue;
  }

  const fallbackByUser = await supabase
    .from('eg_preseason_registrations_pretty')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!fallbackByUser.error) return (fallbackByUser.data || null) as RegistrationRow | null;
  return null;
}

async function saveProfileFlag(userId: string, nowIso: string) {
  const payload = { preseason_registered: true, updated_at: nowIso };
  const primary = await supabase.from('profiles').update(payload).eq('user_id', userId);
  if (!primary.error) return;
  await supabase.from('eg_profiles').update(payload).eq('user_id', userId);
}

async function resolvePreseasonSeasonId(): Promise<string | null> {
  const exact = await supabase.from('eg_seasons').select('id').eq('slug', 'preseason-2026').maybeSingle();
  if (!exact.error && exact.data?.id) return String(exact.data.id);

  const fallback = await supabase.from('eg_seasons').select('id').eq('slug', 'preseason').maybeSingle();
  if (!fallback.error && fallback.data?.id) return String(fallback.data.id);

  return null;
}

async function insertRegistration(userId: string, selectedTeamIds: string[]) {
  const seasonId = await resolvePreseasonSeasonId();

  const payload = {
    user_id: userId,
    pref_team_ids: selectedTeamIds,
    pref_team_1: selectedTeamIds[0] ?? null,
    pref_team_2: selectedTeamIds[1] ?? null,
    pref_team_3: selectedTeamIds[2] ?? null,
    pref_team_4: selectedTeamIds[3] ?? null,
    season_id: seasonId,
    season_slug: 'preseason-2026',
  };

  const inserted = await supabase.from('eg_preseason_registrations').insert(payload);
  if (!inserted.error) return;

  const duplicate = String(inserted.error.message || '').toLowerCase();
  if (duplicate.includes('duplicate key') || duplicate.includes('unique')) {
    const updated = await supabase
      .from('eg_preseason_registrations')
      .update(payload)
      .eq('user_id', userId);
    if (!updated.error) return;
    throw new Error(updated.error.message || 'Unable to save registration.');
  }

  throw new Error(inserted.error.message || 'Unable to save registration.');
}

function formatPrefNames(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((v) => text(v)).filter(Boolean).join(', ');
  }
  return text(value);
}

export default function PreseasonRegistrationPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submittedSummary, setSubmittedSummary] = useState<PrettyRegistrationSummary | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      navigate('/auth/sign-in', { replace: true, state: { from: '/preseason-registration' } });
      return;
    }

    let alive = true;

    (async () => {
      setLoading(true);
      setFatalError(null);

      try {
        const [teamsRes, profileRes, regRes, prettyRes] = await Promise.all([
          supabase.from('eg_teams').select('id,name,logo_url,slug').order('name', { ascending: true }),
          loadProfile(user.id),
          loadRegistrationFromTable(user.id),
          loadPrettyRegistration(user.id),
        ]);

        if (!alive) return;

        if (teamsRes.error) throw new Error(teamsRes.error.message || 'Unable to load teams.');

        const deduped = dedupeTeams((teamsRes.data || []) as TeamFetchRow[]);
        const rows = deduped
          .map((team) => {
            const id = text(team.id);
            const rawName = text(team.name);
            if (!id || !rawName) return null;
            return {
              id,
              slug: text(team.slug) || null,
              name: shortTeamName(rawName),
              logo_url: normalizeLogoUrl(team.logo_url || null, team.slug || null, rawName),
            } as TeamRow;
          })
          .filter((team): team is TeamRow => Boolean(team));

        const seen = new Set<string>();
        const finalRows = rows.filter((team) => {
          const key = shortTeamName(team.name).toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        setTeams(finalRows);
        if (import.meta.env.DEV && finalRows.length !== 18) {
          console.warn(
            '[PreseasonRegistration] Team count not 18 after dedupe:',
            finalRows.length,
            finalRows.map((team) => team.name),
          );
        }

        setProfile(profileRes);

        const existingPrefs = readPrefs((regRes || null) as RegistrationRow | null).slice(0, 4);
        if (existingPrefs.length) {
          setSelectedTeamIds(existingPrefs);
          setSubmitted(true);
        }

        if (prettyRes) {
          setSubmittedSummary({
            coachDisplayName: text(prettyRes.coach_display_name) || text(profileRes?.display_name) || '',
            coachPsn: text(prettyRes.coach_psn) || text(profileRes?.psn) || '',
            prefTeamNames: formatPrefNames(prettyRes.pref_team_names),
          });
        }
      } catch (error: any) {
        console.error('[EG CRASH] PreseasonRegistration load failed', error);
        if (!alive) return;
        setFatalError(String(error?.message || 'Unable to load registration page.'));
      } finally {
        if (alive) {
          setTeamsLoading(false);
          setLoading(false);
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [authLoading, navigate, user?.id]);

  const signedInName = useMemo(() => {
    const display = text(profile?.display_name);
    if (display) return display;
    return text(user?.email).split('@')[0] || 'Coach';
  }, [profile?.display_name, user?.email]);

  const profilePsn = useMemo(() => {
    const value = text(profile?.psn);
    return !isPlaceholderPsn(value) ? value : '';
  }, [profile?.psn]);

  const selectedTeamSet = useMemo(() => new Set(selectedTeamIds), [selectedTeamIds]);

  const selectedNames = useMemo(() => {
    const map = new Map(teams.map((team) => [team.id, team.name]));
    return selectedTeamIds.map((id) => map.get(id) || id);
  }, [selectedTeamIds, teams]);

  const heroLogos = useMemo(() => {
    const selectedRows = teams.filter((team) => selectedTeamSet.has(team.id));
    return {
      left: selectedRows[0]?.logo_url || null,
      right: selectedRows[1]?.logo_url || null,
    };
  }, [selectedTeamSet, teams]);

  function toggleTeam(teamId: string) {
    if (submitted) return;
    setInlineError(null);

    setSelectedTeamIds((prev) => {
      if (prev.includes(teamId)) return prev.filter((id) => id !== teamId);
      if (prev.length >= 4) {
        setInlineError('You can select up to 4 preferences.');
        return prev;
      }
      return [...prev, teamId];
    });
  }

  async function submitRegistration(event: React.FormEvent) {
    event.preventDefault();

    if (!user?.id) {
      navigate('/auth/sign-in', { replace: true, state: { from: '/preseason-registration' } });
      return;
    }

    if (!selectedTeamIds.length) {
      setInlineError('Select at least one team preference.');
      return;
    }

    if (!profilePsn) {
      setInlineError('Add your PSN in Profile to register.');
      return;
    }

    setInlineError(null);
    setSubmitting(true);

    try {
      const nowIso = new Date().toISOString();
      await insertRegistration(user.id, selectedTeamIds);
      const pretty = await loadPrettyRegistration(user.id);
      if (pretty) {
        setSubmittedSummary({
          coachDisplayName: text(pretty.coach_display_name) || signedInName,
          coachPsn: text(pretty.coach_psn) || profilePsn,
          prefTeamNames: formatPrefNames(pretty.pref_team_names),
        });
      } else {
        setSubmittedSummary({
          coachDisplayName: signedInName,
          coachPsn: profilePsn,
          prefTeamNames: selectedNames.join(', '),
        });
      }
      await saveProfileFlag(user.id, nowIso);
      setSubmitted(true);
    } catch (error: any) {
      console.error('[EG CRASH] PreseasonRegistration submit failed', error);
      setInlineError(String(error?.message || 'Unable to submit registration.'));
    } finally {
      setSubmitting(false);
    }
  }

  if (fatalError) {
    return (
      <div className="prPage">
        <div className="prShell">
          <section className="prErrorCard">
            <h1>Something went wrong</h1>
            <p>{fatalError}</p>
            <button type="button" className="prBtn prBtn--primary" onClick={() => window.location.reload()}>
              Reload
            </button>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="prPage">
      <div className="prShell">
        <RegistrationHeroCard
          title="Registration"
          subtitle="2 rounds → Top 8 finals → Grand Final"
          kicker="KNOCKOUT PRESEASON"
          leftLogoUrl={heroLogos.left}
          rightLogoUrl={heroLogos.right}
          fallbackMark="EG"
          cta={
            !submitted ? (
              <button type="button" className="prBtn prBtn--primary" onClick={() => document.getElementById('pr-form')?.scrollIntoView({ behavior: 'smooth' })}>
                Register Now
              </button>
            ) : null
          }
          helper={<span>Signed in as {signedInName}</span>}
        />

        {loading ? (
          <section className="prLoading" aria-label="Loading registration">
            <div className="prSkeleton" />
            <div className="prSkeleton" />
          </section>
        ) : submitted ? (
          <section className="prConfirmCard">
            <div className="prConfirmCard__icon">
              <CheckCircle2 size={22} />
            </div>
            <h2>You’re registered</h2>
            <div className="prConfirmCard__prefs">
              <div className="prPrefPill">Coach name: {submittedSummary?.coachDisplayName || signedInName}</div>
              <div className="prPrefPill">PSN: {submittedSummary?.coachPsn || profilePsn}</div>
              <div className="prPrefPill">Teams: {submittedSummary?.prefTeamNames || selectedNames.join(', ') || 'TBC'}</div>
            </div>
            <button type="button" className="prBtn prBtn--primary" onClick={() => navigate('/')}>
              Done
            </button>
          </section>
        ) : (
          <section className="prFormCard" id="pr-form">
            <form onSubmit={submitRegistration} className="prForm" noValidate>
              <p className="prProgress">Signed in as {signedInName}</p>
              <p className="prGridHeading">Select up to 4 teams</p>

              <TeamLogoGrid
                teams={teams}
                selectedTeamIds={selectedTeamIds}
                onToggle={toggleTeam}
                maxSelections={4}
                disabled={submitting}
                loading={teamsLoading}
                emptyMessage="Team logos are syncing. Try again shortly."
              />

              {inlineError ? <div className="prInlineError">{inlineError}</div> : null}

              <button type="submit" className="prBtn prBtn--primary prBtn--confirm" disabled={submitting || !selectedTeamIds.length}>
                {submitting ? 'Submitting…' : 'Confirm Registration'}
              </button>
            </form>
          </section>
        )}
      </div>
    </div>
  );
}
