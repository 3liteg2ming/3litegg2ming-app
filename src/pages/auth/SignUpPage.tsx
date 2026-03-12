import { ChevronLeft, Eye, EyeOff, Gamepad2, Lock, Mail, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { requireSupabaseClient } from '../../lib/supabaseClient';
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
      detail: 'Try signing in instead, or reset your password if you already have an account.',
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
      detail: 'Your Auth account may exist already. Try signing in and contact support if the issue continues.',
    };
  }

  if (lower.includes('missing vite_supabase_url') || lower.includes('missing vite_supabase_anon_key') || lower.includes('app misconfigured')) {
    return {
      title: 'App misconfigured: missing server keys. Please contact support.',
      detail: raw,
    };
  }

  return {
    title: 'Could not create account right now.',
    detail: raw || 'Please try again in a moment.',
  };
}

async function upsertProfileForUser(args: {
  supabase: ReturnType<typeof requireSupabaseClient>;
  userId?: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  psn: string;
  facebookName: string;
  birthYear: number;
}): Promise<string[]> {
  const { supabase } = args;
  const userId = String(args.userId || '').trim();
  if (!userId) return ['Missing user id from signup response.'];

  const payload = {
    user_id: userId,
    email: args.email,
    first_name: args.firstName,
    last_name: args.lastName,
    display_name: args.displayName,
    psn: args.psn,
    facebook_name: args.facebookName,
    birth_year: args.birthYear,
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
  const supabase = requireSupabaseClient();
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

function isDatabaseSaveNewUserError(err: any): boolean {
  const message = String(err?.message || '').toLowerCase();
  return message.includes('database error saving new user');
}

export default function SignUpPage() {
  const nav = useNavigate();
  const { signUp, user, loading, isSupabase } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [facebookName, setFacebookName] = useState('');
  const [birthYear, setBirthYear] = useState('');
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
  const cleanFacebookName = facebookName.trim();
  const cleanBirthYear = birthYear.trim();
  const cleanPsn = psn.trim();

  const emailValid = EMAIL_RE.test(trimmedEmail);
  const passwordMinValid = password.length >= 8;
  const passwordHasNumber = /\d/.test(password);
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const birthYearValid = /^\d{4}$/.test(cleanBirthYear) && Number(cleanBirthYear) > 1920 && Number(cleanBirthYear) < new Date().getFullYear() - 10;

  const isFormValid =
    cleanFirst.length > 0 &&
    cleanLast.length > 0 &&
    cleanFacebookName.length > 0 &&
    birthYearValid &&
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
        detail: 'Add the name players can use to find you in-game.',
      });
      return;
    }

    if (!isFormValid) {
      setError({
        title: 'Check your details before continuing.',
        detail: 'First name, last name, Facebook name, valid birth year, PSN or Xbox gamertag, valid email, and matching password are required.',
      });
      return;
    }

    const displayName = `${cleanFirst} ${cleanLast}`.trim();

    setSubmitting(true);
    try {
      const supabase = requireSupabaseClient();
      const createdUser = await signUp({
        email: trimmedEmail,
        password,
        firstName: cleanFirst,
        lastName: cleanLast,
        displayName,
        psn: cleanPsn,
        facebookName: cleanFacebookName,
        birthYear: Number(cleanBirthYear),
      });

      const profileFailures: string[] = [];
      await upsertProfileForUser({
        supabase,
        userId: createdUser?.id,
        email: trimmedEmail,
        firstName: cleanFirst,
        lastName: cleanLast,
        displayName,
        psn: cleanPsn,
        facebookName: cleanFacebookName,
        birthYear: Number(cleanBirthYear),
      }).then((failures) => profileFailures.push(...failures));

      if (createdUser?.id) {
        try {
          await ensureProfileExists(createdUser.id);
        } catch (missingErr) {
          console.error('[SignUp] profile check failed, retrying upsert', missingErr);
          const retryFailures = await upsertProfileForUser({
            supabase,
            userId: createdUser.id,
            email: trimmedEmail,
            firstName: cleanFirst,
            lastName: cleanLast,
            displayName,
            psn: cleanPsn,
            facebookName: cleanFacebookName,
            birthYear: Number(cleanBirthYear),
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
            state: { message: 'Account created. Sign in to continue your preseason registration.' },
          });
        } else {
          nav('/preseason-registration', { replace: true });
        }
      }, 1400);
    } catch (err: any) {
      if (isDatabaseSaveNewUserError(err)) {
        try {
          const supabase = requireSupabaseClient();
          const signInRes = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
          if (!signInRes.error && signInRes.data?.user?.id) {
            const recoveredUserId = signInRes.data.user.id;
            const profileFailures = await upsertProfileForUser({
              supabase,
              userId: recoveredUserId,
              email: trimmedEmail,
              firstName: cleanFirst,
              lastName: cleanLast,
              displayName,
              psn: cleanPsn,
              facebookName: cleanFacebookName,
              birthYear: Number(cleanBirthYear),
            });
            if (profileFailures.length) {
              console.error('[SignUp] recovery profile upsert failures', profileFailures);
            }
            setSuccess(true);
            window.setTimeout(() => {
              nav('/preseason-registration', { replace: true });
            }, 1200);
            return;
          }
        } catch (recoveryErr) {
          console.error('[SignUp] database-error recovery failed', recoveryErr);
        }
      }

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
      <div className="auth-top auth-top--premium">
        <button type="button" className="auth-back" onClick={() => nav('/preseason-registration')} aria-label="Back to preseason registration">
          <ChevronLeft size={18} />
          <span>Preseason</span>
        </button>
      </div>

      <div className="auth-card auth-card--premium auth-card--wide auth-card--signup">
        {success ? (
          <div className="auth-success-card auth-success-card--premium">
            <div className="auth-success-title">Account created</div>
            <div className="auth-success-text">Taking you to sign in…</div>
          </div>
        ) : (
          <>
            <div className="auth-kicker">Coach registration</div>
            <div className="auth-head auth-head--premium">
              <div className="auth-title">Create your account</div>
              <div className="auth-sub">Set up your coach profile now, then sign in to confirm your preseason entry.</div>
            </div>

            <div className="auth-subtleRow auth-subtleRow--start">
              <Link className="auth-subtleLink" to="/preseason-registration">
                Back to preseason registration
              </Link>
            </div>

            <form onSubmit={onSubmit} className="auth-form auth-form--premium auth-form--signup" noValidate>
              <div className="form-row">
                <label className="auth-field">
                  <span className="auth-label">First name</span>
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
                  <span className="auth-label">Last name</span>
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
              </div>

              <div className="form-row">
                <label className="auth-field">
                  <span className="auth-label">Facebook name</span>
                  <div className="auth-inputWrap">
                    <UserRound size={16} className="auth-icon" />
                    <input
                      className="auth-input"
                      type="text"
                      value={facebookName}
                      onChange={(e) => setFacebookName(e.target.value)}
                      placeholder="Facebook name"
                      autoComplete="name"
                      required
                      disabled={submitting || loading}
                    />
                  </div>
                  <span className="auth-inlineHint">Use the name admins will recognise.</span>
                </label>

                <label className="auth-field">
                  <span className="auth-label">Birth year</span>
                  <div className="auth-inputWrap">
                    <UserRound size={16} className="auth-icon" />
                    <input
                      className="auth-input"
                      type="number"
                      value={birthYear}
                      onChange={(e) => setBirthYear(e.target.value)}
                      placeholder="YYYY"
                      inputMode="numeric"
                      required
                      disabled={submitting || loading}
                    />
                  </div>
                  {birthYear.length > 0 && !birthYearValid ? (
                    <span className="auth-inlineHint auth-inlineHint--error">Enter a valid 4-digit birth year.</span>
                  ) : (
                    <span className="auth-inlineHint">Required for coach eligibility.</span>
                  )}
                </label>
              </div>

              <div className="form-row">
                <label className="auth-field">
                  <span className="auth-label">PSN / Xbox gamertag</span>
                  <div className="auth-inputWrap">
                    <Gamepad2 size={16} className="auth-icon" />
                    <input
                      className="auth-input"
                      type="text"
                      value={psn}
                      onChange={(e) => setPsn(e.target.value)}
                      placeholder="PSN ID or gamertag"
                      autoCapitalize="none"
                      required
                      disabled={submitting || loading}
                    />
                  </div>
                  <span className="auth-inlineHint">This is the name coaches will use to find you in-game.</span>
                </label>

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
                      disabled={submitting || loading}
                    />
                  </div>
                  {email.length > 0 && !emailValid ? (
                    <span className="auth-inlineHint auth-inlineHint--error">Enter a valid email format.</span>
                  ) : null}
                </label>
              </div>

              <div className="form-row">
                <label className="auth-field">
                  <span className="auth-label">Password</span>
                  <div className="auth-inputWrap">
                    <Lock size={16} className="auth-icon" />
                    <input
                      className="auth-input"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a password"
                      autoComplete="new-password"
                      required
                      disabled={submitting || loading}
                    />
                    <button
                      type="button"
                      className="auth-eye"
                      onClick={() => setShowPassword((current) => !current)}
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
                      onClick={() => setShowConfirmPassword((current) => !current)}
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
              </div>

              {error ? (
                <div className="auth-message auth-message--error" role="alert" aria-live="assertive">
                  <div className="auth-message__title">{error.title}</div>
                  <div className="auth-message__body">{error.detail}</div>
                </div>
              ) : null}

              <button type="submit" className="auth-primary" disabled={!canSubmit}>
                {submitting || loading ? 'Creating account…' : 'Create account'}
              </button>
            </form>

            <div className="auth-footerLinks auth-footerLinks--single">
              <Link className="auth-footerLink" to="/auth/sign-in">
                Already have an account? Sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
