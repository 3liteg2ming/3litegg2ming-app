import { Check } from 'lucide-react';
import type { CompetitionKey } from '../../lib/competitionRegistry';

type CompetitionOption = {
  key: CompetitionKey;
  label: string;
};

type Props = {
  open: boolean;
  options: CompetitionOption[];
  currentKey: CompetitionKey;
  onClose: () => void;
  onSelect: (key: CompetitionKey) => void;
};

export default function FixturesCompetitionSheet({
  open,
  options,
  currentKey,
  onClose,
  onSelect,
}: Props) {
  if (!open) return null;

  return (
    <div className="fxSheet" role="dialog" aria-modal="true" aria-label="Filter By Season">
      <button className="fxSheet__backdrop" type="button" onClick={onClose} />
      <div className="fxSheet__panel">
        <div className="fxSheet__handle" />
        <h3 className="fxSheet__title">Filter By Season</h3>

        <div className="fxSheet__list">
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`fxSheet__item ${option.key === currentKey ? 'is-active' : ''}`}
              onClick={() => onSelect(option.key)}
            >
              <span>{option.label}</span>
              {option.key === currentKey ? <Check size={16} /> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
