import { BarChart3 } from 'lucide-react';
import SmartImg from '@/components/SmartImg';
import { assetUrl, TEAM_ASSETS, type TeamKey } from '@/lib/teamAssets';
import type { MatchCentreModel, TeamStatRow } from '@/lib/matchCentreRepo';

function slugToTeamKey(slug: string): TeamKey | null {
  const s = String(slug || '').toLowerCase().trim();
  return (Object.keys(TEAM_ASSETS) as TeamKey[]).includes(s as TeamKey) ? (s as TeamKey) : null;
}

function AnimatedBar({ value, max, color }: { value: number; max: number; color: string }) {
  const height = Math.max(0.08, Math.min(1, value / max));
  return (
    <div className="w-8 h-20 md:w-10 md:h-24 rounded-full bg-muted overflow-hidden flex items-end">
      <div
        className="w-full rounded-full"
        style={{
          height: `${height * 100}%`,
          background: `linear-gradient(180deg, ${color}, ${color}99)`,
        }}
      />
    </div>
  );
}

function StatRow({ stat, homeColor, awayColor }: { stat: TeamStatRow; homeColor: string; awayColor: string }) {
  const maxMatch = Math.max(stat.homeMatch, stat.awayMatch, 1);

  return (
    <div className="py-6">
      <h4 className="text-center text-2xl md:text-3xl font-black tracking-tight text-foreground mb-6">{stat.label}</h4>

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5 md:gap-0">
        <div className="flex items-center justify-between md:block md:min-w-[120px]">
          <div className="flex items-baseline gap-2">
            <span className="text-lg md:text-2xl font-black tabular-nums text-foreground">{stat.homeSeasonAvg}</span>
            <span className="text-[10px] md:text-xs text-muted-foreground font-bold tracking-wide">AVG.</span>
          </div>
          <div className="flex items-baseline gap-2 md:mt-3">
            <span className="text-lg md:text-2xl font-black tabular-nums text-foreground">{stat.homeSeasonTotal}</span>
            <span className="text-[10px] md:text-xs text-muted-foreground font-bold tracking-wide">TOTAL</span>
          </div>
        </div>

        <div className="flex items-end justify-center gap-3 md:flex-1">
          <div className="text-right">
            <p className="text-3xl md:text-5xl font-black tabular-nums text-foreground">{stat.homeMatch}</p>
            <p className="text-[10px] md:text-xs text-muted-foreground font-bold tracking-[0.25em] uppercase">Match</p>
          </div>

          <div className="flex items-end gap-1">
            <AnimatedBar value={stat.homeMatch} max={maxMatch} color={homeColor} />
            <AnimatedBar value={stat.awayMatch} max={maxMatch} color={awayColor} />
          </div>

          <div className="text-left">
            <p className="text-3xl md:text-5xl font-black tabular-nums text-foreground">{stat.awayMatch}</p>
            <p className="text-[10px] md:text-xs text-muted-foreground font-bold tracking-[0.25em] uppercase">Match</p>
          </div>
        </div>

        <div className="flex items-center justify-between md:block md:text-right md:min-w-[120px]">
          <div className="flex items-baseline gap-2 md:justify-end">
            <span className="text-lg md:text-2xl font-black tabular-nums text-foreground">{stat.awaySeasonAvg}</span>
            <span className="text-[10px] md:text-xs text-muted-foreground font-bold tracking-wide">AVG.</span>
          </div>
          <div className="flex items-baseline gap-2 md:justify-end md:mt-3">
            <span className="text-lg md:text-2xl font-black tabular-nums text-foreground">{stat.awaySeasonTotal}</span>
            <span className="text-[10px] md:text-xs text-muted-foreground font-bold tracking-wide">TOTAL</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TeamStats({ model, loading }: { model: MatchCentreModel | null; loading?: boolean }) {
  const home = model?.home;
  const away = model?.away;

  const homeKey = home ? slugToTeamKey(home.slug) : null;
  const awayKey = away ? slugToTeamKey(away.slug) : null;

  const homeLogo = home?.logoUrl || (homeKey ? assetUrl(TEAM_ASSETS[homeKey].logoFile) : undefined);
  const awayLogo = away?.logoUrl || (awayKey ? assetUrl(TEAM_ASSETS[awayKey].logoFile) : undefined);

  const stats = model?.teamStats || [];

  return (
    <section className="w-full max-w-6xl mx-auto px-4 py-12">
      <div className="text-center mb-6">
        <h2 className="text-3xl md:text-4xl font-black tracking-tight text-foreground flex items-center justify-center gap-2">
          <BarChart3 className="w-6 h-6" /> Team Stats
        </h2>
        <p className="text-muted-foreground text-sm mt-1">See how the teams are performing...</p>
      </div>

      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <SmartImg src={homeLogo} alt={home?.name || 'Home'} className="w-10 h-10 object-contain" fallbackText={home?.abbreviation || 'H'} />
          <span className="text-sm font-bold text-foreground">{home?.name || (loading ? 'Loading…' : '—')}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-foreground">{away?.name || (loading ? 'Loading…' : '—')}</span>
          <SmartImg src={awayLogo} alt={away?.name || 'Away'} className="w-10 h-10 object-contain" fallbackText={away?.abbreviation || 'A'} />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-border/60 overflow-hidden">
        {stats.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-xl font-black text-foreground">Team stats not available yet</div>
            <div className="mt-2 text-sm text-muted-foreground">
              Once both coaches submit results (and OCR stats), this section will populate automatically.
            </div>
          </div>
        ) : (
          stats.map((stat, idx) => (
            <div key={stat.label} className={idx !== 0 ? 'border-t border-border/60' : ''}>
              <StatRow stat={stat} homeColor={home?.color || '#111'} awayColor={away?.color || '#b00020'} />
            </div>
          ))
        )}
      </div>
    </section>
  );
}