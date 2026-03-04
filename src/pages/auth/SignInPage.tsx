import { ChevronLeft, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../state/auth/AuthProvider';
import '../../styles/auth-premium.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toFriendlyAuthMessage(message: string): { title: string; detail: string } {
  const raw = String(message || '').trim();
  const lower = raw.toLowerCase();

  if (lower.includes('invalid login credentials')) {
    return {
      title: 'Email or password is incorrect.',
      detail: raw,
    };
  }

  if (lower.includes('email not confirmed')) {
    return {
      title: 'Confirm your email before signing in.',
      detail: raw,
    };
  }

  return {
    title: 'Could not sign in right now.',
    detail: raw || 'Please try again in a moment.',
  };
}

export default function SignInPage() {
  const nav = useNavigate();
  const location = useLocation() as any;
  const { signIn, user, loading } = useAuth();

  const redirectTo = useMemo(() => location?.state?.from || '/members', [location]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const [successMessage] = useState<string | null>(location?.state?.message || null);

  const trimmedEmail = email.trim();
  const emailValid = EMAIL_RE.test(trimmedEmail);
  const passwordValid = password.length >= 8;
  const canSubmit = emailValid && passwordValid && !submitting && !loading;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!emailValid) {
      setError({
        title: 'Enter a valid email address.',
        detail: 'Email format is invalid.',
      });
      return;
    }

    if (!passwordValid) {
      setError({
        title: 'Password is too short.',
        detail: 'Password must be at least 8 characters.',
      });
      return;
    }

    setSubmitting(true);
    try {
      await signIn({ email: trimmedEmail, password });
      nav(redirectTo, { replace: true });
    } catch (err: any) {
      setError(toFriendlyAuthMessage(String(err?.message || 'Unable to sign in.')));
    } finally {
      setSubmitting(false);
    }
  }

  if (user && !loading) {
    return <Navigate to="/members" replace />;
  }

  return (
    <div className="auth-screen auth-screen--premium">
      <div className="auth-top">
        <button type="button" className="auth-back" onClick={() => nav('/')} aria-label="Back to home">
          <ChevronLeft size={18} />
          <span>Home</span>
        </button>
      </div>

      <div className="auth-card auth-card--premium">
        <div className="auth-badge">COACH ACCESS</div>

        <div className="auth-head">
          <div className="auth-title">Sign in</div>
          <div className="auth-sub">Use your coach account to access the members hub and submissions.</div>
        </div>

        {successMessage ? (
          <div className="auth-message auth-message--success" role="status" aria-live="polite">
            <div className="auth-message__title">Account created</div>
            <div className="auth-message__body">{successMessage}</div>
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="auth-form auth-form--compact" noValidate>
          <label className="auth-field">
            <span className="auth-label">Email</span>
            <div className="auth-inputWrap">
              <Mail size={16} className="auth-icon" />
              <input
                className="auth-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                autoComplete="email"
                required
                disabled={submitting || loading}
              />
            </div>
            {email.length > 0 && !emailValid ? (
              <span className="auth-inlineHint auth-inlineHint--error">Enter a valid email format.</span>
            ) : null}
          </label>

          <label className="auth-field">
            <span className="auth-label">Password</span>
            <div className="auth-inputWrap">
              <Lock size={16} className="auth-icon" />
              <input
                className="auth-input"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                required
                disabled={submitting || loading}
              />
              <button
                type="button"
                className="auth-eye"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                disabled={submitting || loading}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {password.length > 0 && !passwordValid ? (
              <span className="auth-inlineHint auth-inlineHint--error">Minimum 8 characters.</span>
            ) : null}
          </label>

          {error ? (
            <div className="auth-message auth-message--error" role="alert" aria-live="assertive">
              <div className="auth-message__title">{error.title}</div>
              <details className="auth-message__details">
                <summary>Details</summary>
                <div className="auth-message__body">{error.detail}</div>
              </details>
            </div>
          ) : null}

          <button type="submit" className="auth-primary" disabled={!canSubmit}>
            {submitting || loading ? 'Signing in…' : 'Sign in'}
          </button>

          <div className="auth-footerRow">
            <div className="auth-footer">
              <span>New coach?</span>
              <Link className="auth-link" to="/auth/sign-up">
                Create account
              </Link>
            </div>
            <div className="auth-footer">
              <span>Forgot password?</span>
              <Link className="auth-link" to="/auth/forgot-password">
                Reset it
              </Link>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
