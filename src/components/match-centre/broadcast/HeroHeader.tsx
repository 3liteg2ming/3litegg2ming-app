import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import SmartImg from '@/components/SmartImg';
import { assetUrl, TEAM_ASSETS, type TeamKey } from '@/lib/teamAssets';
import type { MatchCentreModel } from '@/lib/matchCentreRepo';

type Props = {
  onBack?: () => void;
  model: MatchCentreModel | null;
  loading?: boolean;
};

function slugToTeamKey(slug: string): TeamKey | null {
  const s = String(slug || '').toLowerCase().trim();
  return (Object.keys(TEAM_ASSETS) as TeamKey[]).includes(s as TeamKey) ? (s as TeamKey) : null;
}

export default function HeroHeader({ onBack, model, loading }: Props) {
  const home = model?.home;
  const away = model?.away;

  const homeKey = home ? slugToTeamKey(home.slug) : null;
  const awayKey = away ? slugToTeamKey(away.slug) : null;

  const homeLogo =
    home?.logoUrl ||
    (homeKey ? assetUrl(TEAM_ASSETS[homeKey].logoFile) : undefined);

  const awayLogo =
    away?.logoUrl ||
    (awayKey ? assetUrl(TEAM_ASSETS[awayKey].logoFile) : undefined);

  const homeColor = home?.color || '#111111';
  const awayColor = away?.color || '#b00020';

  const round = model?.round ?? 0;
  const dateText = model?.dateText ?? 'TBC';
  const venue = model?.venue ?? 'TBC';
  const status = model?.statusLabel ?? '—';

  const margin = model?.margin ?? 0;

  return (
    <section className="relative w-full overflow-hidden" style={{ minHeight: 520 }}>
      {/* Diagonal gradient split background */}
      <div className="absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(125deg, ${homeColor} 0%, ${homeColor} 35%, hsl(0 0% 6%) 46%, hsl(358 60% 20%) 54%, ${awayColor} 65%, ${awayColor} 100%)`,
          }}
        />

        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 80% at 52% 50%, rgba(200,40,40,0.12) 0%, transparent 70%)',
          }}
        />

        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'1\'/%3E%3C/svg%3E")',
            backgroundSize: '128px 128px',
          }}
        />

        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.45) 100%)',
          }}
        />
      </div>

      {/* Watermark team abbreviations */}
      <div className="absolute inset-0 flex items-center justify-between pointer-events-none overflow-hidden px-4">
        <span className="text-[120px] sm:text-[160px] md:text-[220px] lg:text-[280px] font-black uppercase text-white/[0.045] leading-none tracking-[-0.05em] select-none -translate-x-4">
          {home?.abbreviation || 'HOME'}
        </span>
        <span className="text-[120px] sm:text-[160px] md:text-[220px] lg:text-[280px] font-black uppercase text-white/[0.045] leading-none tracking-[-0.05em] select-none translate-x-4">
          {away?.abbreviation || 'AWAY'}
        </span>
      </div>

      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="absolute z-20 left-4 top-4 w-10 h-10 rounded-full bg-black/25 backdrop-blur-md border border-white/[0.12] text-white flex items-center justify-center shadow-lg active:scale-95 transition"
          aria-label="Back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}

      <div className="relative z-10 flex flex-col items-center justify-center px-4 py-14" style={{ minHeight: 520 }}>
        <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
          className="text-center mb-8"
        >
          <p className="text-white/50 text-[11px] font-semibold tracking-[0.4em] uppercase mb-2">
            ROUND {round || '—'}
          </p>
          <p className="text-white/70 text-sm font-medium tracking-wide">{dateText}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.65, delay: 0.08 }}
          className="w-full max-w-[520px] mx-auto"
        >
          <div className="grid grid-cols-3 items-center gap-3">
            <div className="flex flex-col items-center gap-2 min-w-0">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.08] backdrop-blur-md flex items-center justify-center border border-white/[0.10] shadow-2xl">
                <SmartImg
                  src={homeLogo}
                  alt={home?.fullName || 'Home'}
                  className="w-10 h-10 object-contain drop-shadow"
                  fallbackText={home?.abbreviation || 'H'}
                />
              </div>
              <span className="text-white/85 text-[10px] font-black tracking-[0.18em] uppercase text-center truncate max-w-[140px]">
                {home?.fullName || (loading ? 'Loading…' : '—')}
              </span>
            </div>

            <div className="flex items-center justify-center">
              <span className="text-white/20 text-[12px] font-semibold tracking-[0.35em] uppercase select-none">
                VS
              </span>
            </div>

            <div className="flex flex-col items-center gap-2 min-w-0">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.08] backdrop-blur-md flex items-center justify-center border border-white/[0.10] shadow-2xl">
                <SmartImg
                  src={awayLogo}
                  alt={away?.fullName || 'Away'}
                  className="w-10 h-10 object-contain drop-shadow"
                  fallbackText={away?.abbreviation || 'A'}
                />
              </div>
              <span className="text-white/85 text-[10px] font-black tracking-[0.18em] uppercase text-center truncate max-w-[140px]">
                {away?.fullName || (loading ? 'Loading…' : '—')}
              </span>
            </div>
          </div>

          <div className="mt-5 flex items-end justify-center gap-4">
            <span
              className="text-white font-black tabular-nums tracking-[-0.02em] drop-shadow-lg"
              style={{ fontSize: 'clamp(44px, 12vw, 78px)', lineHeight: 1 }}
            >
              {home ? home.score : 0}
            </span>

            <span className="text-white/28 font-extralight select-none" style={{ fontSize: 'clamp(24px, 6vw, 46px)' }}>
              –
            </span>

            <span
              className="text-white font-black tabular-nums tracking-[-0.02em] drop-shadow-lg"
              style={{ fontSize: 'clamp(44px, 12vw, 78px)', lineHeight: 1 }}
            >
              {away ? away.score : 0}
            </span>
          </div>

          <div className="mt-2 flex items-center justify-center gap-4">
            <span className="text-white/45 text-sm font-medium tabular-nums">
              {home ? `${home.goals}.${home.behinds}` : '0.0'}
            </span>
            <span className="text-white/15 text-sm">|</span>
            <span className="text-white/45 text-sm font-medium tabular-nums">
              {away ? `${away.goals}.${away.behinds}` : '0.0'}
            </span>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.22 }}
            className="mt-6 flex flex-col items-center gap-3"
          >
            <span className="bg-white/[0.10] backdrop-blur-md text-white text-[11px] font-black tracking-[0.25em] uppercase px-7 py-2 rounded-full border border-white/[0.12] shadow-lg">
              {status}
            </span>

            <p className="text-white/55 text-sm font-medium text-center">
              {venue}
              {status === 'FULL TIME' && home && away ? (
                <> • {home.fullName} by {margin}</>
              ) : null}
            </p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}