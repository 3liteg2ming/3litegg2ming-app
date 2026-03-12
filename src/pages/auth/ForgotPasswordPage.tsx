import { CheckCircle2, ChevronLeft, Mail } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { buildAuthRedirect } from '../../lib/authRedirect';
import { getSupabaseClient } from '../../lib/supabaseClient';
import '../../styles/auth-premium.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);

  const trimmedEmail = email.trim();
  const isFormValid = EMAIL_RE.test(trimmedEmail);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase not configured. Password reset is not available right now.');
      }

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: buildAuthRedirect('/auth/callback'),
      });

      if (resetError) {
        throw resetError;
      }

      setSuccessEmail(trimmedEmail);
      setEmail('');
    } catch (err: any) {
      setError(String(err?.message || 'Could not send reset email. Check your connection and try again.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen auth-screen--premium">
      <div className="auth-top auth-top--premium">
        <button type="button" className="auth-back" onClick={() => nav('/auth/sign-in')} aria-label="Back to sign in">
          <ChevronLeft size={18} />
          <span>Sign in</span>
        </button>
      </div>

      <div className="auth-card auth-card--premium auth-card--forgot">
        {successEmail ? (
          <div className="auth-success-card auth-success-card--premium">
            <CheckCircle2 size={22} className="auth-success-icon" />
            <div className="auth-success-title">Check your inbox</div>
            <div className="auth-success-text">We sent a reset link to {successEmail}.</div>
            <button type="button" className="auth-primary" onClick={() => nav('/auth/sign-in')}>
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <div className="auth-kicker">Password reset</div>
            <div className="auth-head auth-head--premium">
              <div className="auth-title">Reset your password</div>
              <div className="auth-sub">Enter your email and we’ll send a secure reset link.</div>
            </div>

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
                    required
                    disabled={loading}
                  />
                </div>
                {email.length > 0 && !isFormValid ? <span className="auth-inlineHint auth-inlineHint--error">Enter a valid email format.</span> : null}
              </label>

              {error ? (
                <div className="auth-message auth-message--error" role="alert" aria-live="assertive">
                  <div className="auth-message__title">Could not send reset email.</div>
                  <div className="auth-message__body">{error}</div>
                </div>
              ) : null}

              <button type="submit" className="auth-primary" disabled={loading || !isFormValid}>
                {loading ? 'Sending reset link…' : 'Send reset link'}
              </button>
            </form>

            <div className="auth-footerLinks">
              <Link className="auth-footerLink" to="/auth/sign-in">
                Back to sign in
              </Link>
              <Link className="auth-footerLink" to="/auth/sign-up">
                Create account
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
