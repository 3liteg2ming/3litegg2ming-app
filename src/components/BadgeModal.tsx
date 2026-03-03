import { X } from 'lucide-react';
import type { CoachBadgeModel } from '../lib/badges';

type BadgeModalProps = {
  badge: CoachBadgeModel | null;
  onClose: () => void;
};

export default function BadgeModal({ badge, onClose }: BadgeModalProps) {
  if (!badge) return null;

  return (
    <div className="badgeModal__scrim" role="dialog" aria-modal="true" aria-label="Badge details" onClick={onClose}>
      <div className={`badgeModal badgeModal--${badge.tier}`} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="badgeModal__close" onClick={onClose} aria-label="Close badge details">
          <X size={18} />
        </button>
        <div className="badgeModal__icon">{badge.icon || '🏅'}</div>
        <div className="badgeModal__title">{badge.title}</div>
        <div className="badgeModal__category">{badge.category}</div>
        <div className="badgeModal__desc">{badge.description}</div>
        <div className={`badgeModal__state ${badge.earned ? 'isEarned' : 'isLocked'}`}>
          {badge.earned ? 'Unlocked' : 'Locked'} • {badge.progress || 'No progress'}
        </div>
      </div>
    </div>
  );
}
