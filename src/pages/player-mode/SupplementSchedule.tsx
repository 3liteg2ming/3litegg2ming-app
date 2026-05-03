import { motion } from 'framer-motion';
import { Check, Pill } from 'lucide-react';
import type { SupplementLog } from '../../lib/playerModeStore';
import { SUPPLEMENT_SCHEDULE } from '../../lib/playerModeStore';

interface Props {
  log: SupplementLog;
  onToggle: (key: keyof SupplementLog) => void;
}

export default function SupplementSchedule({ log, onToggle }: Props) {
  const allKeys: (keyof SupplementLog)[] = ['creatine', 'protein', 'preworkout', 'electrolytes', 'magnesium'];
  const doneCount = allKeys.filter(k => log[k]).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="pm-card pm-fade-up">
        <div className="pm-card__label">
          <Pill size={12} />
          Supplement Schedule
          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: doneCount === allKeys.length ? 'var(--pm-green)' : 'var(--pm-muted)' }}>
            {doneCount}/{allKeys.length}
          </span>
        </div>

        {SUPPLEMENT_SCHEDULE.map(group => (
          <div key={group.timing} className="pm-timing-group">
            <div className="pm-timing-label">{group.timing}</div>
            {group.items.map(item => {
              const key = item.key as keyof SupplementLog;
              const done = !!log[key];
              return (
                <div
                  key={item.key}
                  className={`pm-supp-item${done ? ' pm-supp-item--done' : ''}`}
                  onClick={() => onToggle(key)}
                  role="checkbox"
                  aria-checked={done}
                >
                  <div className="pm-supp-check">
                    {done && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                      >
                        <Check size={11} color="#fff" strokeWidth={3} />
                      </motion.div>
                    )}
                  </div>
                  <div className="pm-supp-name">{item.name}</div>
                  <div className="pm-supp-dose">{item.dose}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Reference card */}
      <div className="pm-card pm-card--blue pm-fade-up">
        <div className="pm-card__label">Supplement Notes</div>
        {[
          { name: 'Creatine', note: 'Take daily even on rest days — timing doesn\'t matter, consistency does.' },
          { name: 'Protein', note: 'Post-workout window: aim within 60 min. 40g per serve.' },
          { name: 'Pre-Workout', note: 'Only on training days. 20-30 min before. Skip if training after 5pm.' },
          { name: 'Electrolytes', note: 'Morning especially on big walk days. Helps with hydration and performance.' },
          { name: 'Magnesium', note: 'Evening — supports sleep quality and muscle recovery.' },
        ].map(s => (
          <div key={s.name} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--pm-border)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--pm-text)', marginBottom: 3 }}>{s.name}</div>
            <div style={{ fontSize: 12, color: 'var(--pm-muted)', lineHeight: 1.5 }}>{s.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
