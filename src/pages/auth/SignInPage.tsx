import { Eye, EyeOff, Lock, Mail, ChevronLeft } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../state/auth/AuthProvider';

function cn(...a: Array<string | false | undefined | null>) {
  return a.filter(Boolean).join(' ');
}

export default function SignInPage() {
  const nav = useNavigate();
  const location = useLocation() as any;
  const { signIn, user, loading, isSupabase } = useAuth();
  const redirectTo = useMemo(() => location?.state?.from || '/members', [location]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await signIn({ email, password });
      nav(redirectTo, { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Could not sign in');
    }
  }

  // If already signed in, bounce to members
  if (user && !loading) {
    return <Navigate to="/members" replace />;
  }

  return (
    <div className="auth-screen">
      <div className="auth-top">
        <button type="button" className="auth-back" onClick={() => nav('/')}
          aria-label="Back to home">
          <ChevronLeft size={18} />
          <span>Home</span>
        </button>
      </div>

      <div className="auth-card">
        <div className="auth-badge">COACH ACCESS</div>
        <div className="auth-title">Sign in</div>
        <div className="auth-sub">
          Coaches only — this links your account to your team so only you can submit results.
        </div>

        {!isSupabase ? (
          <div className="auth-note">
            <strong>Local mode:</strong> Supabase env vars aren’t set, so sign-in is stored on this device only.
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="auth-form">
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
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className={cn('auth-eye', show && 'active')}
                onClick={() => setShow((s) => !s)}
                aria-label={show ? 'Hide password' : 'Show password'}
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>

          {error ? <div className="auth-error">{error}</div> : null}

          <button type="submit" className="auth-primary" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="auth-footer">
            <span>New coach?</span>
            <Link className="auth-link" to="/auth/sign-up">
              Create account
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
