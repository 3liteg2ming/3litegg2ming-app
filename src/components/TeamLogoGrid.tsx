import { Check } from 'lucide-react';

import SmartImg from './SmartImg';
import '../styles/registration-hero.css';

type TeamRow = {
  id: string;
  name: string;
  displayName?: string;
  logo_url?: string | null;
};

type Props = {
  teams: TeamRow[];
  selectedTeamIds: string[];
  onToggle: (teamId: string) => void;
  maxSelections?: number;
  disabled?: boolean;
  loading?: boolean;
  emptyMessage?: string;
};

export default function TeamLogoGrid({
  teams,
  selectedTeamIds,
  onToggle,
  maxSelections = 4,
  disabled,
  loading,
  emptyMessage = 'No teams available right now.',
}: Props) {
  const selected = new Set(selectedTeamIds);
  const orderById = new Map(selectedTeamIds.map((id, idx) => [id, idx + 1]));
  const teamById = new Map(teams.map((team) => [team.id, team]));

  if (loading) {
    return (
      <div className="tlgGrid tlgGrid--loading" aria-label="Loading teams">
        {Array.from({ length: 8 }).map((_, idx) => (
          <div className="tlgSkeleton" key={`skel-${idx}`} />
        ))}
      </div>
    );
  }

  if (!teams.length) {
    return <div className="tlgEmpty">{emptyMessage}</div>;
  }

  return (
    <div className="tlgWrap">
      <div className="tlgCount">
        <span>Team Preferences</span>
        <span>
          {selectedTeamIds.length}/{maxSelections}
        </span>
      </div>

      <div className="tlgSlots" aria-label="Preference order">
        {Array.from({ length: maxSelections }).map((_, index) => {
          const teamId = selectedTeamIds[index];
          const team = teamId ? teamById.get(teamId) : null;
          return (
            <div key={`slot-${index + 1}`} className={`tlgSlot ${team ? 'is-filled' : ''}`}>
              <span className="tlgSlot__index">{index + 1}</span>
              {team?.logo_url ? (
                <SmartImg src={team.logo_url} alt={team.name} className="tlgSlot__logo" fallbackText="EG" />
              ) : (
                <span className="tlgSlot__empty">—</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="tlgGrid">
        {teams.map((team) => {
          const active = selected.has(team.id);
          const order = orderById.get(team.id) ?? 0;
          const displayName = team.displayName || team.name;
          return (
            <button
              key={team.id}
              type="button"
              className={`tlgCard ${active ? 'is-active' : ''}`}
              onClick={() => onToggle(team.id)}
              disabled={disabled}
              aria-pressed={active}
              aria-label={displayName}
              title={displayName}
            >
              {active ? (
                <div className="tlgCard__order" aria-hidden="true">
                  <span className="tlgCard__orderBadge">{order}</span>
                </div>
              ) : null}
              <div className="tlgCard__logo">
                {team.logo_url ? (
                  <SmartImg src={team.logo_url} alt={team.name} className="tlgCard__logoImg" fallbackText="EG" />
                ) : (
                  <span className="tlgCard__logoFallback">EG</span>
                )}
              </div>
              {active ? (
                <span className="tlgCard__check" aria-hidden="true">
                  <Check size={12} />
                </span>
              ) : null}
              <span className="tlgCard__name">{displayName}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
