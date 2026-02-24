import { ChevronLeft, Lock, Mail, UserRound, Gamepad2, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { TEAM_ASSETS, type TeamKey } from '../../lib/teamAssets';
import { useAuth } from '../../state/auth/AuthProvider';

const TEAM_KEYS = Object.keys(TEAM_ASSETS) as TeamKey[];

function sortTeams(a: TeamKey, b: TeamKey) {
  return TEAM_ASSETS[a].name.localeCompare(TEAM_ASSETS[b].name);
}

export default function SignUpPage() {
  const nav = useNavigate();
  const { signUp, user, loading, isSupabase } = useAuth();
  const teams = useMemo(() => TEAM_KEYS.slice().sort(sortTeams), []);

  const [displayName, setDisplayName] = useState('');
  const [psn, setPsn] = useState('');
  const [teamKey, setTeamKey] = useState<TeamKey>('collingwood');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await signUp({ email, password, displayName, psn, teamKey });
      nav('/members', { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Could not create account');
    }
  }

  if (user && !loading) {
    return <Navigate to="/members" replace />;
  }

  return (
    <div className="auth-screen">
      <div className="auth-top">
        <button
          type="button"
          className="auth-back"
          onClick={() => nav('/auth/sign-in')}
          aria-label="Back to sign in"
        >
          <ChevronLeft size={18} />
          <span>Sign in</span>
        </button>
      </div>

      <div className="auth-card">
        <div className="auth-badge">COACH REGISTRATION</div>
        <div className="auth-title">Create coach account</div>
        <div className="auth-sub">
          Pick your team once — we lock it in so only you can submit results for that team.
        </div>

        {!isSupabase ? (
          <div className="auth-note">
            <strong>Local mode:</strong> Supabase env vars aren’t set, so this account lives on this device only.
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="auth-form">
          <label className="auth-field">
            <span className="auth-label">Coach name</span>
            <div className="auth-inputWrap">
              <UserRound size={16} className="auth-icon" />
              <input
                className="auth-input"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Zach"
                autoComplete="nickname"
                required
              />
            </div>
          </label>

          <label className="auth-field">
            <span className="auth-label">PSN (optional)</span>
            <div className="auth-inputWrap">
              <Gamepad2 size={16} className="auth-icon" />
              <input
                className="auth-input"
                type="text"
                value={psn}
                onChange={(e) => setPsn(e.target.value)}
                placeholder="EliteYoda10"
              />
            </div>
          </label>

          <label className="auth-field">
            <span className="auth-label">Team</span>
            <div className="auth-inputWrap">
              <ShieldCheck size={16} className="auth-icon" />
              <select
                className="auth-input auth-select"
                value={teamKey}
                onChange={(e) => setTeamKey(e.target.value as TeamKey)}
              >
                {teams.map((k) => (
                  <option key={k} value={k}>
                    {TEAM_ASSETS[k].name}
                  </option>
                ))}
              </select>
            </div>
            <div className="auth-help">Locked after registration (can be changed later by admin).</div>
          </label>

          <div className="auth-divider" />

          <label className="auth-field">
            <span className="auth-label">Email</span>
            <div className="auth-inputWrap">
              <Mail size={16} className="auth-icon" />
              <input
                className="auth-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="coach@email.com"
                autoComplete="email"
                required
              />
            </div>
          </label>

          <label className="auth-field">
            <span className="auth-label">Password</span>
            <div className="auth-inputWrap">
              <Lock size={16} className="auth-icon" />
              <input
                className="auth-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                autoComplete="new-password"
                required
              />
            </div>
          </label>

          {error ? <div className="auth-error">{error}</div> : null}

          <button type="submit" className="auth-primary" disabled={loading}>
            {loading ? 'Creating…' : 'Create account'}
          </button>

          <div className="auth-footer">
            <span>Already have an account?</span>
            <Link className="auth-link" to="/auth/sign-in">
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
