import CoachBadge from './CoachBadge';
import type { CoachBadgeModel } from '../lib/badges';

type BadgeGridProps = {
  groups: Array<{ category: string; badges: CoachBadgeModel[] }>;
  onSelect: (badge: CoachBadgeModel) => void;
};

export default function BadgeGrid({ groups, onSelect }: BadgeGridProps) {
  if (!groups.length) {
    return <div className="badgeGrid__empty">No badges unlocked yet.</div>;
  }

  return (
    <div className="badgeGrid">
      {groups.map((group) => (
        <section key={group.category} className="badgeGrid__group" aria-label={`${group.category} badges`}>
          <div className="badgeGrid__groupTitle">{group.category}</div>
          <div className="badgeGrid__tiles">
            {group.badges.map((badge) => (
              <CoachBadge key={badge.id} badge={badge} onPress={onSelect} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
