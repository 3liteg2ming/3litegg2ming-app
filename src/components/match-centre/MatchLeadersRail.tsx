// src/components/match-centre/MatchLeadersRail.tsx
import { useEffect, useMemo, useRef, useState } from 'react';

export type MatchLeaderCard = {
  categoryLabel: string;
  accent: string;
  teamKey: any;

  matchTotalLabel: string;
  value: number;
  seasonAvgLabel: string;
  seasonAvg: number;

  firstName: string;
  lastName: string;
  role: string;

  photoUrl?: string;
  jointLeadersPill?: string;
};

export default function MatchLeadersRail({
  leaders,
  getTeamLogo,
  getTeamPrimary,
}: {
  leaders: MatchLeaderCard[];
  getTeamLogo: (t: any) => string;
  getTeamPrimary: (t: any) => string;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  const dots = useMemo(() => leaders.map((_, i) => i), [leaders]);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;

    const onScroll = () => {
      const children = Array.from(el.children) as HTMLElement[];
      if (!children.length) return;

      const center = el.scrollLeft + el.clientWidth / 2;
      let bestIdx = 0;
      let bestDist = Infinity;

      children.forEach((c, i) => {
        const cCenter = c.offsetLeft + c.clientWidth / 2;
        const d = Math.abs(cCenter - center);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      });

      setActive(bestIdx);
    };

    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll as any);
  }, [leaders]);

  return (
    <section className="mc-leaders">
      <div className="mc-leadersTop">
        <div className="mc-leadersKicker">CLICK FOR MORE</div>
        <div className="mc-leadersTitle">
          Match Leaders <span aria-hidden>➜</span>
        </div>
        <div className="mc-leadersSub">Who performed the best this match</div>
      </div>

      <div className="mc-leaderRail" ref={railRef}>
        {leaders.map((c, i) => {
          const teamLogo = getTeamLogo(c.teamKey);
          const teamCol = getTeamPrimary(c.teamKey);

          return (
            <article className="mc-leaderCard" key={`${c.categoryLabel}-${i}`} style={{ ['--strap' as any]: c.accent }}>
              <div className="mc-leaderStrap" style={{ background: `linear-gradient(90deg, ${c.accent}, ${c.accent}99)` }}>
                {c.categoryLabel}
              </div>

              {c.jointLeadersPill ? <div className="mc-leaderPill">{c.jointLeadersPill}</div> : null}

              <div className="mc-leaderInner" style={{ background: `linear-gradient(135deg, ${teamCol}55, #0a0a0b 60%)` }}>
                <div className="mc-leaderMeta">
                  <div>
                    <div className="mc-leaderMatchTotalLabel">{c.matchTotalLabel}</div>
                    <div className="mc-leaderValue">{c.value}</div>
                    <div className="mc-leaderAvg">
                      {c.seasonAvgLabel} {c.seasonAvg}
                    </div>
                  </div>

                  <div className="mc-leaderName">
                    <div className="mc-leaderFirst">{c.firstName}</div>
                    <div className="mc-leaderLast">{c.lastName}</div>
                    <div className="mc-leaderRole">{c.role}</div>
                  </div>
                </div>

                <div className="mc-leaderArt">
                  <img className="mc-leaderWatermark" src={teamLogo} alt="" aria-hidden="true" />
                  {c.photoUrl ? (
                    <img className="mc-leaderPhoto" src={c.photoUrl} alt={`${c.firstName} ${c.lastName}`} />
                  ) : (
                    <div
                      className="mc-leaderPhoto"
                      aria-hidden="true"
                      style={{
                        background: 'rgba(255,255,255,.08)',
                        border: '1px solid rgba(255,255,255,.14)',
                      }}
                    />
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mc-dots" aria-label="Match leaders position indicator">
        {dots.map((d) => (
          <div key={d} className={d === active ? 'mc-dot is-active' : 'mc-dot'} />
        ))}
      </div>
    </section>
  );
}
