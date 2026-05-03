import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock, Lock as LockIcon, Eye, EyeOff, ChevronRight } from 'lucide-react';

import {
  useProfile, useDailyLogs, useBodyLogs, useWorkoutSessions,
  useWalkLogs, useSleepLogs, useSupplementLogs,
  getTodayQuote, type DailyLog, type SupplementLog,
} from '../../lib/playerModeStore';

import HeroSection from './HeroSection';
import DailyChecklist from './DailyChecklist';
import WeeklyScorecard from './WeeklyScorecard';
import GymTracker from './GymTracker';
import WalkTracker from './WalkTracker';
import BodyTracker from './BodyTracker';
import SleepTracker from './SleepTracker';
import SupplementSchedule from './SupplementSchedule';
import NutritionHub from './NutritionHub';
import MotivationVault from './MotivationVault';

import '../../styles/player-mode.css';

// Passcode stored as base64 — not real security, just obscurity for a private personal page
const PASSCODE_HASH = btoa('Pendles10');
const LOCK_KEY = 'pm_unlocked';

function checkUnlocked(): boolean {
  try { return localStorage.getItem(LOCK_KEY) === PASSCODE_HASH; }
  catch { return false; }
}

function setUnlocked(val: boolean) {
  try {
    if (val) localStorage.setItem(LOCK_KEY, PASSCODE_HASH);
    else localStorage.removeItem(LOCK_KEY);
  } catch {}
}

// ─── Lock screen ─────────────────────────────────────────────────────────────

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [input, setInput] = useState('');
  const [err, setErr] = useState('');
  const [show, setShow] = useState(false);

  function attempt() {
    if (btoa(input) === PASSCODE_HASH) {
      setUnlocked(true);
      onUnlock();
    } else {
      setErr('Incorrect passcode');
      setInput('');
      setTimeout(() => setErr(''), 2000);
    }
  }

  return (
    <div className="pm-root">
      <motion.div
        className="pm-lock"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="pm-lock__icon">
          <LockIcon size={28} color="var(--pm-blue)" strokeWidth={1.5} />
        </div>
        <h1 className="pm-lock__title">Player Mode</h1>
        <p className="pm-lock__sub">Private access only</p>

        <div style={{ position: 'relative', width: '100%', maxWidth: 280 }}>
          <input
            className="pm-lock__input"
            type={show ? 'text' : 'password'}
            placeholder="Passcode"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && attempt()}
            autoComplete="off"
            spellCheck={false}
            style={{ paddingRight: 48 }}
          />
          <button
            onClick={() => setShow(s => !s)}
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--pm-muted)', padding: 4 }}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        <button className="pm-lock__btn" onClick={attempt} style={{ maxWidth: 280, width: '100%' }}>
          Unlock
        </button>
        <div className="pm-lock__err">{err}</div>
      </motion.div>
    </div>
  );
}

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS = [
  { id: 'today',      label: 'Today' },
  { id: 'gym',        label: 'Gym' },
  { id: 'walk',       label: 'Walk' },
  { id: 'body',       label: 'Body' },
  { id: 'sleep',      label: 'Sleep' },
  { id: 'food',       label: 'Food & Supps' },
  { id: 'motivation', label: 'Motivation' },
] as const;

type TabId = typeof TABS[number]['id'];

// ─── Main dashboard ───────────────────────────────────────────────────────────

function Dashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('today');

  const { profile } = useProfile();
  const { logs: dailyLogs, todayLog, upsertLog } = useDailyLogs();
  const { logs: bodyLogs, addLog: addBodyLog, latest: latestBody } = useBodyLogs();
  const { sessions, addSession } = useWorkoutSessions();
  const { logs: walkLogs, addLog: addWalkLog, streak, weekTotal } = useWalkLogs();
  const { logs: sleepLogs, addLog: addSleepLog, lastNight, avgQuality } = useSleepLogs();
  const { todayLog: suppLog, upsertLog: upsertSupp } = useSupplementLogs();

  const handleCheckToggle = useCallback((key: keyof DailyLog) => {
    upsertLog({ [key]: !todayLog[key] });
  }, [todayLog, upsertLog]);

  const handleSuppToggle = useCallback((key: keyof SupplementLog) => {
    upsertSupp({ [key]: !suppLog[key] });
  }, [suppLog, upsertSupp]);

  function handleLock() {
    setUnlocked(false);
    window.location.reload();
  }

  const todayMission = [
    profile.phase === 1 ? 'Foundation week — build the habits' : `Phase ${profile.phase} — ${profile.phaseName}`,
    'Gym: Complete today\'s scheduled session',
    `Walk: Hit your ${5}km target`,
    `Protein: ${profile.dailyProtein}g minimum`,
    `Bed by ${profile.bedtimeTarget}`,
  ];

  return (
    <div className="pm-root">
      {/* Top bar */}
      <div className="pm-topbar">
        <button className="pm-topbar__back" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
          App
        </button>
        <div className="pm-topbar__brand">Player Mode</div>
        <button className="pm-topbar__lock" onClick={handleLock}>
          <Lock size={13} />
          Lock
        </button>
      </div>

      <div className="pm-page">
        {/* Hero */}
        <HeroSection profile={profile} latestBody={latestBody} dailyLogs={dailyLogs} />

        {/* Today's mission */}
        <div className="pm-mission">
          <div className="pm-mission__header">
            <div className="pm-mission__title">Today's Mission</div>
          </div>
          <ul className="pm-mission__items">
            {todayMission.map((item, i) => (
              <li key={i} className="pm-mission__item">
                <div className="pm-mission__item-dot" />
                {item}
              </li>
            ))}
          </ul>
          <div className="pm-mission__quote">"{getTodayQuote()}"</div>
        </div>

        {/* Tab bar */}
        <div className="pm-tabs" style={{ marginTop: 14 }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`pm-tab${activeTab === tab.id ? ' pm-tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            {activeTab === 'today' && (
              <div className="pm-section">
                <DailyChecklist log={todayLog} onToggle={handleCheckToggle} />
                <WeeklyScorecard
                  dailyLogs={dailyLogs}
                  walkLogs={walkLogs}
                  sleepLogs={sleepLogs}
                  bodyLogs={bodyLogs}
                  workoutSessions={sessions}
                />
                {/* Quick jump cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="pm-section-header">
                    <div className="pm-section-title">Quick Access</div>
                  </div>
                  {[
                    { tab: 'gym' as TabId, label: 'Gym Tracker', sub: 'Log a session, track PBs' },
                    { tab: 'walk' as TabId, label: 'Walk Tracker', sub: `${streak} day streak · ${weekTotal.toFixed(1)}km this week` },
                    { tab: 'body' as TabId, label: 'Body Progress', sub: latestBody ? `Last: ${latestBody.weightKg}kg` : 'Log first weight' },
                    { tab: 'sleep' as TabId, label: 'Sleep Log', sub: lastNight ? 'Last night logged' : 'Log last night' },
                  ].map(item => (
                    <button
                      key={item.tab}
                      onClick={() => setActiveTab(item.tab)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 14, background: 'var(--pm-card)', border: '1px solid var(--pm-border)', cursor: 'pointer', textAlign: 'left' }}
                    >
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--pm-text)' }}>{item.label}</div>
                        <div style={{ fontSize: 12, color: 'var(--pm-muted)', marginTop: 2 }}>{item.sub}</div>
                      </div>
                      <ChevronRight size={16} color="var(--pm-faint)" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'gym' && (
              <div className="pm-section">
                <GymTracker sessions={sessions} onAddSession={addSession} />
              </div>
            )}

            {activeTab === 'walk' && (
              <div className="pm-section">
                <WalkTracker logs={walkLogs} streak={streak} weekTotal={weekTotal} onAdd={addWalkLog} />
              </div>
            )}

            {activeTab === 'body' && (
              <div className="pm-section">
                <BodyTracker logs={bodyLogs} profile={profile} onAdd={addBodyLog} />
              </div>
            )}

            {activeTab === 'sleep' && (
              <div className="pm-section">
                <SleepTracker logs={sleepLogs} lastNight={lastNight} avgQuality={avgQuality} onAdd={addSleepLog} />
              </div>
            )}

            {activeTab === 'food' && (
              <div className="pm-section">
                <SupplementSchedule log={suppLog} onToggle={handleSuppToggle} />
                <NutritionHub profile={profile} />
              </div>
            )}

            {activeTab === 'motivation' && (
              <div className="pm-section">
                <MotivationVault profile={profile} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Root export — handles lock gate ─────────────────────────────────────────

export default function PlayerModePage() {
  const [unlocked, setUnlocked] = useState(checkUnlocked);

  if (!unlocked) {
    return <LockScreen onUnlock={() => setUnlocked(true)} />;
  }

  return <Dashboard />;
}
