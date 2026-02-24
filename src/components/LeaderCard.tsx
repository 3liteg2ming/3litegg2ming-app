import React from 'react';
import '../styles/leader-card.css';

export type LeaderCardRow = {
  rank: number;
  name: string;
  team: string;
  value: number | string;
  headshotUrl?: string | null;
  teamLogoUrl?: string | null;
};

type Props = {
  title: string; // e.g. "GOALS"
  accent?: 'gold' | 'red' | 'blue' | 'purple';
  leader?: LeaderCardRow | null;
  rows?: LeaderCardRow[];
  onFull?: () => void;
};

const accentClass = (accent?: Props['accent']) => {
  switch (accent) {
    case 'red':
      return 'lc-accent-red';
    case 'blue':
      return 'lc-accent-blue';
    case 'purple':
      return 'lc-accent-purple';
    default:
      return 'lc-accent-gold';
  }
};

const safeInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const a = parts[0]?.[0] ?? '';
  const b = parts[1]?.[0] ?? '';
  return (a + b).toUpperCase() || 'EG';
};

function Avatar({
  url,
  alt,
}: {
  url?: string | null;
  alt: string;
}) {
  if (!url) {
    return (
      <div className="lc-avatar lc-avatar-fallback" aria-label={alt}>
        {safeInitials(alt)}
      </div>
    );
  }
  return (
    <div className="lc-avatar">
      <img src={url} alt={alt} loading="lazy" />
    </div>
  );
}

export default function LeaderCard({
  title,
  accent = 'gold',
  leader,
  rows = [],
  onFull,
}: Props) {
  return (
    <section className={`lc ${accentClass(accent)}`}>
      <header className="lc-head">
        <div className="lc-title">{title}</div>
        <button className="lc-full" type="button" onClick={onFull}>
          Full <span className="lc-arrow">→</span>
        </button>
      </header>

      <div className="lc-top">
        <div className="lc-top-left">
          <div className="lc-big">{leader?.value ?? '—'}</div>
          <div className="lc-name">{leader?.name ?? '—'}</div>
          <div className="lc-team">{leader?.team ?? '—'}</div>
        </div>

        <div className="lc-top-right">
          <div className="lc-photo-frame">
            <Avatar url={leader?.headshotUrl} alt={leader?.name ?? 'Player'} />
          </div>
        </div>
      </div>

      <div className="lc-list">
        {rows.slice(0, 5).map((r) => (
          <div key={`${r.rank}-${r.name}`} className="lc-row">
            <div className="lc-rank">{r.rank}</div>

            <div className="lc-row-left">
              <Avatar url={r.headshotUrl} alt={r.name} />
              <div className="lc-row-meta">
                <div className="lc-row-name">{r.name}</div>
                <div className="lc-row-team">{r.team}</div>
              </div>
            </div>

            <div className="lc-row-right">
              <div className="lc-row-value">{r.value}</div>
            </div>
          </div>
        ))}

        <button className="lc-fulltable" type="button" onClick={onFull}>
          Full Table <span className="lc-arrow">→</span>
        </button>
      </div>
    </section>
  );
}
