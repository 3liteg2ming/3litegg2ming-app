import { useMemo, useId } from 'react';

type WormPoint = {
  q: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  home: number;
  away: number;
};

const TIED_COLOR = 'rgba(255,255,255,0.55)';

// ─── Colour helper ────────────────────────────────────────────────────────────
// Boost dark hex team colours so the worm stays visible on a dark background.
function readableColor(raw: string): string {
  const hex = String(raw ?? '').trim();
  const h = hex.replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  if (lum >= 0.35) return hex;
  const k = Math.min(4.5, 0.35 / Math.max(lum, 0.01));
  return `rgb(${Math.round(Math.min(255, r * k))},${Math.round(Math.min(255, g * k))},${Math.round(Math.min(255, b * k))})`;
}

// ─── Quarter expansion patterns ───────────────────────────────────────────────
const PATTERNS: [number, number][][] = [
  [[0.50, 0.10], [0.55, 0.42], [0.78, 0.58], [0.85, 0.82], [1.00, 1.00]],
  [[0.10, 0.50], [0.42, 0.55], [0.58, 0.78], [0.82, 0.85], [1.00, 1.00]],
  [[0.48, 0.08], [0.52, 0.45], [0.80, 0.60], [0.88, 0.80], [1.00, 1.00]],
  [[0.12, 0.48], [0.40, 0.58], [0.62, 0.80], [0.80, 0.88], [1.00, 1.00]],
];

const STEPS    = PATTERNS[0].length; // 5
const QUARTERS = 4;

// ─── Component ────────────────────────────────────────────────────────────────

export default function WormGraph({
  progression,
  homeColor = '#FFD218',
  awayColor = '#7BD6FF',
  waitingLabel = 'Awaiting data',
}: {
  progression: WormPoint[];
  homeColor?: string;
  awayColor?: string;
  waitingLabel?: string;
}) {
  const uid = useId().replace(/:/g, '');

  const chart = useMemo(() => {
    if (!progression.length) return null;

    const hc = readableColor(homeColor);
    const ac = readableColor(awayColor);

    // Colour by current leader. For vertical segments from zero, use destination
    // diff so the first scoring event shows a real team colour.
    const sc = (diff: number, destDiff?: number): string => {
      const d = diff === 0 && destDiff !== undefined && destDiff !== 0 ? destDiff : diff;
      return d > 0 ? hc : d < 0 ? ac : TIED_COLOR;
    };

    // ── SVG coordinate space ───────────────────────────────────────────────
    // Landscape viewBox — wide and flat, AFL-style.
    const width   = 560;
    const height  = 88;
    const padL    = 28;
    const padR    = 6;
    const padY    = 5;
    const innerW  = width  - padL - padR;
    const innerH  = height - padY * 2;
    const centerY = padY + innerH / 2;

    const qWidth = innerW / QUARTERS;

    // ── Expand each quarter into STEPS internal checkpoints ───────────────
    type RawPt = { cumHome: number; cumAway: number; qIdx: number; step: number };
    const rawPts: RawPt[] = [];
    let prevHome = 0, prevAway = 0;

    for (let qi = 0; qi < progression.length && qi < QUARTERS; qi++) {
      const qEnd    = progression[qi];
      const dH      = qEnd.home - prevHome;
      const dA      = qEnd.away - prevAway;
      const pattern = PATTERNS[qi % PATTERNS.length];

      if (dH === 0 && dA === 0) {
        rawPts.push({ cumHome: qEnd.home, cumAway: qEnd.away, qIdx: qi, step: STEPS });
      } else {
        for (let s = 0; s < STEPS; s++) {
          const [hf, af] = pattern[s];
          const iH = Math.min(qEnd.home, Math.max(prevHome, prevHome + Math.round(dH * hf)));
          const iA = Math.min(qEnd.away, Math.max(prevAway, prevAway + Math.round(dA * af)));
          rawPts.push({ cumHome: iH, cumAway: iA, qIdx: qi, step: s + 1 });
        }
        const lastRaw = rawPts[rawPts.length - 1];
        lastRaw.cumHome = qEnd.home;
        lastRaw.cumAway = qEnd.away;
      }
      prevHome = qEnd.home;
      prevAway = qEnd.away;
    }

    // ── Y scale — tight buffer so worm fills the chart ────────────────────
    const maxAbsMargin = Math.max(...rawPts.map((p) => Math.abs(p.cumHome - p.cumAway)));
    const yRange = Math.max(Math.ceil(maxAbsMargin * 1.12), 8);

    const toY = (diff: number): number =>
      centerY - (Math.max(-yRange, Math.min(yRange, diff)) / yRange) * (innerH / 2);

    // ── Plot points ────────────────────────────────────────────────────────
    type PlotPt = { x: number; y: number; diff: number };
    const allPts: PlotPt[] = [{ x: padL, y: centerY, diff: 0 }];

    for (const p of rawPts) {
      const diff = p.cumHome - p.cumAway;
      const x    = padL + p.qIdx * qWidth + (p.step / STEPS) * qWidth;
      allPts.push({ x, y: toY(diff), diff });
    }

    // ── Area fill path (closed stepped shape back to centre line) ─────────
    const areaD: string[] = [`M ${padL.toFixed(1)} ${centerY.toFixed(1)}`];
    for (let i = 1; i < allPts.length; i++) {
      const a = allPts[i - 1];
      const b = allPts[i];
      if (b.x - a.x > 0.1) areaD.push(`H ${b.x.toFixed(1)}`);
      areaD.push(`V ${b.y.toFixed(1)}`);
    }
    areaD.push(`V ${centerY.toFixed(1)} Z`);
    const areaPath = areaD.join(' ');

    // ── Stepped worm segments ─────────────────────────────────────────────
    type Seg = { d: string; diff: number; destDiff?: number };
    const segs: Seg[] = [];

    for (let i = 0; i < allPts.length - 1; i++) {
      const a = allPts[i];
      const b = allPts[i + 1];

      if (b.x - a.x > 0.1) {
        segs.push({ d: `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} H ${b.x.toFixed(1)}`, diff: a.diff });
      }

      if (Math.abs(b.y - a.y) > 0.1) {
        const leaderFlips = (a.diff >= 0) !== (b.diff >= 0);
        if (!leaderFlips) {
          segs.push({
            d: `M ${b.x.toFixed(1)} ${a.y.toFixed(1)} V ${b.y.toFixed(1)}`,
            diff:     a.diff,
            destDiff: b.diff,
          });
        } else {
          const mid = centerY.toFixed(1);
          const bx  = b.x.toFixed(1);
          if (Math.abs(a.y - centerY) > 0.1)
            segs.push({ d: `M ${bx} ${a.y.toFixed(1)} V ${mid}`, diff: a.diff });
          if (Math.abs(b.y - centerY) > 0.1)
            segs.push({ d: `M ${bx} ${mid} V ${b.y.toFixed(1)}`, diff: b.diff });
        }
      }
    }

    // ── Y-axis grid & labels ───────────────────────────────────────────────
    const interval = yRange <= 12 ? 4 : yRange <= 20 ? 5 : yRange <= 40 ? 10 : 20;
    const maxLbl   = Math.floor(yRange / interval) * interval;
    const gridLines: Array<{ y: number; label: string; isCenter: boolean }> = [];

    for (let v = -maxLbl; v <= maxLbl; v += interval) {
      gridLines.push({
        y:        toY(v),
        label:    v === 0 ? '0' : v > 0 ? `+${v}` : `${v}`,
        isCenter: v === 0,
      });
    }

    // ── Quarter dividers & final dot ───────────────────────────────────────
    const dividers = [1, 2, 3].map((n) => padL + n * qWidth);
    const lastDot  = allPts[allPts.length - 1];

    return {
      width, height, padL, padR, padY, innerW, innerH, centerY,
      hc, ac, areaPath, segs, sc, gridLines, dividers, lastDot,
    };
  }, [progression, homeColor, awayColor]);

  if (!chart) {
    return (
      <div className="mcMomentum__placeholder">
        <p className="mcMomentum__placeholderText">{waitingLabel}</p>
      </div>
    );
  }

  const clipId = `wormClip_${uid}`;

  return (
    <div className="mcMomentum__wormSvgWrap">
      <svg
        className="mcMomentum__svg"
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        preserveAspectRatio="none"
        aria-label="Momentum worm chart"
      >
        <defs>
          {/* Clip to above centre — home team leading zone */}
          <clipPath id={`${clipId}_homeClip`}>
            <rect x={chart.padL} y={chart.padY} width={chart.innerW} height={chart.centerY - chart.padY} />
          </clipPath>
          {/* Clip to below centre — away team leading zone */}
          <clipPath id={`${clipId}_awayClip`}>
            <rect x={chart.padL} y={chart.centerY} width={chart.innerW} height={chart.padY + chart.innerH - chart.centerY} />
          </clipPath>
        </defs>

        {/* ── Y-axis grid lines + labels ──────────────────────────────── */}
        {chart.gridLines.map(({ y, label, isCenter }) => (
          <g key={label}>
            <line
              x1={chart.padL} y1={y.toFixed(1)}
              x2={chart.padL + chart.innerW} y2={y.toFixed(1)}
              stroke={isCenter ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.08)'}
              strokeWidth={isCenter ? '1.2' : '0.7'}
              strokeDasharray={isCenter ? undefined : '3 5'}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={(chart.padL - 3).toFixed(1)}
              y={y.toFixed(1)}
              textAnchor="end"
              dominantBaseline="middle"
              fill="rgba(200,215,240,0.45)"
              fontSize="7"
              fontFamily="inherit"
            >
              {label}
            </text>
          </g>
        ))}

        {/* ── Quarter vertical dividers ───────────────────────────────── */}
        {chart.dividers.map((x, i) => (
          <line
            key={i}
            x1={x.toFixed(1)} y1={chart.padY}
            x2={x.toFixed(1)} y2={chart.padY + chart.innerH}
            stroke="rgba(255,255,255,0.09)"
            strokeWidth="0.7"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {/* ── Area fill — home colour above zero, away colour below zero ── */}
        {/* Home team leading: clip to top half */}
        <path
          d={chart.areaPath}
          fill={chart.hc}
          fillOpacity="0.35"
          clipPath={`url(#${clipId}_homeClip)`}
        />
        {/* Away team leading: clip to bottom half */}
        <path
          d={chart.areaPath}
          fill={chart.ac}
          fillOpacity="0.35"
          clipPath={`url(#${clipId}_awayClip)`}
        />

        {/* ── Stepped worm line, coloured by current leader ───────────── */}
        {chart.segs.map((s, i) => (
          <path
            key={i}
            d={s.d}
            fill="none"
            stroke={chart.sc(s.diff, s.destDiff)}
            strokeWidth="3"
            strokeLinecap="square"
            strokeLinejoin="miter"
            vectorEffect="non-scaling-stroke"
            style={{ filter: 'drop-shadow(0 0 5px rgba(255,255,255,0.35))' }}
          />
        ))}

        {/* ── Final dot ───────────────────────────────────────────────── */}
        <circle
          cx={chart.lastDot.x.toFixed(1)}
          cy={chart.lastDot.y.toFixed(1)}
          r="3.5"
          fill={chart.sc(chart.lastDot.diff)}
          stroke="rgba(255,255,255,0.6)"
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
          className="mcMomentum__marker"
        />
      </svg>
    </div>
  );
}
