import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Circle, Sparkles, Trophy, Clock3 } from 'lucide-react';

import { useAuth } from '../state/auth/AuthProvider';
import { supabase } from '../lib/supabaseClient';
import '../styles/home.css';

type TeamRow = {
  id: string;
  name: string;
  logo_url?: string | null;
};

type ProfileRow = {
  first_name?: string | null;
  display_name?: string | null;
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

type FixturePreviewRow = {
  id: string;
  stage_name?: string | null;
  round?: number | null;
  week_index?: number | null;
  start_time?: string | null;
  venue?: string | null;
  home_team_name?: string | null;
  away_team_name?: string | null;
  home_team_logo_url?: string | null;
  away_team_logo_url?: string | null;
};

type HomeData = {
  teams: TeamRow[];
  profile: ProfileRow | null;
  registration: RegistrationRow | null;
  registrationCount: number | null;
  previewFixtures: FixturePreviewRow[];
};

function text(v: unknown): string {
  return String(v || '').trim();
}

function readPrefIds(row: RegistrationRow | null): string[] {
  if (!row) return [];
  if (Array.isArray(row.pref_team_ids) && row.pref_team_ids.length) {
    return row.pref_team_ids.map((id) => text(id)).filter(Boolean);
  }
  return [row.pref_team_1, row.pref_team_2, row.pref_team_3, row.pref_team_4].map((id) => text(id)).filter(Boolean);
}

function prettyDateTime(iso: string | null | undefined): string {
  const value = text(iso);
  if (!value) return 'TBA';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'TBA';
  return new Intl.DateTimeFormat('en-AU', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

function prettySubmittedAt(iso: string | null | undefined): string {
  const value = text(iso);
  if (!value) return 'Submitted recently';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Submitted recently';
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

function isMissingTableError(error: unknown): boolean {
  const msg = String((error as any)?.message || '').toLowerCase();
  return msg.includes('does not exist') || msg.includes('relation') || msg.includes('42p01');
}

export default function HomePage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string>('');
  const [data, setData] = useState<HomeData>({
    teams: [],
    profile: null,
    registration: null,
    registrationCount: null,
    previewFixtures: [],
  });

  useEffect(() => {
    let alive = true;

    const warnings: string[] = [];

    async function run() {
      setLoading(true);
      setNotice('');

      const next: HomeData = {
        teams: [],
        profile: null,
        registration: null,
        registrationCount: null,
        previewFixtures: [],
      };

      const teamsRes = await supabase.from('eg_teams').select('id,name,logo_url').order('name', { ascending: true });
      if (teamsRes.error) {
        warnings.push('Unable to load teams right now.');
        console.error('[EG CRASH] Home teams query failed', teamsRes.error);
      } else {
        next.teams = ((teamsRes.data || []) as TeamRow[]).map((t) => ({
          id: text(t?.id),
          name: text(t?.name) || 'Unknown Team',
          logo_url: t?.logo_url || null,
        }));
      }

      const regCountRes = await supabase
        .from('eg_preseason_registrations')
        .select('user_id', { head: true, count: 'exact' })
        .eq('season_slug', 'preseason');
      if (regCountRes.error) {
        if (!isMissingTableError(regCountRes.error)) {
          warnings.push('Could not load registration count.');
        }
        console.error('[EG CRASH] Home registration count failed', regCountRes.error);
      } else {
        next.registrationCount = typeof regCountRes.count === 'number' ? regCountRes.count : 0;
      }

      if (user?.id) {
        const [profileRes, regRes] = await Promise.all([
          supabase.from('eg_profiles').select('first_name,display_name').eq('user_id', user.id).maybeSingle(),
          supabase.from('eg_preseason_registrations').select('*').eq('user_id', user.id).eq('season_slug', 'preseason').maybeSingle(),
        ]);

        if (profileRes.error) {
          warnings.push('Could not load your profile details.');
          console.error('[EG CRASH] Home profile query failed', profileRes.error);
        } else {
          next.profile = (profileRes.data || null) as ProfileRow | null;
        }

        if (regRes.error) {
          if (!isMissingTableError(regRes.error)) {
            warnings.push('Could not load your registration status.');
          }
          console.error('[EG CRASH] Home registration status failed', regRes.error);
        } else {
          next.registration = (regRes.data || null) as RegistrationRow | null;
        }
      }

      const seasonRes = await supabase.from('eg_seasons').select('id').eq('slug', 'preseason').maybeSingle();
      if (seasonRes.error) {
        warnings.push('Could not resolve preseason season.');
        console.error('[EG CRASH] Home season lookup failed', seasonRes.error);
      } else {
        const seasonId = text(seasonRes.data?.id);
        if (seasonId) {
          const fixturesRes = await supabase
            .from('eg_fixture_cards')
            .select('id,stage_name,round,week_index,start_time,venue,home_team_name,away_team_name,home_team_logo_url,away_team_logo_url')
            .eq('season_id', seasonId)
            .order('week_index', { ascending: true, nullsFirst: false })
            .order('round', { ascending: true, nullsFirst: false })
            .order('start_time', { ascending: true, nullsFirst: false })
            .limit(3);

          if (fixturesRes.error) {
            warnings.push('Could not load fixture preview.');
            console.error('[EG CRASH] Home fixture preview failed', fixturesRes.error);
          } else {
            next.previewFixtures = (fixturesRes.data || []) as FixturePreviewRow[];
          }
        }
      }

      if (!alive) return;
      setData(next);
      setNotice(warnings[0] || '');
      setLoading(false);
    }

    run().catch((err) => {
      console.error('[EG CRASH] HomePage unexpected error', err);
      if (!alive) return;
      setNotice('We hit an unexpected issue loading Home. Try reloading.');
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [user?.id]);

  const signedInName = useMemo(() => {
    const first = text(data.profile?.first_name);
    if (first) return first;
    const display = text(data.profile?.display_name);
    if (display) return display;
    const authDisplay = text(user?.displayName);
    if (authDisplay) return authDisplay;
    return text(user?.email).split('@')[0] || 'Coach';
  }, [data.profile?.display_name, data.profile?.first_name, user?.displayName, user?.email]);

  const teamMap = useMemo(() => new Map(data.teams.map((t) => [t.id, t])), [data.teams]);
  const prefTeamRows = useMemo(() => {
    return readPrefIds(data.registration)
      .slice(0, 4)
      .map((id) => teamMap.get(id))
      .filter((team): team is TeamRow => Boolean(team));
  }, [data.registration, teamMap]);

  return (
    <div className="homePage">
      <div className="homeShell">
        <section className="homeStatusCard homeStatusCard--hook">
          <div className="homeStatusHead">
            <div>
              <div className="homeStatusKicker">Knockout Preseason</div>
              <h1 className="homeStatusTitle">Registration Status</h1>
              <p className="homeStatusSubtitle">2 rounds guaranteed → seeded Top 8 finals → Grand Final</p>
              <p className="homeStatusSeed">Seeded by AFL26 Season One form</p>
            </div>
            {typeof data.registrationCount === 'number' ? <div className="homeSocialProof">Registered so far: {data.registrationCount}</div> : null}
          </div>

          {notice ? <div className="homeNotice">{notice}</div> : null}

          {loading || authLoading ? (
            <div className="homeStatusSkeletons">
              <div className="homeSkel" />
              <div className="homeSkel" />
            </div>
          ) : !user ? (
            <div className="homeStateBlock">
              <h2>Create account / Sign in to register</h2>
              <p>Sign in to lock your preseason entry and submit up to 4 team preferences.</p>
              <div className="homeStatusActions">
                <button type="button" className="homeBtn homeBtn--ghost" onClick={() => navigate('/auth/sign-in')}>
                  Sign In
                </button>
                <button type="button" className="homeBtn homeBtn--primary" onClick={() => navigate('/auth/sign-up')}>
                  Create Account
                </button>
              </div>
            </div>
          ) : !data.registration ? (
            <div className="homeStateBlock">
              <h2>You’re eligible • Register now</h2>
              <p>Pick up to 4 team preferences for Knockout Preseason.</p>
              <div className="homeStatusActions">
                <button type="button" className="homeBtn homeBtn--primary" onClick={() => navigate('/preseason-registration')}>
                  Register Now <ArrowRight size={16} />
                </button>
              </div>
              <div className="homeSignedChip">Signed in as {signedInName}</div>
            </div>
          ) : (
            <div className="homeStateBlock">
              <h2>Registered ✅</h2>
              <p>Assignments announced after registrations close.</p>
              <div className="homeTimestamp">
                <Clock3 size={13} /> Submitted {prettySubmittedAt(data.registration.updated_at || data.registration.created_at)}
              </div>
              <div className="homePrefGrid">
                {prefTeamRows.length ? (
                  prefTeamRows.map((team, idx) => (
                    <div key={team.id} className="homePrefCard">
                      <div className="homePrefCard__logo">
                        {team.logo_url ? <img src={team.logo_url} alt={team.name} loading="lazy" /> : <span>{team.name.slice(0, 2).toUpperCase()}</span>}
                      </div>
                      <div className="homePrefCard__text">
                        <small>Preference {idx + 1}</small>
                        <strong>{team.name}</strong>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="homeMuted">Your preference list is saved.</div>
                )}
              </div>
              <button type="button" className="homeBtn homeBtn--ghost" onClick={() => navigate('/preseason-registration')}>
                Edit Preferences
              </button>
            </div>
          )}
        </section>

        <section className="homeHow">
          <h3>How It Works</h3>
          <ul>
            <li>
              <Circle size={16} />
              <span>Create account (first name, last name, PSN, email, password)</span>
            </li>
            <li>
              <Sparkles size={16} />
              <span>Pick up to 4 team preferences for Knockout Preseason</span>
            </li>
            <li>
              <Trophy size={16} />
              <span>2 rounds guaranteed → seeded Top 8 finals → Grand Final</span>
            </li>
          </ul>
        </section>

        <section className="homePreview">
          <h3>Mini Schedule Preview</h3>
          {data.previewFixtures.length ? (
            <div className="homePreview__list">
              {data.previewFixtures.map((fx) => (
                <article key={fx.id} className="homeMiniFixture">
                  <div className="homeMiniFixture__teams">
                    <div className="homeMiniTeam">
                      <span className="homeMiniTeam__logo">
                        {fx.home_team_logo_url ? (
                          <img src={fx.home_team_logo_url} alt={text(fx.home_team_name) || 'Home'} loading="lazy" />
                        ) : (
                          <span>{(text(fx.home_team_name) || 'TB').slice(0, 2).toUpperCase()}</span>
                        )}
                      </span>
                      <strong>{text(fx.home_team_name) || 'TBC'}</strong>
                    </div>
                    <div className="homeMiniFixture__vs">vs</div>
                    <div className="homeMiniTeam homeMiniTeam--away">
                      <span className="homeMiniTeam__logo">
                        {fx.away_team_logo_url ? (
                          <img src={fx.away_team_logo_url} alt={text(fx.away_team_name) || 'Away'} loading="lazy" />
                        ) : (
                          <span>{(text(fx.away_team_name) || 'TB').slice(0, 2).toUpperCase()}</span>
                        )}
                      </span>
                      <strong>{text(fx.away_team_name) || 'TBC'}</strong>
                    </div>
                  </div>
                  <div className="homeMiniFixture__meta">
                    <span>{text(fx.stage_name) || `Round ${fx.round || fx.week_index || 1}`}</span>
                    <span>{prettyDateTime(fx.start_time)}</span>
                    <span>{text(fx.venue) || 'Venue TBA'}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="homePreview__empty">
              <div>
                <strong>Fixtures drop after registrations close</strong>
                <p>Matchups auto-generate and seeding locks for finals.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
