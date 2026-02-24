import type { MatchCentreModel } from '@/lib/matchCentreRepo';
import '@/styles/match-centre-key-stats.css';

export default function KeyMatchStats({ model, loading }: { model: MatchCentreModel | null; loading?: boolean }) {
  // Example key stats - these would come from model.teamStats in a full implementation
  const stats = [
    { label: 'Clearances', icon: '🔄' },
    { label: 'Inside 50s', icon: '🎯' },
    { label: 'Tackles', icon: '🤝' },
    { label: 'Disposal Efficiency', icon: '✓' },
  ];

  return (
    <section className="mcKeyStats">
      <div className="mcKeyStats__header">
        <h2 className="mcKeyStats__title">Key Match Stats</h2>
      </div>

      <div className="mcKeyStats__grid">
        {stats.map((stat, i) => (
          <div key={i} className="mcKeyStat">
            <div className="mcKeyStat__content">
              <p className="mcKeyStat__label">{stat.label}</p>
              {loading ? (
                <div className="mcKeyStat__skeleton" />
              ) : (
                <>
                  <div className="mcKeyStat__values">
                    <span className="mcKeyStat__value mcKeyStat__value--home">12</span>
                    <span className="mcKeyStat__divider">—</span>
                    <span className="mcKeyStat__value mcKeyStat__value--away">14</span>
                  </div>
                  <div className="mcKeyStat__bar">
                    <div className="mcKeyStat__barHome" style={{ width: '46%' }} />
                    <div className="mcKeyStat__barAway" style={{ width: '54%' }} />
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
