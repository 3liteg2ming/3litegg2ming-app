import React from 'react';
import { BarChart3, LayoutGrid, Users } from 'lucide-react';
import '@/styles/match-centre-tabs.css';

export type MatchCentreTabKey = 'summary' | 'team' | 'players';

const TABS: { key: MatchCentreTabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'summary', label: 'Summary', icon: <LayoutGrid className="w-4 h-4" /> },
  { key: 'team', label: 'Team Stats', icon: <BarChart3 className="w-4 h-4" /> },
  { key: 'players', label: 'Player Stats', icon: <Users className="w-4 h-4" /> },
];

export default function MatchCentreTabs({
  active,
  onChange,
}: {
  active: MatchCentreTabKey;
  onChange: (tab: MatchCentreTabKey) => void;
}) {
  return (
    <div className="mcTabs">
      <div className="mcTabs__container">
        <div className="mcTabs__track">
          {TABS.map((t) => {
            const isActive = active === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onChange(t.key)}
                aria-pressed={isActive}
                className={`mcTabs__button ${isActive ? 'mcTabs__button--active' : ''}`}
              >
                {t.icon}
                <span className="mcTabs__label">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
