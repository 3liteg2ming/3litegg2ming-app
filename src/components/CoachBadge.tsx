import { Award, Lock } from 'lucide-react';
import type { CoachBadgeModel } from '../lib/badges';

type CoachBadgeProps = {
  badge: CoachBadgeModel;
  onPress: (badge: CoachBadgeModel) => void;
};

export default function CoachBadge({ badge, onPress }: CoachBadgeProps) {
  return (
    <button
      type="button"
      className={`badgeTile ${badge.earned ? 'isEarned' : 'isLocked'} badgeTile--${badge.tier}`}
      onClick={() => onPress(badge)}
      aria-label={`${badge.title}${badge.earned ? '' : ', locked'} (${badge.tier})`}
    >
      <span className="badgeTile__icon" aria-hidden="true">
        {badge.icon ? <span>{badge.icon}</span> : badge.earned ? <Award size={16} /> : <Lock size={16} />}
      </span>
      <span className="badgeTile__text">
        <span className="badgeTile__title">{badge.title}</span>
        <span className="badgeTile__progress">{badge.progress || (badge.earned ? 'Unlocked' : 'Locked')}</span>
      </span>
    </button>
  );
}
