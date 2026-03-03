import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock3, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../state/auth/AuthProvider';
import { supabase } from '../lib/supabaseClient';
import '../styles/preseason-registration.css';

type TeamRow = {
  id: string;
  name: string;
  logo_url?: string | null;
};

type ProfileRow = {
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  psn?: string | null;
};

type RegistrationRow = {
  user_id: string;
  season_slug?: string | null;
  pref_team_ids?: string[] | null;
  pref_team_1?: string | null;
  pref_team_2?: string | null;
  pref_team_3?: string | null;
  pref_team_4?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function text(v: unknown): string {
  return String(v || '').trim();
}

function readPrefs(row: RegistrationRow | null): string[] {
  if (!row) return [];
  if (Array.isArray(row.pref_team_ids) && row.pref_team_ids.length) {
    return row.pref_team_ids.map((id) => text(id)).filter(Boolean);
  }
  return [row.pref_team_1, row.pref_team_2, row.pref_team_3, row.pref_team_4].map((id) => text(id)).filter(Boolean);
}

function prettySubmittedAt(iso: string | null | undefined): string {
  const raw = text(iso);
  if (!raw) return 'Submitted recently';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return 'Submitted recently';
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

export default function PreseasonRegistrationPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [existingRegistration, setExistingRegistration] = useState<RegistrationRow | null>(null);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      setLoading(false);
      return;
    }

    let alive = true;

    (async () => {
      setLoading(true);
      setFatalError(null);

      try {
        const [teamsRes, profileRes, regRes] = await Promise.all([
          supabase.from('eg_teams').select('id,name,logo_url').order('name', { ascending: true }),
          supabase.from('eg_profiles').select('first_name,last_name,display_name,psn').eq('user_id', user.id).maybeSingle(),
          supabase.from('eg_preseason_registrations').select('*').eq('user_id', user.id).eq('season_slug', 'preseason').maybeSingle(),
        ]);

        if (!alive) return;

        if (teamsRes.error) throw new Error(teamsRes.error.message || 'Unable to load teams.');
        if (profileRes.error) throw new Error(profileRes.error.message || 'Unable to load your profile.');
        if (regRes.error) throw new Error(regRes.error.message || 'Unable to load your registration.');

        setTeams((teamsRes.data || []) as TeamRow[]);
        setProfile((profileRes.data || null) as ProfileRow | null);

        const row = (regRes.data || null) as RegistrationRow | null;
        setExistingRegistration(row);

        const existingPrefs = readPrefs(row).slice(0, 4);
        if (existingPrefs.length) {
          setSelectedTeamIds(existingPrefs);
          setSubmitted(true);
        }
      } catch (err: any) {
        console.error('[EG CRASH] PreseasonRegistration load failed', err);
        if (!alive) return;
        setFatalError(String(err?.message || 'Unable to load registration page.'));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [authLoading, user?.id]);

  const firstName = text(profile?.first_name);
  const lastName = text(profile?.last_name);
  const displayName = text(profile?.display_name);
  const psn = text(profile?.psn) || text(user?.psn);

  const readOnlyFirst = firstName || displayName.split(' ')[0] || 'Not set';
  const readOnlyLast = lastName || (displayName.split(' ').slice(1).join(' ') || 'Not set');
  const readOnlyPsn = psn || 'Not set';

  const selectedNames = useMemo(() => {
    const map = new Map(teams.map((team) => [team.id, team.name]));
    return selectedTeamIds.map((id) => map.get(id) || id);
  }, [selectedTeamIds, teams]);

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
      navigate('/auth/sign-in', { state: { from: '/preseason-registration' } });
      return;
    }

    if (!selectedTeamIds.length) {
      setInlineError('Select at least one team preference.');
      return;
    }

    setInlineError(null);
    setSubmitting(true);

    try {
      const nowIso = new Date().toISOString();
      const payload = {
        user_id: user.id,
        season_slug: 'preseason',
        pref_team_ids: selectedTeamIds,
        pref_team_1: selectedTeamIds[0] || null,
        pref_team_2: selectedTeamIds[1] || null,
        pref_team_3: selectedTeamIds[2] || null,
        pref_team_4: selectedTeamIds[3] || null,
        first_name: readOnlyFirst === 'Not set' ? null : readOnlyFirst,
        last_name: readOnlyLast === 'Not set' ? null : readOnlyLast,
        psn_name: readOnlyPsn === 'Not set' ? null : readOnlyPsn,
        updated_at: nowIso,
      };

      const { error } = await supabase.from('eg_preseason_registrations').upsert(payload, { onConflict: 'user_id,season_slug' });
      if (error) throw new Error(error.message || 'Unable to save registration.');

      await supabase.from('eg_profiles').update({ preseason_registered: true, updated_at: nowIso }).eq('user_id', user.id);

      setExistingRegistration({
        user_id: user.id,
        season_slug: 'preseason',
        pref_team_ids: selectedTeamIds,
        updated_at: nowIso,
      });
      setSubmitted(true);
    } catch (err: any) {
      console.error('[EG CRASH] PreseasonRegistration submit failed', err);
      setInlineError(String(err?.message || 'Unable to submit registration.'));
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

  if (!authLoading && !user) {
    return (
      <div className="prPage">
        <div className="prShell">
          <section className="prHero">
            <div className="prHero__badge">
              <ShieldCheck size={14} /> KNOCKOUT PRESEASON
            </div>
            <h1>Register for Knockout Preseason</h1>
            <p>2 rounds guaranteed • Top 8 seeded finals • Grand Final</p>
            <div className="prHero__note">Seeding based on AFL26 Season One form</div>
          </section>

          <section className="prGate">
            <h2>Sign in required</h2>
            <p>Step 2 unlocks once your account is active.</p>
            <button type="button" className="prBtn prBtn--primary" onClick={() => navigate('/auth/sign-in', { state: { from: '/preseason-registration' } })}>
              Sign In <ArrowRight size={15} />
            </button>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="prPage">
      <div className="prShell">
        <section className="prHero">
          <div className="prHero__badge">
            <ShieldCheck size={14} /> KNOCKOUT PRESEASON
          </div>
          <h1>Register for Knockout Preseason</h1>
          <p>2 rounds guaranteed • Top 8 seeded finals • Grand Final</p>
          <div className="prHero__note">Seeding based on AFL26 Season One form</div>
        </section>

        <section className="prFormatCard">
          <div className="prFormatCard__line">
            <span className="prFormatCard__label">Format:</span>
            <span>2 rounds guaranteed</span>
            <span className="prFormatCard__dot">•</span>
            <span className="prFormatCard__accent">Top 8 seeded finals</span>
            <span className="prFormatCard__dot">•</span>
            <span>Grand Final</span>
          </div>
        </section>

        {loading ? (
          <section className="prLoading" aria-label="Loading registration">
            <div className="prSkeleton" />
            <div className="prSkeleton" />
            <div className="prSkeleton" />
          </section>
        ) : submitted ? (
          <section className="prConfirmCard">
            <div className="prConfirmCard__icon">
              <CheckCircle2 size={22} />
            </div>
            <h2>You’re registered</h2>
            <p>Your preference list has been saved for Knockout Preseason.</p>
            <div className="prSubmittedAt">
              <Clock3 size={13} /> Submitted {prettySubmittedAt(existingRegistration?.updated_at || existingRegistration?.created_at)}
            </div>
            <div className="prConfirmCard__prefs">
              {selectedNames.map((name, index) => (
                <div key={`${name}-${index}`} className="prPrefPill">
                  Preference {index + 1}: {name}
                </div>
              ))}
            </div>
            <button type="button" className="prBtn prBtn--primary" onClick={() => navigate('/')}>
              Return Home
            </button>
          </section>
        ) : (
          <section className="prFormCard">
            <div className="prFormCard__head">
              <h2>Step 2: Register Now</h2>
              <p>Your account is set. Choose up to 4 preferred teams.</p>
            </div>

            <div className="prIdentityRow prIdentityRow--triple">
              <label>
                <span>First Name</span>
                <input value={readOnlyFirst} readOnly aria-readonly="true" />
              </label>
              <label>
                <span>Last Name</span>
                <input value={readOnlyLast} readOnly aria-readonly="true" />
              </label>
              <label>
                <span>PSN</span>
                <input value={readOnlyPsn} readOnly aria-readonly="true" />
              </label>
            </div>

            <form onSubmit={submitRegistration} className="prForm" noValidate>
              <div className="prPrefsHead">
                <span>Team Preferences</span>
                <span>{selectedTeamIds.length}/4</span>
              </div>

              <div className="prTeamGrid">
                {teams.map((team) => {
                  const active = selectedTeamIds.includes(team.id);
                  return (
                    <button
                      key={team.id}
                      type="button"
                      className={`prTeamCard ${active ? 'is-active' : ''}`}
                      onClick={() => toggleTeam(team.id)}
                      aria-pressed={active}
                    >
                      <div className="prTeamCard__logoWrap">
                        {team.logo_url ? <img src={team.logo_url} alt={team.name} loading="lazy" /> : <span>{team.name.slice(0, 2).toUpperCase()}</span>}
                      </div>
                      <div className="prTeamCard__name">{team.name}</div>
                    </button>
                  );
                })}
              </div>

              {inlineError ? <div className="prInlineError">{inlineError}</div> : null}

              <button type="submit" className="prBtn prBtn--primary" disabled={submitting || !selectedTeamIds.length}>
                {submitting ? 'Submitting…' : 'Confirm Registration'}
              </button>
            </form>
          </section>
        )}
      </div>
    </div>
  );
}
