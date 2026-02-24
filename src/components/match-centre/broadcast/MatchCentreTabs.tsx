import React from 'react';
import { BarChart3, LayoutGrid, Star } from 'lucide-react';

export type MatchCentreTabKey = 'summary' | 'team' | 'players';

const TABS: { key: MatchCentreTabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'summary', label: 'Summary', icon: <LayoutGrid className="w-4 h-4" /> },
  { key: 'team', label: 'Team Stats', icon: <BarChart3 className="w-4 h-4" /> },
  { key: 'players', label: 'Player Stats', icon: <Star className="w-4 h-4" /> },
];

export default function MatchCentreTabs({
  active,
  onChange,
}: {
  active: MatchCentreTabKey;
  onChange: (tab: MatchCentreTabKey) => void;
}) {
  return (
    <div className="sticky top-0 z-30 bg-white/85 backdrop-blur border-b border-border/60">
      <div className="w-full max-w-6xl mx-auto px-4 py-3">
        <div className="w-full max-w-[520px] mx-auto bg-muted/70 rounded-full p-1 border border-border/70 shadow-sm">
          <div className="grid grid-cols-3 gap-1">
            {TABS.map((t) => {
              const isActive = active === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => onChange(t.key)}
                  aria-pressed={isActive}
                  className={[
                    'h-10 rounded-full px-3 flex items-center justify-center gap-2 text-xs sm:text-sm font-black tracking-tight transition-all',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow'
                      : 'text-foreground/70 hover:text-foreground hover:bg-white/60',
                  ].join(' ')}
                >
                  {t.icon}
                  <span className="whitespace-nowrap">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
