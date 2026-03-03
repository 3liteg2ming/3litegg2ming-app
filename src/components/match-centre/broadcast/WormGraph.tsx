import { useMemo } from 'react';

type WormPoint = {
  q: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  home: number;
  away: number;
};

export default function WormGraph({
  progression,
  waitingLabel = 'Awaiting data',
}: {
  progression: WormPoint[];
  waitingLabel?: string;
}) {
  const wormData = useMemo(() => {
    if (!progression.length) return null;
    const points = progression.map((q) => ({ q: q.q, diff: q.home - q.away }));
    const maxAbs = Math.max(1, ...points.map((p) => Math.abs(p.diff)));
    const width = 520;
    const height = 120;
    const padX = 12;
    const padY = 12;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2;
    const stepX = innerW / Math.max(1, points.length - 1);

    const toXY = (diff: number, idx: number) => {
      const x = padX + idx * stepX;
      const y = padY + innerH * (0.5 - (diff / (maxAbs * 2)));
      return { x, y };
    };

    const homePts = [{ x: padX, y: padY + innerH / 2 }, ...points.map((p, i) => toXY(p.diff, i))];
    const awayPts = [{ x: padX, y: padY + innerH / 2 }, ...points.map((p, i) => toXY(-p.diff, i))];

    const toPath = (pts: Array<{ x: number; y: number }>) =>
      pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

    return {
      width,
      height,
      homePath: toPath(homePts),
      awayPath: toPath(awayPts),
      markers: points.map((p, i) => ({ ...toXY(p.diff, i), q: p.q })),
    };
  }, [progression]);

  if (!wormData) {
    return (
      <div className="mcMomentum__placeholder">
        <p className="mcMomentum__placeholderText">{waitingLabel}</p>
      </div>
    );
  }

  return (
    <div className="mcMomentum__wormSvgWrap">
      <svg
        className="mcMomentum__svg"
        viewBox={`0 0 ${wormData.width} ${wormData.height}`}
        preserveAspectRatio="none"
        aria-label="Momentum worm chart"
      >
        <defs>
          <linearGradient id="mcWormHome" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255,210,24,0.95)" />
            <stop offset="100%" stopColor="rgba(255,210,24,0.6)" />
          </linearGradient>
          <linearGradient id="mcWormAway" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(123,214,255,0.95)" />
            <stop offset="100%" stopColor="rgba(123,214,255,0.6)" />
          </linearGradient>
        </defs>

        <path d={wormData.homePath} className="mcMomentum__wormLine mcMomentum__wormLine--home" />
        <path d={wormData.awayPath} className="mcMomentum__wormLine mcMomentum__wormLine--away" />

        {wormData.markers.map((m, i) => (
          <circle
            key={m.q}
            cx={m.x}
            cy={m.y}
            r={i === wormData.markers.length - 1 ? 3.6 : 2.6}
            className="mcMomentum__marker"
          />
        ))}
      </svg>
    </div>
  );
}

