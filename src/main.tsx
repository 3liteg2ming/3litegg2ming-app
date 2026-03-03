import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { AuthProvider } from './state/auth/AuthProvider';

import './styles/global.css';

declare global {
  interface Window {
    __egCrashListenersAttached?: boolean;
  }
}

const GLOBAL_CRASH_EVENT = 'eg:global-crash';

function toCrashMessage(value: unknown) {
  if (value instanceof Error) return value.message || 'Unknown error';
  const text = String(value || '').trim();
  return text || 'Unknown error';
}

if (!window.__egCrashListenersAttached) {
  window.__egCrashListenersAttached = true;

  window.addEventListener('error', (event) => {
    const reason = event.error || event.message || 'Unknown window error';
    console.error('[EG CRASH] window.error', reason);
    window.dispatchEvent(
      new CustomEvent(GLOBAL_CRASH_EVENT, {
        detail: {
          source: 'window.error',
          message: toCrashMessage(reason),
        },
      }),
    );
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason || 'Unknown promise rejection';
    console.error('[EG CRASH] unhandledrejection', reason);
    window.dispatchEvent(
      new CustomEvent(GLOBAL_CRASH_EVENT, {
        detail: {
          source: 'unhandledrejection',
          message: toCrashMessage(reason),
        },
      }),
    );
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
);
