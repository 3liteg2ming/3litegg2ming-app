import { ChevronLeft, Eye, EyeOff, Gamepad2, Lock, Mail, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';

import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../state/auth/AuthProvider';
import '../../styles/auth-premium.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getPasswordStrength(password: string): 'weak' | 'fair' | 'strong' | null {
  if (!password) return null;
  const hasNumber = /\d/.test(password);
  const hasLength = password.length >= 8;

  if (hasLength && hasNumber) return 'strong';
  if (hasLength || hasNumber) return 'fair';
  return 'weak';
}

function toFriendlyCreateMessage(message: string): { title: string; detail: string } {
  const raw = String(message || '').trim();
  const lower = raw.toLowerCase();

  if (lower.includes('already registered') || lower.includes('already been registered')) {
    return {
      title: 'That email is already in use.',
      detail: raw,
    };
  }

  if (lower.includes('password')) {
    return {
      title: 'Password does not meet requirements.',
      detail: raw,
    };
  }

  return {
    title: 'Could not create account right now.',
    detail: raw || 'Please try again in a moment.',
  };
}

async function upsertProfileForUser(args: {
  userId?: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  psn: string;
}) {
  const userId = String(args.userId || '').trim();
  if (!userId) return;

  const payload = {
    user_id: userId,
    email: args.email,
    first_name: args.firstName,
    last_name: args.lastName,
    display_name: args.displayName,
    psn: args.psn,
  };

  const { error: profilesError } = await supabase.from('profiles').upsert(payload, { onConflict: 'user_id' });
  if (profilesError) {
    console.error('[SignUp] profiles upsert failed', profilesError);
  }

  const { error: egProfilesError } = await supabase.from('eg_profiles').upsert(payload, { onConflict: 'user_id' });
  if (egProfilesError) {
    console.error('[SignUp] eg_profiles upsert failed', egProfilesError);
  }
}

export default function SignUpPage() {
  const nav = useNavigate();
  const { signUp, user, loading, isSupabase } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [psn, setPsn] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const [success, setSuccess] = useState(false);

  const passwordStrength = getPasswordStrength(password);
  const trimmedEmail = email.trim();
  const cleanFirst = firstName.trim();
  const cleanLast = lastName.trim();
  const cleanPsn = psn.trim();

  const emailValid = EMAIL_RE.test(trimmedEmail);
  const passwordMinValid = password.length >= 8;
  const passwordHasNumber = /\d/.test(password);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  const isFormValid =
    cleanFirst.length > 0 &&
    cleanLast.length > 0 &&
    cleanPsn.length > 0 &&
    emailValid &&
    passwordMinValid &&
    passwordHasNumber &&
    passwordsMatch;

  const canSubmit = isFormValid && !submitting && !loading;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!cleanPsn) {
      setError({
        title: 'PSN is required.',
        detail: 'Enter your PSN ID to create your account.',
      });
      return;
    }

    if (!isFormValid) {
      setError({
        title: 'Check your details before continuing.',
        detail: 'First name, last name, PSN, valid email, and matching password are required.',
      });
      return;
    }

    const displayName = `${cleanFirst} ${cleanLast}`.trim();

    setSubmitting(true);
    try {
      const createdUser = await signUp({
        email: trimmedEmail,
        password,
        firstName: cleanFirst,
        lastName: cleanLast,
        displayName,
        psn: cleanPsn,
      });

      await upsertProfileForUser({
        userId: createdUser?.id,
        email: trimmedEmail,
        firstName: cleanFirst,
        lastName: cleanLast,
        displayName,
        psn: cleanPsn,
      });

      setSuccess(true);

      window.setTimeout(() => {
        if (isSupabase) {
          nav('/auth/sign-in', {
            replace: true,
            state: { message: 'Account created. Sign in to complete Knockout Preseason registration.' },
          });
        } else {
          nav('/preseason-registration', { replace: true });
        }
      }, 1400);
    } catch (err: any) {
      setError(toFriendlyCreateMessage(String(err?.message || 'Could not create account.')));
      setSuccess(false);
    } finally {
      setSubmitting(false);
    }
  }

  if (user && !loading) {
    return <Navigate to="/preseason-registration" replace />;
  }

  return (
    <div className="auth-screen auth-screen--premium">
      <div className="auth-top">
        <button type="button" className="auth-back" onClick={() => nav('/auth/sign-in')} aria-label="Back to sign in">
          <ChevronLeft size={18} />
          <span>Sign in</span>
        </button>
      </div>

      <div className="auth-card auth-card--wide auth-card--premium">
        {success ? (
          <div className="auth-success-card">
            <div className="auth-success-title">Account created</div>
            <div className="auth-success-text">Taking you to sign in…</div>
          </div>
        ) : (
          <>
            <div className="auth-badge">KNOCKOUT PRESEASON</div>

            <div className="auth-head">
              <div className="auth-title">Create account</div>
              <div className="auth-step">Step 1 of 2</div>
              <div className="auth-sub">Account setup first. Team preferences are selected after sign in.</div>
            </div>

            <form onSubmit={onSubmit} className="auth-form auth-form--compact" noValidate>
              <label className="auth-field">
                <span className="auth-label">First Name</span>
                <div className="auth-inputWrap">
                  <UserRound size={16} className="auth-icon" />
                  <input
                    className="auth-input"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    autoComplete="given-name"
                    required
                    disabled={submitting || loading}
                  />
                </div>
              </label>

              <label className="auth-field">
                <span className="auth-label">Last Name</span>
                <div className="auth-inputWrap">
                  <UserRound size={16} className="auth-icon" />
                  <input
                    className="auth-input"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    autoComplete="family-name"
                    required
                    disabled={submitting || loading}
                  />
                </div>
              </label>

              <label className="auth-field">
                <span className="auth-label">PSN</span>
                <div className="auth-inputWrap">
                  <Gamepad2 size={16} className="auth-icon" />
                  <input
                    className="auth-input"
                    type="text"
                    value={psn}
                    onChange={(e) => setPsn(e.target.value)}
                    placeholder="PSN ID"
                    autoCapitalize="none"
                    required
                    disabled={submitting || loading}
                  />
                </div>
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
                    autoComplete="new-password"
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
                <div className="auth-inlineStack">
                  {!passwordMinValid && password.length > 0 ? (
                    <span className="auth-inlineHint auth-inlineHint--error">Minimum 8 characters.</span>
                  ) : null}
                  {password.length > 0 && !passwordHasNumber ? (
                    <span className="auth-inlineHint auth-inlineHint--error">Include at least 1 number.</span>
                  ) : null}
                  {password.length > 0 && passwordStrength ? (
                    <span className={`auth-inlineHint auth-inlineHint--${passwordStrength}`}>
                      Strength: {passwordStrength}
                    </span>
                  ) : null}
                </div>
              </label>

              <label className="auth-field">
                <span className="auth-label">Confirm password</span>
                <div className="auth-inputWrap">
                  <Lock size={16} className="auth-icon" />
                  <input
                    className="auth-input"
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                    autoComplete="new-password"
                    required
                    disabled={submitting || loading}
                  />
                  <button
                    type="button"
                    className="auth-eye"
                    onClick={() => setShowConfirmPassword((s) => !s)}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    disabled={submitting || loading}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {confirmPassword.length > 0 && !passwordsMatch ? (
                  <span className="auth-inlineHint auth-inlineHint--error">Passwords must match.</span>
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
                {submitting || loading ? 'Creating account…' : 'Create account'}
              </button>

              <div className="auth-footer">
                <span>Already have an account?</span>
                <Link className="auth-link" to="/auth/sign-in">
                  Sign in
                </Link>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
