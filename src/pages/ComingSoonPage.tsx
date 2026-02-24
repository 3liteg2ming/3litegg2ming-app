import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { BarChart3, Trophy, Upload } from 'lucide-react';

const EG_YELLOW = '#F5C400';

function titleForPath(pathname: string) {
  if (pathname.startsWith('/ladder')) return 'Ladder';
  if (pathname.startsWith('/stats')) return 'Stats';
  if (pathname.startsWith('/submit')) return 'Submit Results';
  return 'Coming Soon';
}

function iconForPath(pathname: string) {
  if (pathname.startsWith('/ladder')) return Trophy;
  if (pathname.startsWith('/stats')) return BarChart3;
  if (pathname.startsWith('/submit')) return Upload;
  return Trophy;
}

export default function ComingSoonPage() {
  const { pathname } = useLocation();
  const title = useMemo(() => titleForPath(pathname), [pathname]);
  const Icon = useMemo(() => iconForPath(pathname), [pathname]);

  return (
    <div className="text-foreground px-4 py-5 pb-32">
      <div className="max-w-2xl mx-auto">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl shadow-[0_22px_60px_rgba(0,0,0,0.65)] overflow-hidden">
          <div className="relative p-6">
            <div className="absolute inset-0 bg-gradient-to-br from-[rgba(245,196,0,0.10)] via-transparent to-[rgba(0,136,255,0.10)]" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1">
                <Icon className="w-4 h-4" style={{ color: EG_YELLOW }} />
                <span className="font-mono text-[10px] uppercase tracking-widest text-white/70">
                  Elite Gaming • League App
                </span>
              </div>

              <h1 className="mt-4 font-heading text-4xl text-white font-bold tracking-tight">
                {title}
              </h1>
              <p className="mt-2 font-paragraph text-sm text-white/60 max-w-[42ch]">
                This module is wired into the bottom nav and ready — we’ll build the full feature next.
              </p>

              <div className="mt-6 rounded-2xl border border-white/10 bg-black/30 p-4">
                <div className="text-xs text-white/60">Status</div>
                <div className="mt-1 text-sm text-white/85 font-semibold">Coming soon</div>
                <div className="mt-3 h-2 w-full rounded-full bg-white/5 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: '35%', background: EG_YELLOW }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
