import React from 'react';

import '../styles/error-boundary.css';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  message: string;
};

export default class AppErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error || 'Unknown error');
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    console.error('[EG CRASH] React render error', error, errorInfo?.componentStack || '');
  }

  private onReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="egCrash" role="alert" aria-live="assertive">
        <div className="egCrash__backdrop" />
        <div className="egCrash__panel">
          <div className="egCrash__kicker">Elite Gaming</div>
          <h1 className="egCrash__title">Something went wrong</h1>
          <p className="egCrash__message">{this.state.message || 'An unexpected error occurred.'}</p>
          <button type="button" className="egCrash__reload" onClick={this.onReload}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
