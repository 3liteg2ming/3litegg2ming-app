import { useState } from 'react';
import { motion } from 'framer-motion';
import { Footprints, Flame, Plus } from 'lucide-react';
import type { WalkLog } from '../../lib/playerModeStore';

interface Props {
  logs: WalkLog[];
  streak: number;
  weekTotal: number;
  onAdd: (entry: WalkLog) => void;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WALK_TARGET_KM = 5;
const WEEKLY_TARGET_KM = 35;

export default function WalkTracker({ logs, streak, weekTotal, onAdd }: Props) {
  const [showSheet, setShowSheet] = useState(false);
  const [form, setForm] = useState({ distanceKm: '', steps: '', durationMin: '', type: 'outdoor', inclinePct: '0', notes: '' });

  const today = new Date();
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - today.getDay() + i);
    return d.toISOString().slice(0, 10);
  });

  function handleSubmit() {
    if (!form.distanceKm) return;
    onAdd({
      date: new Date().toISOString().slice(0, 10),
      distanceKm: parseFloat(form.distanceKm) || 0,
      steps: parseInt(form.steps) || 0,
      durationMin: parseInt(form.durationMin) || 0,
      type: form.type as WalkLog['type'],
      inclinePct: parseFloat(form.inclinePct) || 0,
      notes: form.notes,
    });
    setForm({ distanceKm: '', steps: '', durationMin: '', type: 'outdoor', inclinePct: '0', notes: '' });
    setShowSheet(false);
  }

  const todayLog = logs.find(l => l.date === today.toISOString().slice(0, 10));
  const weekPct = Math.min(100, Math.round((weekTotal / WEEKLY_TARGET_KM) * 100));

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Streak + week days */}
        <div className="pm-card pm-fade-up">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div className="pm-streak-badge">
              <Flame size={18} color="var(--pm-amber)" />
              <div>
                <div className="pm-streak-badge__num">{streak}</div>
                <div className="pm-streak-badge__label">day streak</div>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--pm-muted)' }}>Weekly total</span>
                <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--pm-blue)' }}>{weekTotal.toFixed(1)}km</span>
              </div>
              <div className="pm-bar">
                <motion.div
                  className="pm-bar__fill pm-bar__fill--blue"
                  animate={{ width: `${weekPct}%` }}
                  transition={{ duration: 0.8 }}
                />
              </div>
              <div style={{ fontSize: 10, color: 'var(--pm-faint)', marginTop: 4, fontWeight: 600 }}>
                Target: {WEEKLY_TARGET_KM}km / week
              </div>
            </div>
          </div>

          <div className="pm-week-days">
            {weekDays.map((date, i) => {
              const walked = logs.some(l => l.date === date);
              const isToday = date === today.toISOString().slice(0, 10);
              return (
                <div key={date} className={`pm-day-dot${walked ? ' pm-day-dot--done' : ''}`}>
                  <div className="pm-day-dot__circle" style={isToday && !walked ? { borderColor: 'rgba(14,165,233,0.4)', color: 'var(--pm-blue)' } : {}}>
                    {walked ? '✓' : DAY_NAMES[i][0]}
                  </div>
                  <div className="pm-day-dot__name">{DAY_NAMES[i]}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Today's log */}
        <div className="pm-card pm-fade-up">
          <div className="pm-card__label"><Footprints size={12} /> Today's Walk</div>
          {todayLog ? (
            <div className="pm-stats-row pm-stats-row--4">
              {[
                { label: 'Distance', val: todayLog.distanceKm.toFixed(1), unit: 'km' },
                { label: 'Steps', val: todayLog.steps > 0 ? (todayLog.steps / 1000).toFixed(1) + 'k' : '—', unit: '' },
                { label: 'Duration', val: todayLog.durationMin > 0 ? todayLog.durationMin + '' : '—', unit: todayLog.durationMin > 0 ? 'min' : '' },
                { label: 'Type', val: todayLog.type, unit: '' },
              ].map(s => (
                <div key={s.label} className="pm-stat">
                  <div className="pm-stat__value pm-stat__value--sm pm-stat__value--blue">
                    {s.val}<span className="pm-stat__unit">{s.unit}</span>
                  </div>
                  <div className="pm-stat__label">{s.label}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="pm-empty">
              <div className="pm-empty__icon">🚶</div>
              <div className="pm-empty__text">No walk logged today</div>
            </div>
          )}
          <button className="pm-add-btn pm-add-btn--blue" style={{ marginTop: 10 }} onClick={() => setShowSheet(true)}>
            <Plus size={14} /> Log Walk
          </button>
        </div>

        {/* Recent walks */}
        {logs.length > 0 && (
          <div className="pm-card pm-fade-up">
            <div className="pm-card__label">Recent Walks</div>
            <div className="pm-log-list">
              {[...logs].reverse().slice(0, 7).map(l => (
                <div key={l.date} className="pm-log-row">
                  <div>
                    <div className="pm-log-row__date">{l.date}</div>
                    <div className="pm-log-row__sub">{l.type}{l.inclinePct > 0 ? ` · ${l.inclinePct}% incline` : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="pm-log-row__val">{l.distanceKm.toFixed(1)}km</div>
                    {l.steps > 0 && <div className="pm-log-row__sub">{(l.steps / 1000).toFixed(1)}k steps</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add walk sheet */}
      {showSheet && (
        <div className="pm-sheet-overlay" onClick={e => e.target === e.currentTarget && setShowSheet(false)}>
          <motion.div
            className="pm-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          >
            <div className="pm-sheet__handle" />
            <div className="pm-sheet__title">Log Walk</div>

            <div className="pm-field">
              <div className="pm-field__label">Distance (km)</div>
              <input className="pm-field__input" type="number" inputMode="decimal" step="0.1" placeholder="6.0"
                value={form.distanceKm} onChange={e => setForm(f => ({ ...f, distanceKm: e.target.value }))} />
            </div>
            <div className="pm-field">
              <div className="pm-field__label">Steps (optional)</div>
              <input className="pm-field__input" type="number" inputMode="numeric" placeholder="7500"
                value={form.steps} onChange={e => setForm(f => ({ ...f, steps: e.target.value }))} />
            </div>
            <div className="pm-field">
              <div className="pm-field__label">Duration (minutes)</div>
              <input className="pm-field__input" type="number" inputMode="numeric" placeholder="60"
                value={form.durationMin} onChange={e => setForm(f => ({ ...f, durationMin: e.target.value }))} />
            </div>
            <div className="pm-field">
              <div className="pm-field__label">Type</div>
              <select className="pm-field__select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="outdoor">Outdoor</option>
                <option value="treadmill">Treadmill</option>
                <option value="zone2">Zone 2 / Incline</option>
              </select>
            </div>
            {form.type !== 'outdoor' && (
              <div className="pm-field">
                <div className="pm-field__label">Incline %</div>
                <input className="pm-field__input" type="number" inputMode="numeric" placeholder="8"
                  value={form.inclinePct} onChange={e => setForm(f => ({ ...f, inclinePct: e.target.value }))} />
              </div>
            )}
            <button className="pm-submit-btn pm-submit-btn--green" onClick={handleSubmit}>Save Walk</button>
          </motion.div>
        </div>
      )}
    </>
  );
}
