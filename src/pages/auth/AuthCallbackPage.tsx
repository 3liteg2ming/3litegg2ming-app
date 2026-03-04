import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const supabase = requireSupabaseClient();

import { requireSupabaseClient } from '../../lib/supabaseClient';
import '../../styles/auth-premium.css';

function sanitizePath(input: string | null): string | null {
  const raw = String(input || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return null;
  if (raw.includes('localhost') || raw.includes('127.0.0.1')) return null;
  if (!raw.startsWith('/')) return null;
  return raw;
}

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const redirectTarget = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return sanitizePath(params.get('next') || params.get('redirect_to')) || '/preseason-registration';
  }, []);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        }

        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        if (!alive) return;
        if (data.session) {
          navigate(redirectTarget, { replace: true });
        } else {
          navigate('/auth/sign-in', {
            replace: true,
            state: { message: 'Sign in to continue.' },
          });
        }
      } catch (err: any) {
        console.error('[AuthCallback] failed to finalize auth', err);
        if (!alive) return;
        setError(String(err?.message || 'Unable to complete sign in.'));
      }
    })();

    return () => {
      alive = false;
    };
  }, [navigate, redirectTarget]);

  return (
    <div className="auth-screen auth-screen--premium">
      <div className="auth-card auth-card--premium">
        <div className="auth-badge">AUTH</div>
        <div className="auth-head">
          <div className="auth-title">Signing you in…</div>
          <div className="auth-sub">Finalising your secure session.</div>
        </div>
        {error ? (
          <div className="auth-message auth-message--error" role="alert" aria-live="assertive">
            <div className="auth-message__title">Could not complete sign in</div>
            <div className="auth-message__body">{error}</div>
            <button
              type="button"
              className="auth-message__retry"
              onClick={() => navigate('/auth/sign-in', { replace: true })}
            >
              Go to Sign In
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
