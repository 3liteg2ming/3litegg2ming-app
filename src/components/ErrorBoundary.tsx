import React from 'react';

type FallbackArgs = {
  error: Error;
  reset: () => void;
};

type Props = {
  children: React.ReactNode;
  onError?: (error: Error, info: React.ErrorInfo) => void;
  fallback?: (args: FallbackArgs) => React.ReactNode;
  title?: string;
  message?: string;
};

type State = {
  hasError: boolean;
  error: Error | null;
  copied: boolean;
};

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(String(error || 'Unknown render error'));
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    copied: false,
  };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, error: normalizeError(error), copied: false };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[EG CRASH] ErrorBoundary', error, info?.componentStack || '');
    this.props.onError?.(error, info);
  }

  private reset = () => {
    this.setState({ hasError: false, error: null, copied: false });
  };

  private copyDetails = async () => {
    try {
      if (!this.state.error) return;
      const details = [
        `message: ${this.state.error.message || 'Unknown error'}`,
        this.state.error.stack ? `stack:\n${this.state.error.stack}` : '',
      ]
        .filter(Boolean)
        .join('\n\n');
      await navigator.clipboard.writeText(details);
      this.setState({ copied: true });
    } catch {
      this.setState({ copied: false });
    }
  };

  renderDefaultFallback(error: Error) {
    return (
      <section
        role="alert"
        aria-live="assertive"
        style={{
          minHeight: '60vh',
          display: 'grid',
          placeItems: 'center',
          padding: 'max(16px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left))',
        }}
      >
        <div
          style={{
            width: 'min(620px, 100%)',
            borderRadius: 22,
            border: '1px solid rgba(255,255,255,0.16)',
            background:
              'radial-gradient(80% 120% at 10% 0%, rgba(245,196,0,0.16), transparent 70%), radial-gradient(70% 90% at 90% 10%, rgba(56,128,255,0.18), transparent 74%), linear-gradient(180deg, rgba(17,24,40,0.92), rgba(9,14,24,0.94))',
            boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            padding: 18,
            color: 'rgba(247,250,255,0.96)',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: 999,
              border: '1px solid rgba(245,196,0,0.35)',
              background: 'rgba(245,196,0,0.12)',
              color: 'rgba(255,230,150,0.95)',
              padding: '6px 10px',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            Elite Gaming
          </div>

          <h2 style={{ margin: '10px 0 0', fontSize: 'clamp(24px, 4.5vw, 34px)', letterSpacing: '-0.03em' }}>
            {this.props.title || 'Something went wrong'}
          </h2>
          <p style={{ margin: '8px 0 0', color: 'rgba(224,232,248,0.78)', fontSize: 14 }}>
            {this.props.message || 'A runtime error occurred. You can reload safely.'}
          </p>

          <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                minHeight: 40,
                borderRadius: 12,
                border: '1px solid rgba(245,196,0,0.5)',
                background: 'linear-gradient(180deg, rgba(255,219,108,0.96), rgba(245,196,0,0.96))',
                color: 'rgba(13,16,24,0.96)',
                fontWeight: 900,
                padding: '0 12px',
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
            <button
              type="button"
              onClick={this.copyDetails}
              style={{
                minHeight: 40,
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(239,245,255,0.92)',
                fontWeight: 800,
                padding: '0 12px',
                cursor: 'pointer',
              }}
            >
              {this.state.copied ? 'Copied' : 'Copy error details'}
            </button>
          </div>

          <details style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer', color: 'rgba(220,228,245,0.76)', fontSize: 12 }}>Error details</summary>
            <pre
              style={{
                marginTop: 8,
                padding: 10,
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(6,10,18,0.74)',
                color: 'rgba(228,236,252,0.86)',
                fontSize: 11,
                lineHeight: 1.4,
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
              }}
            >
              {error.stack || error.message || 'Unknown render error'}
            </pre>
          </details>
        </div>
      </section>
    );
  }

  render() {
    if (!this.state.hasError || !this.state.error) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback({ error: this.state.error, reset: this.reset });
    }

    return this.renderDefaultFallback(this.state.error);
  }
}
