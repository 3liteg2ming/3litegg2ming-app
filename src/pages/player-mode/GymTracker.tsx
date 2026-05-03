import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dumbbell, Zap, Trophy, Plus, X } from 'lucide-react';
import type { WorkoutSession } from '../../lib/playerModeStore';
import { WORKOUT_TEMPLATES, EMERGENCY_WORKOUT } from '../../lib/playerModeStore';

interface Props {
  sessions: WorkoutSession[];
  onAddSession: (session: WorkoutSession) => void;
}

type TemplateKey = 'push' | 'pull' | 'legs';

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

export default function GymTracker({ sessions, onAddSession }: Props) {
  const [activeTemplate, setActiveTemplate] = useState<TemplateKey>('push');
  const [emergency, setEmergency] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [doneExercises, setDoneExercises] = useState<Set<string>>(new Set());

  const template = WORKOUT_TEMPLATES[activeTemplate];
  const exercises = emergency ? EMERGENCY_WORKOUT : template.exercises;

  const recentSessions = [...sessions].reverse().slice(0, 5);

  function toggleExercise(name: string) {
    setDoneExercises(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  function logSession() {
    const session: WorkoutSession = {
      id: genId(),
      date: new Date().toISOString().slice(0, 10),
      template: emergency ? 'emergency' : activeTemplate,
      sets: exercises.map(ex => ({
        exerciseName: ex.name,
        setNum: ex.sets,
        reps: 0,
        weightKg: 0,
        isPb: false,
      })),
      durationMin: emergency ? 30 : 55,
      notes: '',
    };
    onAddSession(session);
    setDoneExercises(new Set());
    setShowLog(false);
    alert('Session logged!');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Template selector */}
      <div className="pm-card pm-fade-up">
        <div className="pm-card__label"><Dumbbell size={12} /> Select Workout</div>

        <div className="pm-workout-tabs">
          {(['push', 'pull', 'legs'] as TemplateKey[]).map(key => (
            <button
              key={key}
              className={`pm-workout-tab${activeTemplate === key && !emergency ? ' pm-workout-tab--active' : ''}`}
              onClick={() => { setActiveTemplate(key); setEmergency(false); setDoneExercises(new Set()); }}
            >
              <div style={{ fontSize: 9, letterSpacing: '1px', opacity: 0.7 }}>{WORKOUT_TEMPLATES[key].day}</div>
              <div>{WORKOUT_TEMPLATES[key].label}</div>
            </button>
          ))}
        </div>

        <button
          className="pm-emergency-btn"
          onClick={() => { setEmergency(e => !e); setDoneExercises(new Set()); }}
        >
          <Zap size={15} />
          {emergency ? 'Exit Emergency Mode' : '30-MIN EMERGENCY MODE'}
        </button>
      </div>

      {/* Exercise list */}
      <div className="pm-card pm-fade-up">
        <div className="pm-card__label">
          {emergency ? '⚡ Emergency Circuit' : `${template.day} — ${template.label}`}
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--pm-muted)' }}>
            {doneExercises.size}/{exercises.length} done
          </span>
        </div>

        {exercises.map((ex) => {
          const done = doneExercises.has(ex.name);
          return (
            <div
              key={ex.name}
              className="pm-exercise-row"
              onClick={() => toggleExercise(ex.name)}
              style={{ cursor: 'pointer' }}
            >
              <div>
                <div className="pm-exercise-name" style={{ textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.5 : 1 }}>
                  {ex.name}
                </div>
                <div className="pm-exercise-meta">{ex.sets} sets × {ex.reps}{ex.notes ? ` · ${ex.notes}` : ''}</div>
              </div>
              <div className="pm-exercise-sets">
                {Array.from({ length: ex.sets }).map((_, i) => (
                  <div key={i} className={`pm-set-chip${done ? ' pm-set-chip--done' : ''}`}>
                    {i + 1}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {doneExercises.size > 0 && (
          <motion.button
            className="pm-submit-btn"
            style={{ marginTop: 12 }}
            onClick={logSession}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Log Session Complete
          </motion.button>
        )}
      </div>

      {/* Recent sessions */}
      {recentSessions.length > 0 && (
        <div className="pm-card pm-fade-up">
          <div className="pm-card__label"><Trophy size={12} /> Recent Sessions</div>
          {recentSessions.map((s, i) => (
            <div key={s.id} className="pm-exercise-row">
              <div>
                <div className="pm-exercise-name">{s.template === 'emergency' ? '⚡ Emergency' : `${WORKOUT_TEMPLATES[s.template as TemplateKey]?.label ?? s.template}`}</div>
                <div className="pm-exercise-meta">{s.date} · {s.durationMin}min</div>
              </div>
              <div className="pm-pb-badge">W{i + 1}</div>
            </div>
          ))}
        </div>
      )}

      {recentSessions.length === 0 && (
        <div className="pm-card">
          <div className="pm-empty">
            <div className="pm-empty__icon">💪</div>
            <div className="pm-empty__text">No sessions logged yet</div>
            <div className="pm-empty__sub">Complete a workout above to log your first session</div>
          </div>
        </div>
      )}
    </div>
  );
}
