import { useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingDown, Plus, Camera } from 'lucide-react';
import type { BodyLog, TransformationProfile } from '../../lib/playerModeStore';
import { getDayAndWeek } from '../../lib/playerModeStore';

interface Props {
  logs: BodyLog[];
  profile: TransformationProfile;
  onAdd: (entry: BodyLog) => void;
}

const MILESTONES = [
  { week: 2, label: 'First check' },
  { week: 4, label: '1 month' },
  { week: 8, label: 'Halfway' },
  { week: 12, label: 'Finish line' },
];

export default function BodyTracker({ logs, profile, onAdd }: Props) {
  const [showSheet, setShowSheet] = useState(false);
  const [form, setForm] = useState({ weightKg: '', waistCm: '', notes: '' });

  const { week } = getDayAndWeek(profile.startDate);
  const latest = logs.length > 0 ? logs[logs.length - 1] : null;
  const first = logs.length > 0 ? logs[0] : null;

  const weightDelta = latest ? +(latest.weightKg - profile.startWeight).toFixed(1) : 0;
  const waistDelta = latest && first ? +(latest.waistCm - profile.startWaist).toFixed(1) : 0;
  const weightToGoal = latest ? +(latest.weightKg - profile.targetWeight).toFixed(1) : +(profile.startWeight - profile.targetWeight).toFixed(1);

  function handleSubmit() {
    if (!form.weightKg) return;
    onAdd({
      date: new Date().toISOString().slice(0, 10),
      weightKg: parseFloat(form.weightKg),
      waistCm: parseFloat(form.waistCm) || 0,
      notes: form.notes,
    });
    setForm({ weightKg: '', waistCm: '', notes: '' });
    setShowSheet(false);
  }

  // Simple sparkline points
  const sparkPoints = (() => {
    if (logs.length < 2) return null;
    const vals = logs.map(l => l.weightKg);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    const w = 300, h = 60;
    const points = vals.map((v, i) => {
      const x = (i / (vals.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    }).join(' ');
    return points;
  })();

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Key stats */}
        <div className="pm-stats-row pm-fade-up">
          <div className="pm-stat">
            <div className="pm-stat__value pm-stat__value--blue">
              {latest?.weightKg.toFixed(1) ?? profile.startWeight}<span className="pm-stat__unit">kg</span>
            </div>
            <div className="pm-stat__label">Current</div>
            {weightDelta !== 0 && (
              <div className={`pm-stat__delta pm-stat__delta--${weightDelta < 0 ? 'down' : 'up'}`}>
                {weightDelta > 0 ? '+' : ''}{weightDelta}kg
              </div>
            )}
          </div>
          <div className="pm-stat">
            <div className="pm-stat__value pm-stat__value--gold">
              {weightToGoal > 0 ? weightToGoal : 0}<span className="pm-stat__unit">kg</span>
            </div>
            <div className="pm-stat__label">To Goal</div>
          </div>
          <div className="pm-stat">
            <div className="pm-stat__value pm-stat__value--green">
              {latest?.waistCm ?? profile.startWaist}<span className="pm-stat__unit">cm</span>
            </div>
            <div className="pm-stat__label">Waist</div>
            {waistDelta !== 0 && (
              <div className={`pm-stat__delta pm-stat__delta--${waistDelta < 0 ? 'down' : 'up'}`}>
                {waistDelta > 0 ? '+' : ''}{waistDelta}cm
              </div>
            )}
          </div>
        </div>

        {/* Sparkline chart */}
        {sparkPoints && (
          <div className="pm-card pm-fade-up">
            <div className="pm-card__label"><TrendingDown size={12} /> Weight Trend</div>
            <div className="pm-chart-area">
              <svg className="pm-chart-svg" viewBox="0 0 300 60" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="pmChartGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0EA5E9" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#0EA5E9" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polyline
                  className="pm-chart-line"
                  points={sparkPoints}
                />
              </svg>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--pm-faint)', fontWeight: 600 }}>
              <span>Start: {profile.startWeight}kg</span>
              <span>Target: {profile.targetWeight}kg</span>
            </div>
          </div>
        )}

        {/* 12-week milestones */}
        <div className="pm-card pm-fade-up">
          <div className="pm-card__label">Checkpoints</div>
          <div className="pm-milestone-row">
            {MILESTONES.map(m => (
              <div
                key={m.week}
                className={`pm-milestone${week > m.week ? ' pm-milestone--done' : week === m.week ? ' pm-milestone--active' : ''}`}
              >
                <div className="pm-milestone__week">Wk {m.week}</div>
                <div style={{ fontSize: week > m.week ? '16px' : '12px', fontWeight: 800, color: week > m.week ? 'var(--pm-gold)' : week === m.week ? 'var(--pm-blue)' : 'var(--pm-faint)' }}>
                  {week > m.week ? '✓' : week === m.week ? '→' : '○'}
                </div>
                <div className="pm-milestone__label">{m.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Log history */}
        <div className="pm-card pm-fade-up">
          <div className="pm-card__label">Weight Log</div>
          {logs.length > 0 ? (
            <div className="pm-log-list">
              {[...logs].reverse().slice(0, 10).map(l => (
                <div key={l.date} className="pm-log-row">
                  <div>
                    <div className="pm-log-row__date">{l.date}</div>
                    {l.notes && <div className="pm-log-row__sub">{l.notes}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="pm-log-row__val">{l.weightKg}kg</div>
                    {l.waistCm > 0 && <div className="pm-log-row__sub">{l.waistCm}cm waist</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="pm-empty">
              <div className="pm-empty__icon">⚖️</div>
              <div className="pm-empty__text">No weight logs yet</div>
            </div>
          )}
          <button className="pm-add-btn pm-add-btn--blue" style={{ marginTop: 10 }} onClick={() => setShowSheet(true)}>
            <Plus size={14} /> Log Weight
          </button>
        </div>

        {/* Progress photos placeholder */}
        <div className="pm-card pm-fade-up">
          <div className="pm-card__label"><Camera size={12} /> Progress Photos</div>
          <div className="pm-empty">
            <div className="pm-empty__icon">📸</div>
            <div className="pm-empty__text">Photos stored locally</div>
            <div className="pm-empty__sub">Take weekly progress photos and save them to your camera roll. Label them by week number.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {MILESTONES.map(m => (
              <div key={m.week} style={{ flex: 1, height: 60, borderRadius: 10, background: 'var(--pm-card)', border: '1px dashed var(--pm-border)', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, color: 'var(--pm-faint)' }}>
                Wk {m.week}
              </div>
            ))}
          </div>
        </div>
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
            <div className="pm-sheet__title">Log Weight & Measurements</div>

            <div className="pm-field">
              <div className="pm-field__label">Weight (kg)</div>
              <input className="pm-field__input" type="number" inputMode="decimal" step="0.1" placeholder="88.5"
                value={form.weightKg} onChange={e => setForm(f => ({ ...f, weightKg: e.target.value }))} />
            </div>
            <div className="pm-field">
              <div className="pm-field__label">Waist (cm) — optional</div>
              <input className="pm-field__input" type="number" inputMode="decimal" step="0.5" placeholder="94.0"
                value={form.waistCm} onChange={e => setForm(f => ({ ...f, waistCm: e.target.value }))} />
            </div>
            <div className="pm-field">
              <div className="pm-field__label">Notes (optional)</div>
              <input className="pm-field__input" placeholder="e.g. morning, after workout..."
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <button className="pm-submit-btn" onClick={handleSubmit}>Save Entry</button>
          </motion.div>
        </div>
      )}
    </>
  );
}
