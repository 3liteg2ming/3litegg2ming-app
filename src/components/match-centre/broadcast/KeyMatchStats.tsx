import type { MatchCentreModel } from '@/lib/matchCentreRepo';
import '@/styles/match-centre-key-stats.css';

export default function KeyMatchStats({ model, loading }: { model: MatchCentreModel | null; loading?: boolean }) {
  const preferred = ['Clearances', 'Inside 50s', 'Tackles', 'Marks', 'Disposals', 'Hitouts'];
  const source = model?.teamStats || [];
  const stats = preferred
    .map((label) => source.find((s) => String(s.label).toLowerCase() === label.toLowerCase()))
    .filter(Boolean) as NonNullable<MatchCentreModel>['teamStats'];
  const fallbackStats = source.filter((s) => !stats.includes(s)).slice(0, Math.max(0, 4 - stats.length));
  const cards = [...stats, ...fallbackStats].slice(0, 4);
  const isEmpty = !loading && cards.length === 0;

  return (
    <section className="mcKeyStats">
      <div className="mcKeyStats__header">
        <h2 className="mcKeyStats__title">Key Match Stats</h2>
      </div>

      {isEmpty ? (
        <div className="mcLeaders__empty" style={{ paddingTop: 8 }}>
          <div className="mcLeaders__emptyText">No key stats yet</div>
          <p className="mcLeaders__emptyDesc">Team stat cards will appear after verified submissions</p>
        </div>
      ) : (
      <div className="mcKeyStats__grid">
        {(loading && !model ? Array.from({ length: 4 }) : cards).map((stat: any, i) => (
          <div key={i} className="mcKeyStat">
            <div className="mcKeyStat__content">
              <p className="mcKeyStat__label">{stat?.label || 'Stat'}</p>
              {loading ? (
                <div className="mcKeyStat__skeleton" />
              ) : (
                <>
                  <div className="mcKeyStat__values">
                    <span className="mcKeyStat__value mcKeyStat__value--home">{stat?.homeMatch ?? 0}</span>
                    <span className="mcKeyStat__divider">—</span>
                    <span className="mcKeyStat__value mcKeyStat__value--away">{stat?.awayMatch ?? 0}</span>
                  </div>
                  <div className="mcKeyStat__bar">
                    {(() => {
                      const h = Number(stat?.homeMatch ?? 0);
                      const a = Number(stat?.awayMatch ?? 0);
                      const max = Math.max(h, a, 1);
                      const hp = (h / max) * 100;
                      const ap = (a / max) * 100;
                      return (
                        <>
                          <div className="mcKeyStat__barHome" style={{ width: `${hp}%` }} />
                          <div className="mcKeyStat__barAway" style={{ width: `${ap}%` }} />
                        </>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      )}
    </section>
  );
}
