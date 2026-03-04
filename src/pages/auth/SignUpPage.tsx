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

  if (lower.includes('database error saving new user')) {
    return {
      title: 'Account creation is partially complete.',
      detail: 'Account created in Auth may have failed to create profile. Try signing in. If it persists, contact support.',
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
}): Promise<string[]> {
  const userId = String(args.userId || '').trim();
  if (!userId) return ['Missing user id from signup response.'];

  const payload = {
    user_id: userId,
    email: args.email,
    first_name: args.firstName,
    last_name: args.lastName,
    display_name: args.displayName,
    psn: args.psn,
  };

  const { error: profilesError } = await supabase.from('profiles').upsert(payload, { onConflict: 'user_id' });
  const failures: string[] = [];
  if (profilesError) {
    console.error('[SignUp] profiles upsert failed', profilesError);
    failures.push(`profiles: ${profilesError.message}${(profilesError as any)?.code ? ` (code ${(profilesError as any).code})` : ''}`);
  }

  const { error: egProfilesError } = await supabase.from('eg_profiles').upsert(payload, { onConflict: 'user_id' });
  if (egProfilesError) {
    console.error('[SignUp] eg_profiles upsert failed', egProfilesError);
    failures.push(`eg_profiles: ${egProfilesError.message}${(egProfilesError as any)?.code ? ` (code ${(egProfilesError as any).code})` : ''}`);
  }

  return failures;
}

async function ensureProfileExists(userId: string): Promise<void> {
  const check = await supabase.from('profiles').select('user_id').eq('user_id', userId).maybeSingle();
  if (!check.error && check.data?.user_id) return;
  const fallback = await supabase.from('eg_profiles').select('user_id').eq('user_id', userId).maybeSingle();
  if (!fallback.error && fallback.data?.user_id) return;
  throw new Error('Profile row is still missing after signup.');
}

function formatErrorDetails(err: any): string {
  const message = String(err?.message || 'Unknown error').trim();
  const code = String(err?.code || '').trim();
  const status = String(err?.status || '').trim();
  return [message, code ? `code ${code}` : '', status ? `status ${status}` : ''].filter(Boolean).join(' • ');
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
        title: 'PSN or Xbox gamertag is required.',
        detail: 'Enter your PSN ID or gamertag to create your account.',
      });
      return;
    }

    if (!isFormValid) {
      setError({
        title: 'Check your details before continuing.',
        detail: 'First name, last name, PSN or Xbox gamertag, valid email, and matching password are required.',
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

      const profileFailures: string[] = [];
      await upsertProfileForUser({
        userId: createdUser?.id,
        email: trimmedEmail,
        firstName: cleanFirst,
        lastName: cleanLast,
        displayName,
        psn: cleanPsn,
      }).then((failures) => profileFailures.push(...failures));

      if (createdUser?.id) {
        try {
          await ensureProfileExists(createdUser.id);
        } catch (missingErr) {
          console.error('[SignUp] profile check failed, retrying upsert', missingErr);
          const retryFailures = await upsertProfileForUser({
            userId: createdUser.id,
            email: trimmedEmail,
            firstName: cleanFirst,
            lastName: cleanLast,
            displayName,
            psn: cleanPsn,
          });
          profileFailures.push(...retryFailures);
        }
      }

      if (profileFailures.length) {
        setError({
          title: 'Account created but profile sync needs attention.',
          detail: `Profile sync details: ${profileFailures.join(' | ')}`,
        });
      }

      try {
        await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
      } catch (signInError) {
        console.error('[SignUp] post-signup sign-in skipped', signInError);
      }

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
      console.error('[SignUp] create account failed', {
        code: err?.code,
        status: err?.status,
        message: err?.message,
        name: err?.name,
      });
      setError(toFriendlyCreateMessage(String(err?.message || 'Could not create account.')));
      setError((prev) =>
        prev
          ? {
              ...prev,
              detail: `${prev.detail} | ${formatErrorDetails(err)}`,
            }
          : prev,
      );
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
                <span className="auth-label">PSN / Xbox gamertag</span>
                <div className="auth-inputWrap">
                  <Gamepad2 size={16} className="auth-icon" />
                  <input
                    className="auth-input"
                    type="text"
                    value={psn}
                    onChange={(e) => setPsn(e.target.value)}
                    placeholder="PSN ID or Gamertag"
                    autoCapitalize="none"
                    required
                    disabled={submitting || loading}
                  />
                </div>
                <span className="auth-inlineHint">Add at least one so people can find you.</span>
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
              <button type="button" className="auth-message__retry" onClick={() => setError(null)} disabled={submitting || loading}>
                Try again
              </button>
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
