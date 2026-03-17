import type { MatchCentreModel } from '@/lib/matchCentreRepo';
import '@/styles/mc-key-stats.css';

type StatCard = {
  label: string;
  homeMatch: number;
  awayMatch: number;
};

function toneClass(home: number, away: number) {
  if (home > away) return 'is-home';
  if (away > home) return 'is-away';
  return 'is-even';
}

function buildCards(model: MatchCentreModel | null): StatCard[] {
  const preferred = ['Clearances', 'Inside 50s', 'Tackles', 'Marks', 'Disposals', 'Hitouts'];
  const source = model?.teamStats || [];

  const picked = preferred
    .map((label) => source.find((row) => String(row.label).toLowerCase() === label.toLowerCase()))
    .filter(Boolean);

  const remainder = source.filter((row) => !picked.includes(row));
  const cards = [...picked, ...remainder]
    .slice(0, 4)
    .map((row) => ({
      label: String(row?.label || 'Stat'),
      homeMatch: Number(row?.homeMatch ?? 0),
      awayMatch: Number(row?.awayMatch ?? 0),
    }));

  while (cards.length < 4) {
    const fallbackLabel = preferred[cards.length] || `Stat ${cards.length + 1}`;
    cards.push({
      label: fallbackLabel,
      homeMatch: 0,
      awayMatch: 0,
    });
  }

  return cards;
}

export default function KeyMatchStats({ model }: { model: MatchCentreModel | null; loading?: boolean }) {
  const cards = buildCards(model);

  return (
    <section className="mcKeyStatsBlock" aria-label="Key match stats">
      <div className="mcKeyStatsBlock__grid">
        {cards.map((stat, index) => {
          const home = Number.isFinite(stat.homeMatch) ? stat.homeMatch : 0;
          const away = Number.isFinite(stat.awayMatch) ? stat.awayMatch : 0;
          const bothZero = home === 0 && away === 0;
          const total = home + away;
          const homeShare = bothZero ? 50 : (home / total) * 100;
          const awayShare = bothZero ? 50 : (away / total) * 100;
          const splitLeft = Math.min(96, Math.max(4, homeShare));

          return (
            <article
              key={`${stat.label}-${index}`}
              className={`mcKeyStatsBlock__card ${toneClass(home, away)}${bothZero ? ' is-zero' : ''}`}
              aria-label={`${stat.label}: ${home} versus ${away}`}
            >
              <div className="mcKeyStatsBlock__cardAtmosphere" aria-hidden="true">
                <span className="mcKeyStatsBlock__cardGlow mcKeyStatsBlock__cardGlow--home" />
                <span className="mcKeyStatsBlock__cardGlow mcKeyStatsBlock__cardGlow--away" />
              </div>

              <div className="mcKeyStatsBlock__label" title={stat.label}>
                {stat.label}
              </div>

              <div className="mcKeyStatsBlock__values">
                <span className="mcKeyStatsBlock__value mcKeyStatsBlock__value--home">{home}</span>
                <span className="mcKeyStatsBlock__vs">vs</span>
                <span className="mcKeyStatsBlock__value mcKeyStatsBlock__value--away">{away}</span>
              </div>

              <div className="mcKeyStatsBlock__footer" aria-hidden="true">
                <div className="mcKeyStatsBlock__bar">
                  <span className={`mcKeyStatsBlock__barFill mcKeyStatsBlock__barFill--home${bothZero ? ' is-neutral' : ''}`} style={{ width: `${homeShare}%` }} />
                  <span className={`mcKeyStatsBlock__barFill mcKeyStatsBlock__barFill--away${bothZero ? ' is-neutral' : ''}`} style={{ width: `${awayShare}%` }} />
                  <span className="mcKeyStatsBlock__barNeedle" style={{ left: `${splitLeft}%` }} />
                </div>

                <div className="mcKeyStatsBlock__miniSplit">
                  <span className="mcKeyStatsBlock__miniSplitSide mcKeyStatsBlock__miniSplitSide--home" />
                  <span className="mcKeyStatsBlock__miniSplitTrack" />
                  <span className="mcKeyStatsBlock__miniSplitSide mcKeyStatsBlock__miniSplitSide--away" />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
