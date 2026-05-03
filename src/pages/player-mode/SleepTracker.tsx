import { useState } from 'react';
import { motion } from 'framer-motion';
import { Moon, Plus } from 'lucide-react';
import type { SleepLog } from '../../lib/playerModeStore';

interface Props {
  logs: SleepLog[];
  lastNight: SleepLog | null;
  avgQuality: string | null;
  onAdd: (entry: SleepLog) => void;
}

function calcHours(bedtime: string, wakeTime: string): number {
  const [bh, bm] = bedtime.split(':').map(Number);
  const [wh, wm] = wakeTime.split(':').map(Number);
  let hrs = (wh + wm / 60) - (bh + bm / 60);
  if (hrs < 0) hrs += 24;
  return +hrs.toFixed(1);
}

function recoveryScore(log: SleepLog): number {
  const hrs = calcHours(log.bedtime, log.wakeTime);
  const hrsScore = Math.min(100, (hrs / 8) * 60);
  const qualScore = (log.quality / 5) * 30;
  const penalty = log.newbornNight ? -15 : 0;
  return Math.max(0, Math.round(hrsScore + qualScore + penalty));
}

export default function SleepTracker({ logs, lastNight, avgQuality, onAdd }: Props) {
  const [showSheet, setShowSheet] = useState(false);
  const [form, setForm] = useState({ bedtime: '22:30', wakeTime: '06:00', quality: 3 as 1|2|3|4|5, newbornNight: false, notes: '' });

  const score = lastNight ? recoveryScore(lastNight) : null;
  const lastHrs = lastNight ? calcHours(lastNight.bedtime, lastNight.wakeTime) : null;

  const scoreColor = score != null ? (score >= 70 ? 'var(--pm-green)' : score >= 45 ? 'var(--pm-amber)' : 'var(--pm-red)') : 'var(--pm-muted)';

  function handleSubmit() {
    onAdd({
      date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
      bedtime: form.bedtime,
      wakeTime: form.wakeTime,
      quality: form.quality,
      newbornNight: form.newbornNight,
      notes: form.notes,
    });
    setShowSheet(false);
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Last night summary */}
        <div className="pm-card pm-fade-up">
          <div className="pm-card__label"><Moon size={12} /> Last Night</div>
          {lastNight ? (
            <>
              {lastNight.newbornNight && (
                <div className="pm-newborn-banner" style={{ marginBottom: 12 }}>
                  <span style={{ fontSize: 20 }}>🍼</span>
                  <div>
                    <div className="pm-newborn-banner__title">Newborn Night Detected</div>
                    <div className="pm-newborn-banner__text">Recovery Mode active. Consider swapping today's heavy session for a walk or mobility work. Showing up counts — don't force intensity on depleted sleep.</div>
                  </div>
                </div>
              )}

              <div className="pm-stats-row pm-stats-row--4" style={{ marginBottom: 12 }}>
                <div className="pm-stat">
                  <div className="pm-stat__value pm-stat__value--blue pm-stat__value--sm">{lastHrs}h</div>
                  <div className="pm-stat__label">Sleep</div>
                </div>
                <div className="pm-stat">
                  <div className="pm-stat__value pm-stat__value--sm" style={{ color: scoreColor }}>{score}</div>
                  <div className="pm-stat__label">Recovery</div>
                </div>
                <div className="pm-stat">
                  <div className="pm-stat__value pm-stat__value--sm">{lastNight.bedtime}</div>
                  <div className="pm-stat__label">Bedtime</div>
                </div>
                <div className="pm-stat">
                  <div className="pm-stat__value pm-stat__value--sm">{lastNight.wakeTime}</div>
                  <div className="pm-stat__label">Wake</div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--pm-muted)', marginBottom: 6, letterSpacing: '0.8px', textTransform: 'uppercase' }}>Quality</div>
                <div className="pm-quality-dots">
                  {[1,2,3,4,5].map(n => (
                    <div key={n} className={`pm-quality-dot${lastNight.quality >= n ? ' pm-quality-dot--selected' : ''}`}>
                      {n}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: 'var(--pm-card)', border: '1px solid var(--pm-border)', fontSize: 13, color: 'var(--pm-muted)', lineHeight: 1.5 }}>
                {score != null && score >= 70
                  ? "Great recovery. You're ready to train hard today. Hit the planned session."
                  : score != null && score >= 45
                  ? "Moderate recovery. Train as planned but listen to your body. Don't grind through if exhausted."
                  : "Poor recovery. Prioritise a walk and nutrition today. Training can wait — your body needs to rebuild."}
              </div>
            </>
          ) : (
            <div className="pm-empty">
              <div className="pm-empty__icon">😴</div>
              <div className="pm-empty__text">No sleep logged yet</div>
            </div>
          )}
          <button className="pm-add-btn pm-add-btn--blue" style={{ marginTop: 10 }} onClick={() => setShowSheet(true)}>
            <Plus size={14} /> Log Last Night
          </button>
        </div>

        {/* 7-day summary */}
        {logs.length > 0 && (
          <div className="pm-card pm-fade-up">
            <div className="pm-card__label">7-Day Average</div>
            <div className="pm-stats-row pm-stats-row--2">
              <div className="pm-stat">
                <div className="pm-stat__value pm-stat__value--blue">
                  {avgQuality}<span className="pm-stat__unit">/5</span>
                </div>
                <div className="pm-stat__label">Avg Quality</div>
              </div>
              <div className="pm-stat">
                <div className="pm-stat__value">
                  {(logs.slice(-7).reduce((s, l) => s + calcHours(l.bedtime, l.wakeTime), 0) / Math.min(logs.length, 7)).toFixed(1)}
                  <span className="pm-stat__unit">h</span>
                </div>
                <div className="pm-stat__label">Avg Sleep</div>
              </div>
            </div>
          </div>
        )}

        {/* Sleep log history */}
        {logs.length > 0 && (
          <div className="pm-card pm-fade-up">
            <div className="pm-card__label">Sleep History</div>
            <div className="pm-log-list">
              {[...logs].reverse().slice(0, 7).map(l => {
                const hrs = calcHours(l.bedtime, l.wakeTime);
                const rec = recoveryScore(l);
                return (
                  <div key={l.date} className="pm-log-row">
                    <div>
                      <div className="pm-log-row__date">{l.date}</div>
                      <div className="pm-log-row__sub">{l.bedtime} → {l.wakeTime}{l.newbornNight ? ' 🍼' : ''}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="pm-log-row__val">{hrs}h</div>
                      <div className="pm-log-row__sub" style={{ color: rec >= 70 ? 'var(--pm-green)' : rec >= 45 ? 'var(--pm-amber)' : 'var(--pm-red)' }}>
                        Recovery {rec}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showSheet && (
        <div className="pm-sheet-overlay" onClick={e => e.target === e.currentTarget && setShowSheet(false)}>
          <motion.div
            className="pm-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <div className="pm-sheet__handle" />
            <div className="pm-sheet__title">Log Last Night's Sleep</div>

            <div className="pm-field">
              <div className="pm-field__label">Bedtime</div>
              <input className="pm-field__input" type="time" value={form.bedtime}
                onChange={e => setForm(f => ({ ...f, bedtime: e.target.value }))} />
            </div>
            <div className="pm-field">
              <div className="pm-field__label">Wake time</div>
              <input className="pm-field__input" type="time" value={form.wakeTime}
                onChange={e => setForm(f => ({ ...f, wakeTime: e.target.value }))} />
            </div>
            <div className="pm-field">
              <div className="pm-field__label">Sleep quality</div>
              <div className="pm-quality-dots" style={{ margin: '4px 0' }}>
                {([1,2,3,4,5] as (1|2|3|4|5)[]).map(n => (
                  <div
                    key={n}
                    className={`pm-quality-dot${form.quality === n ? ' pm-quality-dot--selected' : ''}`}
                    onClick={() => setForm(f => ({ ...f, quality: n }))}
                  >{n}</div>
                ))}
              </div>
            </div>
            <div className="pm-toggle" onClick={() => setForm(f => ({ ...f, newbornNight: !f.newbornNight }))}>
              <div className={`pm-toggle__switch${form.newbornNight ? ' pm-toggle__switch--on' : ''}`}>
                <div className="pm-toggle__knob" />
              </div>
              <div className="pm-toggle__label">Newborn / disrupted night 🍼</div>
            </div>
            <div className="pm-field" style={{ marginTop: 8 }}>
              <div className="pm-field__label">Notes (optional)</div>
              <input className="pm-field__input" placeholder="e.g. bub up at 3am..."
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <button className="pm-submit-btn" onClick={handleSubmit}>Save Sleep</button>
          </motion.div>
        </div>
      )}
    </>
  );
}
