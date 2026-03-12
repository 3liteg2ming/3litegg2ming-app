import type { MatchCentreModel } from '@/lib/matchCentreRepo';
import '@/styles/match-centre-key-stats.css';

function toneClass(home: number, away: number): string {
  if (home > away) return 'is-home';
  if (away > home) return 'is-away';
  return 'is-even';
}

export default function KeyMatchStats({ model, loading }: { model: MatchCentreModel | null; loading?: boolean }) {
  const preferred = ['Clearances', 'Inside 50s', 'Tackles', 'Marks', 'Disposals', 'Hitouts'];
  const source = model?.teamStats || [];
  const stats = preferred
    .map((label) => source.find((s) => String(s.label).toLowerCase() === label.toLowerCase()))
    .filter(Boolean) as NonNullable<MatchCentreModel>['teamStats'];
  const fallbackStats = source.filter((s) => !stats.includes(s)).slice(0, Math.max(0, 4 - stats.length));
  const cards = [...stats, ...fallbackStats].slice(0, 4);
  const isLoadingShell = !!loading && !model;
  const isEmpty = !loading && cards.length === 0;
  const desc = model?.hasSubmissionData
    ? 'Clean team comparisons from the published result'
    : 'Team stat cards will appear once a submitted result includes richer match stats';

  return (
    <section className="mcKeyStats">
      <div className="mcKeyStats__header">
        <h2 className="mcKeyStats__title">Key Match Stats</h2>
        <p className="mcKeyStats__desc">{desc}</p>
      </div>

      {isLoadingShell ? (
        <div className="mcLeaders__empty" style={{ paddingTop: 8 }}>
          <div className="mcLeaders__emptyText">Loading match stats…</div>
          <p className="mcLeaders__emptyDesc">This section will settle as soon as the fixture feed resolves.</p>
        </div>
      ) : isEmpty ? (
        <div className="mcLeaders__empty" style={{ paddingTop: 8 }}>
          <div className="mcLeaders__emptyText">No key stats yet</div>
          <p className="mcLeaders__emptyDesc">Team stat cards will appear once the submitted result includes richer match stats</p>
        </div>
      ) : (
        <div className="mcKeyStats__grid">
          {cards.map((stat: any, i) => {
            const home = Number(stat?.homeMatch ?? 0);
            const away = Number(stat?.awayMatch ?? 0);
            return (
              <div key={i} className={`mcKeyStat ${toneClass(home, away)}`}>
                <div className="mcKeyStat__content">
                  <div className="mcKeyStat__head">
                    <p className="mcKeyStat__label">{stat?.label || 'Stat'}</p>
                  </div>
                  <div className="mcKeyStat__values">
                    <span className="mcKeyStat__value mcKeyStat__value--home">{home}</span>
                    <span className="mcKeyStat__divider">vs</span>
                    <span className="mcKeyStat__value mcKeyStat__value--away">{away}</span>
                  </div>
                  <div className="mcKeyStat__bar">
                    {(() => {
                      const max = Math.max(home, away, 1);
                      const hp = (home / max) * 100;
                      const ap = (away / max) * 100;
                      return (
                        <>
                          <div className="mcKeyStat__barHome" style={{ width: `${hp}%` }} />
                          <div className="mcKeyStat__barAway" style={{ width: `${ap}%` }} />
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
