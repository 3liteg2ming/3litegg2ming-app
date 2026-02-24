import { useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { MatchCentreModel } from '@/lib/matchCentreRepo';

export default function MatchLeaders({ model, loading }: { model: MatchCentreModel | null; loading?: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const leaders = model?.leaders || [];

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const scrollLeft = scrollRef.current.scrollLeft;
    const cardWidth = scrollRef.current.children[0]?.clientWidth || 380;
    setActiveIdx(Math.round(scrollLeft / (cardWidth + 24)));
  };

  const scrollTo = (idx: number) => {
    if (!scrollRef.current) return;
    const cardWidth = scrollRef.current.children[0]?.clientWidth || 380;
    scrollRef.current.scrollTo({ left: idx * (cardWidth + 24), behavior: 'smooth' });
  };

  return (
    <section className="w-full max-w-6xl mx-auto px-4 py-12">
      <div className="text-center mb-8">
        <p className="text-xs font-bold tracking-[0.3em] uppercase text-primary/60 mb-1">Click for more</p>
        <h2 className="text-3xl md:text-4xl font-black tracking-tight text-foreground flex items-center justify-center gap-2">
          Match Leaders <ChevronRight className="w-7 h-7" />
        </h2>
        <p className="text-muted-foreground text-sm mt-1">Who performed the best this match</p>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-6 overflow-x-auto snap-x snap-mandatory pb-4 scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {(loading && !model ? Array.from({ length: 3 }) : leaders).map((leader: any, i: number) => {
          const isPlaceholder = loading && !model;

          const teamName = leader?.team || '';
          const isHome = teamName && model?.home?.fullName ? teamName === model.home.fullName : true;
          const teamColor = isHome ? (model?.home?.color || '#7c3aed') : (model?.away?.color || '#b00020');

          return (
            <div
              key={i}
              className="snap-center flex-shrink-0 w-[340px] md:w-[400px] rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300 cursor-pointer group"
              style={{
                background: `linear-gradient(135deg, hsl(220 20% 18%) 0%, hsl(220 25% 12%) 100%)`,
              }}
            >
              <div
                className="px-5 py-2 text-white text-xs font-black tracking-[0.2em] uppercase"
                style={{ background: `linear-gradient(90deg, #7c3aed, ${teamColor})` }}
              >
                {isPlaceholder ? '—' : (leader?.stat || '—')}
              </div>

              <div className="flex relative">
                <div className="flex-1 p-5 flex flex-col justify-between relative z-10">
                  <div>
                    <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">Match Total</p>
                    <p className="text-white text-5xl md:text-6xl font-black leading-none mt-1">
                      {isPlaceholder ? '—' : (leader?.matchTotal ?? 0)}
                    </p>
                    <p className="text-white/50 text-xs font-semibold mt-2">
                      SEASON AVG. <span className="text-white/80 font-bold">{isPlaceholder ? '—' : (leader?.seasonAvg ?? '—')}</span>
                    </p>
                  </div>

                  <div className="mt-8">
                    <p className="text-white/70 text-sm font-medium">
                      {isPlaceholder ? 'Loading…' : (String(leader?.player || '—').split(' ')[0] || '—')}
                    </p>
                    <p className="text-white text-xl md:text-2xl font-black uppercase">
                      {isPlaceholder ? '' : (String(leader?.player || '—').split(' ').slice(1).join(' ') || '')}
                    </p>
                    <p className="text-white/40 text-xs font-bold tracking-wider uppercase mt-0.5">
                      {isPlaceholder ? '' : (leader?.position || '')}
                    </p>
                  </div>
                </div>

                <div className="relative w-[160px] md:w-[180px] flex-shrink-0">
                  <div className="absolute inset-0 opacity-[0.08] flex items-center justify-center">
                    <span className="text-[100px] font-black text-white select-none">
                      {isHome ? (model?.home?.abbreviation || '') : (model?.away?.abbreviation || '')}
                    </span>
                  </div>

                  {leader?.photoUrl ? (
                    <img
                      src={leader.photoUrl}
                      alt={leader.player}
                      className="absolute bottom-0 right-0 w-full h-auto object-cover object-top group-hover:scale-105 transition-transform duration-500"
                      style={{ maxHeight: '100%' }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="absolute bottom-0 right-0 w-full h-full bg-gradient-to-t from-white/5 to-transparent" />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-2 mt-4">
        {(loading && !model ? Array.from({ length: 3 }) : leaders).map((_: any, i: number) => (
          <button
            key={i}
            onClick={() => scrollTo(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === activeIdx ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/30'
            }`}
          />
        ))}
      </div>
    </section>
  );
}