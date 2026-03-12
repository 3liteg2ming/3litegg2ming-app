import '@/styles/match-centre-tabs.css';

export type MatchCentreTabKey = 'summary' | 'team' | 'players';

const TABS: { key: MatchCentreTabKey; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'team', label: 'Team Stats' },
  { key: 'players', label: 'Player Stats' },
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
        <div className="mcTabs__track" role="tablist" aria-label="Match centre sections">
          {TABS.map((t) => {
            const isActive = active === t.key;
            return (
              <button
                key={t.key}
                id={`mc-tab-${t.key}`}
                type="button"
                role="tab"
                onClick={() => onChange(t.key)}
                aria-selected={isActive}
                aria-controls={`mc-panel-${t.key}`}
                aria-label={t.label}
                title={t.label}
                className={`mcTabs__button ${isActive ? 'mcTabs__button--active' : ''}`}
              >
                <span className="mcTabs__label">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
