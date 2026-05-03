import { motion } from 'framer-motion';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type { TransformationProfile, BodyLog } from '../../lib/playerModeStore';
import { getDayAndWeek, getWeeklyCompliance } from '../../lib/playerModeStore';
import type { DailyLog } from '../../lib/playerModeStore';

interface Props {
  profile: TransformationProfile;
  latestBody: BodyLog | null;
  dailyLogs: DailyLog[];
}

function ComplianceRing({ pct }: { pct: number }) {
  const r = 33;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 80 ? 'green' : pct >= 50 ? 'blue' : 'amber';

  return (
    <div className="pm-ring-wrap">
      <svg className="pm-ring-svg" viewBox="0 0 86 86">
        <defs>
          <filter id="ringGlow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle className="pm-ring__track" cx="43" cy="43" r={r} />
        <motion.circle
          className={`pm-ring__fill pm-ring__fill--${color}`}
          cx="43" cy="43" r={r}
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: [0.4, 0, 0.2, 1], delay: 0.3 }}
        />
      </svg>
      <div className="pm-ring__center">
        <div className="pm-ring__pct">{pct}%</div>
        <div className="pm-ring__label">week</div>
      </div>
      <div className="pm-ring-caption">compliance</div>
    </div>
  );
}

export default function HeroSection({ profile, latestBody, dailyLogs }: Props) {
  const { day, week } = getDayAndWeek(profile.startDate);
  const compliance = getWeeklyCompliance(dailyLogs);

  const currentWeight = latestBody?.weightKg ?? profile.startWeight;
  const weightDelta = +(currentWeight - profile.startWeight).toFixed(1);

  const daysToGo = Math.max(0, 84 - day + 1);
  const progressPct = Math.min(100, Math.round((day / 84) * 100));

  return (
    <motion.div
      className="pm-hero"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="pm-hero__shimmer" />

      <div className="pm-hero__top">
        <div className="pm-hero__left">
          <div className="pm-phase-badge">
            <div className="pm-phase-badge__dot" />
            Phase {profile.phase} — {profile.phaseName}
          </div>

          <div className="pm-hero__counter">
            <strong>Week {week}</strong> of 12 &nbsp;·&nbsp; <strong>Day {day}</strong> &nbsp;·&nbsp; {daysToGo}d to go
          </div>

          <div className="pm-hero__weight">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
              <motion.span
                className="pm-hero__weight-num"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                {currentWeight.toFixed(1)}
              </motion.span>
              <span className="pm-hero__weight-unit">kg</span>
            </div>
            <div className={`pm-hero__weight-delta pm-hero__weight-delta--${weightDelta < 0 ? 'down' : weightDelta > 0 ? 'up' : 'same'}`}>
              {weightDelta < 0 ? <TrendingDown size={13} /> : weightDelta > 0 ? <TrendingUp size={13} /> : <Minus size={13} />}
              {weightDelta === 0 ? 'No change' : `${weightDelta > 0 ? '+' : ''}${weightDelta} kg from start`}
            </div>
          </div>
        </div>

        <ComplianceRing pct={compliance} />
      </div>

      {/* 12-week progress bar */}
      <div style={{ position: 'relative', zIndex: 1, marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--pm-muted)' }}>
            12-Week Progress
          </span>
          <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--pm-blue)' }}>{progressPct}%</span>
        </div>
        <div className="pm-bar">
          <motion.div
            className="pm-bar__fill pm-bar__fill--blue"
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 1, ease: [0.4, 0, 0.2, 1], delay: 0.4 }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5 }}>
          <span style={{ fontSize: 10, color: 'var(--pm-faint)', fontWeight: 600 }}>Start: {profile.startWeight}kg</span>
          <span style={{ fontSize: 10, color: 'var(--pm-faint)', fontWeight: 600 }}>Goal: {profile.targetWeight}kg</span>
        </div>
      </div>
    </motion.div>
  );
}
