import { useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, ChevronDown, ChevronUp, Trophy } from 'lucide-react';
import type { DailyLog, WalkLog, SleepLog, BodyLog, WorkoutSession } from '../../lib/playerModeStore';
import { getWeeklyCompliance } from '../../lib/playerModeStore';

interface Props {
  dailyLogs: DailyLog[];
  walkLogs: WalkLog[];
  sleepLogs: SleepLog[];
  bodyLogs: BodyLog[];
  workoutSessions: WorkoutSession[];
}

export default function WeeklyScorecard({ dailyLogs, walkLogs, sleepLogs, bodyLogs, workoutSessions }: Props) {
  const [expanded, setExpanded] = useState(true);

  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const weekNum = Math.ceil(
    (new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / (7 * 24 * 3600 * 1000)
  );

  const compliance = getWeeklyCompliance(dailyLogs);

  const thisWeekWalks = walkLogs.filter(l => l.date >= weekStartStr);
  const totalWalkKm = thisWeekWalks.reduce((s, l) => s + l.distanceKm, 0).toFixed(1);

  const thisWeekSleep = sleepLogs.filter(l => l.date >= weekStartStr);
  const avgSleep = thisWeekSleep.length > 0
    ? (thisWeekSleep.reduce((s, l) => {
        const [bh, bm] = l.bedtime.split(':').map(Number);
        const [wh, wm] = l.wakeTime.split(':').map(Number);
        let hrs = (wh + wm / 60) - (bh + bm / 60);
        if (hrs < 0) hrs += 24;
        return s + hrs;
      }, 0) / thisWeekSleep.length).toFixed(1)
    : null;

  const thisWeekBody = bodyLogs.filter(l => l.date >= weekStartStr);
  const avgWeight = thisWeekBody.length > 0
    ? (thisWeekBody.reduce((s, l) => s + l.weightKg, 0) / thisWeekBody.length).toFixed(1)
    : null;

  const trainingSessions = workoutSessions.filter(s => s.date >= weekStartStr).length;

  const scoreItems = [
    { label: 'Compliance', val: `${compliance}%`, color: compliance >= 80 ? 'gold' : compliance >= 50 ? 'blue' : undefined },
    { label: 'Sessions', val: `${trainingSessions}/3` },
    { label: 'Walk km', val: totalWalkKm + 'km', color: 'blue' },
    { label: 'Avg sleep', val: avgSleep ? avgSleep + 'h' : '—' },
    { label: 'Avg weight', val: avgWeight ? avgWeight + 'kg' : '—' },
    { label: 'Walk days', val: `${thisWeekWalks.length}/7` },
  ];

  return (
    <div className="pm-card pm-fade-up" style={{ animationDelay: '0.15s' }}>
      <div
        className="pm-card__label"
        onClick={() => setExpanded(e => !e)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <BarChart3 size={12} />
        Weekly Scorecard — Week {weekNum}
        <span style={{ marginLeft: 'auto' }}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </div>

      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Compliance ring row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--pm-muted)' }}>Weekly compliance</span>
                <span style={{ fontSize: 14, fontWeight: 900, color: compliance >= 80 ? 'var(--pm-gold)' : 'var(--pm-blue)' }}>
                  {compliance}%
                </span>
              </div>
              <div className="pm-bar">
                <motion.div
                  className={`pm-bar__fill pm-bar__fill--${compliance >= 80 ? 'gold' : 'blue'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${compliance}%` }}
                  transition={{ duration: 0.9, delay: 0.1 }}
                />
              </div>
              {compliance === 100 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
                  <Trophy size={12} color="var(--pm-gold)" />
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--pm-gold)' }}>Perfect week!</span>
                </div>
              )}
            </div>
          </div>

          <div className="pm-scorecard-grid">
            {scoreItems.map((item, i) => (
              <motion.div
                key={item.label}
                className="pm-scorecard-item"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <div className={`pm-scorecard-item__val${item.color ? ` pm-scorecard-item__val--${item.color}` : ''}`}>
                  {item.val}
                </div>
                <div className="pm-scorecard-item__lbl">{item.label}</div>
              </motion.div>
            ))}
          </div>

          <div className="pm-coach-note" style={{ marginTop: 12 }}>
            <div className="pm-coach-note__tag">Coach Note</div>
            <div className="pm-coach-note__text">
              {compliance >= 80
                ? "Solid week. Stay consistent — the body responds to repeated effort. Don't change what's working."
                : compliance >= 50
                ? "Decent effort. Identify the items you're missing and fix one at a time. Progress over perfection."
                : "Tough week — happens. What matters is you showed up. Reset Sunday, recommit Monday. Let's go."}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
