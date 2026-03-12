import { ChevronLeft, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../state/auth/AuthProvider';
import '../../styles/auth-premium.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_PERSIST_BLOCKED_MESSAGE =
  'Signed in, but your browser blocked saving the session. If you’re using Brave or an ad blocker, disable Shields for this site, or clear site data and reload.';
const PUBLIC_AUTH_REDIRECTS = new Set([
  '/preseason-registration',
  '/auth/sign-in',
  '/auth/sign-up',
  '/auth/forgot-password',
  '/auth/callback',
]);

function isNetworkErrorMessage(raw: string): boolean {
  const lower = String(raw || '').toLowerCase();
  return (
    lower.includes('failed to fetch') ||
    lower.includes('network request failed') ||
    lower.includes('networkerror') ||
    lower.includes('could not reach server') ||
    lower.includes('authtimeouterror') ||
    lower.includes('timeout')
  );
}

function toFriendlyAuthMessage(message: string): { title: string; detail: string } {
  const raw = String(message || '').trim();
  const lower = raw.toLowerCase();

  if (lower.includes('invalid login credentials')) {
    return {
      title: 'Email or password is incorrect.',
      detail: 'Check your details and try again.',
    };
  }

  if (lower.includes('email not confirmed')) {
    return {
      title: 'Your email is not confirmed yet.',
      detail: 'Open the verification email, then come back and sign in again.',
    };
  }

  if (lower.includes('missing vite_supabase_url') || lower.includes('missing vite_supabase_anon_key') || lower.includes('app misconfigured')) {
    return {
      title: 'App misconfigured: missing server keys. Please contact support.',
      detail: raw,
    };
  }

  if (lower.includes('eg_session_persist_blocked') || lower.includes('browser blocked saving the session')) {
    return {
      title: SESSION_PERSIST_BLOCKED_MESSAGE,
      detail: raw || SESSION_PERSIST_BLOCKED_MESSAGE,
    };
  }

  if (isNetworkErrorMessage(raw)) {
    return {
      title: 'Could not reach server. Please try again.',
      detail: raw,
    };
  }

  return {
    title: 'Could not sign in right now.',
    detail: raw || 'Please try again in a moment.',
  };
}

function sanitizeRedirectPath(input: unknown): string {
  const raw = String(input || '').trim();
  if (!raw) return '/preseason-registration';
  if (/^https?:\/\//i.test(raw)) return '/preseason-registration';
  if (raw.includes('localhost') || raw.includes('127.0.0.1')) return '/preseason-registration';
  if (!raw.startsWith('/')) return '/preseason-registration';

  const cleanPath = raw.replace(/\/+$/, '') || '/';
  return PUBLIC_AUTH_REDIRECTS.has(cleanPath) ? cleanPath : '/preseason-registration';
}

export default function SignInPage() {
  const nav = useNavigate();
  const location = useLocation() as {
    state?: {
      from?: string;
      message?: string;
    };
  };
  const { signIn, user, booting, actionLoading } = useAuth();

  const redirectTo = useMemo(() => sanitizeRedirectPath(location?.state?.from), [location]);
  const successMessage = location?.state?.message || null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);

  const trimmedEmail = email.trim();
  const emailValid = EMAIL_RE.test(trimmedEmail);
  const passwordValid = password.length >= 8;
  const canSubmit = emailValid && passwordValid && !submitting && !actionLoading;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!emailValid) {
      setError({
        title: 'Enter a valid email address.',
        detail: 'Use the email linked to your Elite Gaming account.',
      });
      return;
    }

    if (!passwordValid) {
      setError({
        title: 'Password is too short.',
        detail: 'Passwords must be at least 8 characters.',
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

  if (user && !booting) {
    return <Navigate to={redirectTo} replace />;
  }

  return (
    <div className="auth-screen auth-screen--premium">
      <div className="auth-top auth-top--premium">
        <button type="button" className="auth-back" onClick={() => nav('/preseason-registration')} aria-label="Back to preseason registration">
          <ChevronLeft size={18} />
          <span>Preseason</span>
        </button>
      </div>

      <div className="auth-card auth-card--premium auth-card--signin">
        <div className="auth-kicker">Coach access</div>
        <div className="auth-head auth-head--premium">
          <div className="auth-title">Sign in</div>
          <div className="auth-sub">Continue your preseason registration.</div>
        </div>

        {successMessage ? (
          <div className="auth-message auth-message--success" role="status" aria-live="polite">
            <div className="auth-message__title">Account created</div>
            <div className="auth-message__body">{successMessage}</div>
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="auth-form auth-form--premium" noValidate>
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
                inputMode="email"
                required
                disabled={submitting || actionLoading}
              />
            </div>
            {email.length > 0 && !emailValid ? <span className="auth-inlineHint auth-inlineHint--error">Enter a valid email format.</span> : null}
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
                disabled={submitting || actionLoading}
              />
              <button
                type="button"
                className="auth-eye"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                disabled={submitting || actionLoading}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {password.length > 0 && !passwordValid ? <span className="auth-inlineHint auth-inlineHint--error">Minimum 8 characters.</span> : null}
          </label>

          {error ? (
            <div className="auth-message auth-message--error" role="alert" aria-live="assertive">
              <div className="auth-message__title">{error.title}</div>
              <div className="auth-message__body">{error.detail}</div>
            </div>
          ) : null}

          {booting ? <div className="auth-statusNote">Checking your coach session…</div> : null}

          <button type="submit" className="auth-primary" disabled={!canSubmit}>
            {submitting || actionLoading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="auth-footerLinks">
          <Link className="auth-footerLink" to="/auth/sign-up">
            Create account
          </Link>
          <Link className="auth-footerLink" to="/auth/forgot-password">
            Forgot password
          </Link>
        </div>
      </div>
    </div>
  );
}
