import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Dumbbell, Footprints, Beef, Droplets, UtensilsCrossed, Pill, Moon, Camera } from 'lucide-react';
import type { DailyLog } from '../../lib/playerModeStore';
import { getTodayScore } from '../../lib/playerModeStore';

interface CheckItem {
  key: keyof DailyLog;
  label: string;
  sub?: string;
  icon: React.ReactNode;
}

const ITEMS: CheckItem[] = [
  { key: 'gymDone',        label: 'Gym session completed',    icon: <Dumbbell size={15} /> },
  { key: 'walkDone',       label: 'Walk completed',           icon: <Footprints size={15} /> },
  { key: 'proteinHit',     label: 'Protein target hit',       sub: '180g',                   icon: <Beef size={15} /> },
  { key: 'waterHit',       label: 'Water target hit',         sub: '3L',                     icon: <Droplets size={15} /> },
  { key: 'caloriesHit',    label: 'Calories / macros on track', sub: '2,100 kcal',            icon: <UtensilsCrossed size={15} /> },
  { key: 'supplementsDone',label: 'Supplements taken',        icon: <Pill size={15} /> },
  { key: 'bedtimeHit',     label: 'Bed by target time',       sub: '10:30 PM',               icon: <Moon size={15} /> },
  { key: 'photoDone',      label: 'Progress photo (if due)',  icon: <Camera size={15} /> },
];

interface Props {
  log: DailyLog;
  onToggle: (key: keyof DailyLog) => void;
}

export default function DailyChecklist({ log, onToggle }: Props) {
  const [popKey, setPopKey] = useState<string | null>(null);
  const { score, total } = getTodayScore(log);
  const pct = Math.round((score / total) * 100);

  function handleToggle(key: keyof DailyLog) {
    setPopKey(key as string);
    setTimeout(() => setPopKey(null), 300);
    onToggle(key);
  }

  return (
    <div className="pm-card pm-fade-up" style={{ animationDelay: '0.1s' }}>
      <div className="pm-card__label">
        <Check size={12} />
        Daily Checklist
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: score === total ? 'var(--pm-green)' : 'var(--pm-muted)' }}>
          {score}/{total}
        </span>
      </div>

      <div className="pm-checklist">
        {ITEMS.map((item) => {
          const done = !!log[item.key];
          return (
            <div
              key={item.key as string}
              className={`pm-check-item${done ? ' pm-check-item--done' : ''}`}
              onClick={() => handleToggle(item.key)}
              role="checkbox"
              aria-checked={done}
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && handleToggle(item.key)}
            >
              <div className={`pm-check-box${popKey === (item.key as string) ? ' pm-check-pop' : ''}`}>
                <AnimatePresence>
                  {done && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                    >
                      <Check size={12} color="#fff" strokeWidth={3} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <span style={{ color: 'var(--pm-muted)', flexShrink: 0 }}>{item.icon}</span>
              <div style={{ flex: 1 }}>
                <div className="pm-check-label">{item.label}</div>
                {item.sub && <div className="pm-check-sub">{item.sub}</div>}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="pm-bar">
          <motion.div
            className={`pm-bar__fill pm-bar__fill--${pct === 100 ? 'gold' : 'green'}`}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--pm-muted)', fontWeight: 600 }}>Today's compliance</span>
          <span style={{ fontSize: 13, fontWeight: 900, color: pct === 100 ? 'var(--pm-gold)' : 'var(--pm-green)' }}>
            {pct}%{pct === 100 ? ' 🏆' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}
