import { useState, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TransformationProfile {
  startDate: string;
  startWeight: number;
  targetWeight: number;
  startWaist: number;
  targetWaist: number;
  dailyCalories: number;
  dailyProtein: number;
  dailyWaterL: number;
  bedtimeTarget: string;
  phase: 1 | 2 | 3 | 4;
  phaseName: string;
}

export interface DailyLog {
  date: string;
  gymDone: boolean;
  walkDone: boolean;
  walkKm: number;
  walkSteps: number;
  proteinHit: boolean;
  waterHit: boolean;
  caloriesHit: boolean;
  supplementsDone: boolean;
  bedtimeHit: boolean;
  photoDone: boolean;
  notes: string;
}

export interface BodyLog {
  date: string;
  weightKg: number;
  waistCm: number;
  notes: string;
}

export interface WorkoutSet {
  exerciseName: string;
  setNum: number;
  reps: number;
  weightKg: number;
  isPb: boolean;
}

export interface WorkoutSession {
  id: string;
  date: string;
  template: 'push' | 'pull' | 'legs' | 'emergency';
  sets: WorkoutSet[];
  durationMin: number;
  notes: string;
}

export interface WalkLog {
  date: string;
  distanceKm: number;
  steps: number;
  durationMin: number;
  type: 'outdoor' | 'treadmill' | 'zone2';
  inclinePct: number;
  notes: string;
}

export interface SleepLog {
  date: string;
  bedtime: string;
  wakeTime: string;
  quality: 1 | 2 | 3 | 4 | 5;
  newbornNight: boolean;
  notes: string;
}

export interface SupplementLog {
  date: string;
  creatine: boolean;
  protein: boolean;
  preworkout: boolean;
  electrolytes: boolean;
  magnesium: boolean;
}

// ─── Workout Templates ────────────────────────────────────────────────────────

export interface ExerciseTemplate {
  name: string;
  sets: number;
  reps: string;
  notes?: string;
}

export const WORKOUT_TEMPLATES: Record<'push' | 'pull' | 'legs', { label: string; day: string; exercises: ExerciseTemplate[] }> = {
  push: {
    label: 'Push',
    day: 'DAY A',
    exercises: [
      { name: 'Bench Press', sets: 4, reps: '8–10' },
      { name: 'Incline DB Press', sets: 3, reps: '10–12' },
      { name: 'Overhead Press', sets: 3, reps: '8–10' },
      { name: 'DB Lateral Raises', sets: 3, reps: '12–15' },
      { name: 'Tricep Pushdown', sets: 3, reps: '12–15' },
      { name: 'Dips', sets: 3, reps: '10–12', notes: 'Add weight if easy' },
    ],
  },
  pull: {
    label: 'Pull',
    day: 'DAY B',
    exercises: [
      { name: 'Romanian Deadlift', sets: 4, reps: '6–8' },
      { name: 'Lat Pulldown', sets: 4, reps: '8–10' },
      { name: 'Cable Row', sets: 3, reps: '10–12' },
      { name: 'Face Pulls', sets: 3, reps: '15–20' },
      { name: 'Barbell Curl', sets: 3, reps: '10–12' },
      { name: 'Hammer Curl', sets: 3, reps: '12–15' },
    ],
  },
  legs: {
    label: 'Legs + Core',
    day: 'DAY C',
    exercises: [
      { name: 'Back Squat', sets: 4, reps: '6–8' },
      { name: 'Leg Press', sets: 3, reps: '10–12' },
      { name: 'Romanian Deadlift', sets: 3, reps: '10–12' },
      { name: 'Leg Curl', sets: 3, reps: '12–15' },
      { name: 'Calf Raises', sets: 4, reps: '15–20' },
      { name: 'Plank', sets: 3, reps: '45–60s' },
    ],
  },
};

export const EMERGENCY_WORKOUT: ExerciseTemplate[] = [
  { name: 'Goblet Squat', sets: 3, reps: '15' },
  { name: 'Push-ups', sets: 3, reps: 'Max' },
  { name: 'DB Row', sets: 3, reps: '12 each' },
  { name: 'Reverse Lunges', sets: 3, reps: '12 each' },
  { name: 'DB Shoulder Press', sets: 3, reps: '12' },
  { name: 'Plank', sets: 3, reps: '45s' },
];

// ─── Supplements ──────────────────────────────────────────────────────────────

export const SUPPLEMENT_SCHEDULE = [
  { timing: 'MORNING', items: [
    { key: 'creatine', name: 'Creatine', dose: '5g' },
    { key: 'electrolytes', name: 'Electrolytes', dose: '1 serve' },
  ]},
  { timing: 'PRE-WORKOUT', items: [
    { key: 'preworkout', name: 'Pre-Workout / Oxyshred', dose: '1 serve' },
  ]},
  { timing: 'POST-WORKOUT', items: [
    { key: 'protein', name: 'Protein Shake', dose: '40g' },
  ]},
  { timing: 'EVENING', items: [
    { key: 'magnesium', name: 'Magnesium', dose: '300mg' },
  ]},
];

// ─── Nutrition content ────────────────────────────────────────────────────────

export const MEAL_PLAN = [
  { label: 'Breakfast', options: ['4 eggs + 2 toast + coffee', 'Greek yoghurt + oats + berries (300 kcal)', 'High protein option: cottage cheese + fruit'] },
  { label: 'Lunch', options: ['Meal prep: chicken + rice + broccoli', 'Tuna wrap + salad', 'Leftover dinner + extra protein'] },
  { label: 'Dinner', options: ['Chicken thighs + sweet potato + veg', 'Beef mince + pasta + hidden veg', 'Salmon + rice + greens (family-friendly)'] },
  { label: 'Snacks', options: ['Protein shake (40g)', 'Rice cakes + peanut butter', 'Greek yoghurt (200g)', 'Handful nuts (small)'] },
  { label: 'Pre-Gym', options: ['Banana + coffee (30 min out)', 'Oats + protein shake (1hr out)', 'Rice cakes + PB (light session)'] },
  { label: 'Post-Gym', options: ['Protein shake immediately (40g)', 'Meal within 90 min', 'Carbs + protein priority'] },
];

export const GROCERY_LIST = [
  'Chicken breast / thighs (1.5kg)',
  'Beef mince (500g)',
  'Salmon (2 fillets)',
  'Eggs (2 dozen)',
  'Greek yoghurt (1kg tub)',
  'Cottage cheese',
  'Protein powder',
  'Oats (large bag)',
  'Brown rice / jasmine rice',
  'Sweet potato (1kg)',
  'Broccoli + mixed veg (frozen ok)',
  'Banana + fruit',
  'Rice cakes',
  'Peanut butter (natural)',
  'Almond milk',
];

export const EMERGENCY_MEALS = [
  { name: 'Fast food: Grilled chicken burger', macros: '~35g protein, ~500 kcal' },
  { name: 'Servo/convenience: Chobani + banana', macros: '~20g protein, ~280 kcal' },
  { name: 'Meal prep backup: frozen rice bowls', macros: '~40g protein, ~550 kcal' },
  { name: 'Tuna + crackers (desk meal)', macros: '~30g protein, ~350 kcal' },
  { name: 'Protein shake + fruit', macros: '~40g protein, ~350 kcal' },
];

// ─── Motivation content ───────────────────────────────────────────────────────

export const MOTIVATION_CONTENT = {
  why: `I'm doing this because I want to be a strong dad. I want my kids to see a father who is fit, healthy, and disciplined. I want to feel confident, energetic, and proud of the man I see in the mirror. This isn't just about how I look — it's about who I'm becoming. Every rep, every walk, every meal I track is a vote for the version of me I'm building.`,

  mission: `Project Strong Dad is a 12-week commitment to becoming the most physically capable version of myself. I will train hard 3 days a week. I will walk every day. I will hit my protein target. I will sleep early. I will earn my transformation — not wish for it.`,

  morningScript: `Today is another day to move closer to the man I'm building. I don't need motivation — I need discipline. The gym is already programmed. The walk is already planned. The food is already prepped. All I need to do is execute. Let's go.`,

  nightScript: `Tonight I go to bed on time because sleep is training. Sleep is where the muscle is built, the fat is burned, and the brain recovers. My kids need a dad who shows up tomorrow — fully rested, fully present. Lights out. Let tomorrow be earned.`,

  cravingScript: `Before I eat something off plan, I'll ask: is this choice for the man I'm becoming or the man I'm leaving behind? I'm not depriving myself — I'm choosing. One meal doesn't destroy a transformation, but patterns do. I'll eat the planned meal, drink water, and give the craving 10 minutes. It will pass.`,

  badDayPlan: `1. Accept it: bad days exist, they don't define the transformation.\n2. Do the minimum: if no gym, do a walk. If no walk, do 20 push-ups.\n3. Hit the protein target — nutrition doesn't care how tired you are.\n4. Sleep on time no matter what.\n5. Tomorrow is a clean slate. The streak continues.`,

  weeklyReset: `Another week done. Look at how far you've come, not how far you still have to go. Rest. Reflect. Recommit. Monday is a new week and a new chance to build the dad I was born to be. Reset and go again.`,
};

// ─── Default profile ──────────────────────────────────────────────────────────

const DEFAULT_PROFILE: TransformationProfile = {
  startDate: '2026-05-05',
  startWeight: 90.0,
  targetWeight: 80.0,
  startWaist: 97,
  targetWaist: 86,
  dailyCalories: 2100,
  dailyProtein: 180,
  dailyWaterL: 3,
  bedtimeTarget: '22:30',
  phase: 1,
  phaseName: 'FOUNDATION',
};

// ─── localStorage helpers ─────────────────────────────────────────────────────

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useProfile() {
  const [profile, setProfileState] = useState<TransformationProfile>(() =>
    readLS('pm_profile', DEFAULT_PROFILE)
  );

  const setProfile = useCallback((updates: Partial<TransformationProfile>) => {
    setProfileState(prev => {
      const next = { ...prev, ...updates };
      writeLS('pm_profile', next);
      return next;
    });
  }, []);

  return { profile, setProfile };
}

export function useDailyLogs() {
  const [logs, setLogsState] = useState<DailyLog[]>(() =>
    readLS('pm_daily_logs', [])
  );

  const today = new Date().toISOString().slice(0, 10);

  const todayLog: DailyLog = logs.find(l => l.date === today) ?? {
    date: today,
    gymDone: false,
    walkDone: false,
    walkKm: 0,
    walkSteps: 0,
    proteinHit: false,
    waterHit: false,
    caloriesHit: false,
    supplementsDone: false,
    bedtimeHit: false,
    photoDone: false,
    notes: '',
  };

  const upsertLog = useCallback((updates: Partial<DailyLog>) => {
    setLogsState(prev => {
      const existing = prev.find(l => l.date === today);
      const next: DailyLog = existing ? { ...existing, ...updates } : { ...todayLog, ...updates };
      const filtered = prev.filter(l => l.date !== today);
      const updated = [...filtered, next];
      writeLS('pm_daily_logs', updated);
      return updated;
    });
  }, [today]); // eslint-disable-line react-hooks/exhaustive-deps

  return { logs, todayLog, upsertLog };
}

export function useBodyLogs() {
  const [logs, setLogsState] = useState<BodyLog[]>(() =>
    readLS('pm_body_logs', [])
  );

  const addLog = useCallback((entry: BodyLog) => {
    setLogsState(prev => {
      const filtered = prev.filter(l => l.date !== entry.date);
      const next = [...filtered, entry].sort((a, b) => a.date.localeCompare(b.date));
      writeLS('pm_body_logs', next);
      return next;
    });
  }, []);

  const latest = logs.length > 0 ? logs[logs.length - 1] : null;

  return { logs, addLog, latest };
}

export function useWorkoutSessions() {
  const [sessions, setSessionsState] = useState<WorkoutSession[]>(() =>
    readLS('pm_workout_sessions', [])
  );

  const addSession = useCallback((session: WorkoutSession) => {
    setSessionsState(prev => {
      const next = [...prev, session];
      writeLS('pm_workout_sessions', next);
      return next;
    });
  }, []);

  const latestByTemplate = (template: WorkoutSession['template']): WorkoutSession | null => {
    const filtered = sessions.filter(s => s.template === template);
    return filtered.length > 0 ? filtered[filtered.length - 1] : null;
  };

  return { sessions, addSession, latestByTemplate };
}

export function useWalkLogs() {
  const [logs, setLogsState] = useState<WalkLog[]>(() =>
    readLS('pm_walk_logs', [])
  );

  const today = new Date().toISOString().slice(0, 10);

  const addLog = useCallback((entry: WalkLog) => {
    setLogsState(prev => {
      const filtered = prev.filter(l => l.date !== entry.date);
      const next = [...filtered, entry].sort((a, b) => a.date.localeCompare(b.date));
      writeLS('pm_walk_logs', next);
      return next;
    });
  }, []);

  const streak = (() => {
    let count = 0;
    const d = new Date(today);
    while (true) {
      const ds = d.toISOString().slice(0, 10);
      if (logs.some(l => l.date === ds)) { count++; d.setDate(d.getDate() - 1); }
      else break;
    }
    return count;
  })();

  const weekTotal = logs
    .filter(l => {
      const d = new Date(today);
      d.setDate(d.getDate() - d.getDay()); // start of week
      return l.date >= d.toISOString().slice(0, 10);
    })
    .reduce((sum, l) => sum + l.distanceKm, 0);

  return { logs, addLog, streak, weekTotal };
}

export function useSleepLogs() {
  const [logs, setLogsState] = useState<SleepLog[]>(() =>
    readLS('pm_sleep_logs', [])
  );

  const today = new Date().toISOString().slice(0, 10);

  const addLog = useCallback((entry: SleepLog) => {
    setLogsState(prev => {
      const filtered = prev.filter(l => l.date !== entry.date);
      const next = [...filtered, entry].sort((a, b) => a.date.localeCompare(b.date));
      writeLS('pm_sleep_logs', next);
      return next;
    });
  }, []);

  const lastNight = logs.find(l => {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return l.date === yesterday.toISOString().slice(0, 10);
  }) ?? null;

  const avgQuality = logs.length > 0
    ? (logs.slice(-7).reduce((s, l) => s + l.quality, 0) / Math.min(logs.length, 7)).toFixed(1)
    : null;

  return { logs, addLog, lastNight, avgQuality };
}

export function useSupplementLogs() {
  const [logs, setLogsState] = useState<SupplementLog[]>(() =>
    readLS('pm_supplement_logs', [])
  );

  const today = new Date().toISOString().slice(0, 10);

  const todayLog: SupplementLog = logs.find(l => l.date === today) ?? {
    date: today,
    creatine: false,
    protein: false,
    preworkout: false,
    electrolytes: false,
    magnesium: false,
  };

  const upsertLog = useCallback((updates: Partial<SupplementLog>) => {
    setLogsState(prev => {
      const existing = prev.find(l => l.date === today);
      const next: SupplementLog = existing ? { ...existing, ...updates } : { ...todayLog, ...updates };
      const filtered = prev.filter(l => l.date !== today);
      const updated = [...filtered, next];
      writeLS('pm_supplement_logs', updated);
      return updated;
    });
  }, [today]); // eslint-disable-line react-hooks/exhaustive-deps

  return { logs, todayLog, upsertLog };
}

// ─── Derived helpers ──────────────────────────────────────────────────────────

export function getDayAndWeek(startDate: string): { day: number; week: number } {
  const start = new Date(startDate);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  return {
    day: diffDays + 1,
    week: Math.ceil((diffDays + 1) / 7),
  };
}

export function getWeeklyCompliance(dailyLogs: DailyLog[]): number {
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekStartStr = weekStart.toISOString().slice(0, 10);

  const thisWeek = dailyLogs.filter(l => l.date >= weekStartStr);
  if (thisWeek.length === 0) return 0;

  const fields: (keyof DailyLog)[] = ['gymDone', 'walkDone', 'proteinHit', 'waterHit', 'caloriesHit', 'supplementsDone', 'bedtimeHit'];
  let total = 0, hit = 0;
  thisWeek.forEach(log => {
    fields.forEach(f => {
      total++;
      if (log[f]) hit++;
    });
  });
  return total > 0 ? Math.round((hit / total) * 100) : 0;
}

export function getTodayScore(log: DailyLog): { score: number; total: number } {
  const fields: (keyof DailyLog)[] = ['gymDone', 'walkDone', 'proteinHit', 'waterHit', 'caloriesHit', 'supplementsDone', 'bedtimeHit'];
  const score = fields.filter(f => log[f]).length;
  return { score, total: fields.length };
}

export const DAILY_QUOTES = [
  "Champions are made in the moments no one is watching.",
  "You don't rise to the level of your goals — you fall to the level of your systems.",
  "Every rep is a vote for the man you're becoming.",
  "Discipline is the bridge between goals and accomplishment.",
  "The body achieves what the mind believes.",
  "Strong dad. Strong family. Build it daily.",
  "Progress, not perfection. Show up.",
  "Your future self is watching. Make him proud.",
  "One day or day one. You decide.",
  "Be the dad your kids brag about.",
  "Pain is temporary. A strong body lasts years.",
  "No alarm needed when your purpose wakes you up.",
];

export function getTodayQuote(): string {
  const day = Math.floor(Date.now() / 86400000);
  return DAILY_QUOTES[day % DAILY_QUOTES.length];
}
